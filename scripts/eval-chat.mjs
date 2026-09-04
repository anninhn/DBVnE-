#!/usr/bin/env node
/**
 * Discovery Chat eval script — chạy gold questions qua AI, đo accuracy/recall.
 *
 * Spec 2026-07-24-discovery-chat (Group 4).
 *
 * Run: npm run eval:chat
 *
 * Output: eval/reports/<YYYY-MM-DD>.json + console summary
 *
 * Pure JS (no new deps). Reads .env.local.
 *
 * Từ 2026-09-04 script gọi **chính endpoint của app** (`POST /api/chat/discovery`)
 * thay vì tự dựng ngữ cảnh rồi gọi model. Trước đó nó có bản flatten riêng đọc toàn
 * bộ `metadata.yaml` — mà đường nạp toàn bộ đã bị xoá khỏi sản phẩm ở spec 005. Đo
 * một đường code không còn tồn tại thì kết quả không nói gì về sản phẩm, và tệ hơn
 * là nó vẫn chạy xanh nên không ai biết.
 *
 * Cần app đang chạy + PLATFORM_USER/PLATFORM_PASS trong .env.local.
 *   --base <url>   mặc định http://localhost:3000
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(__filename));

// ──────────────────────────────────────────────────────────────────────────────
// Env loading (reimplement dotenv cho .env.local)
// ──────────────────────────────────────────────────────────────────────────────

async function loadEnv() {
  try {
    const text = await readFile(path.join(ROOT, ".env.local"), "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        // Strip surrounding quotes
        let val = m[2];
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        process.env[m[1]] = val;
      }
    }
  } catch {
    console.warn("[eval] Không đọc được .env.local — env vars phải set manual");
  }
}
await loadEnv();

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────

const AI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const AI_MODEL = "gemini-2.5-flash";

const BASE = (() => {
  const i = process.argv.indexOf("--base");
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return (v ?? "http://localhost:3000").replace(/\/$/, "");
})();

const PLATFORM_USER = process.env.PLATFORM_USER;
const PLATFORM_PASS = process.env.PLATFORM_PASS;

const GH_OWNER = process.env.GITHUB_REPO_OWNER;
const GH_REPO = process.env.GITHUB_REPO_NAME;
const GH_BRANCH = process.env.GITHUB_REPO_BRANCH || "main";
const GH_TOKEN = process.env.GITHUB_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GH_OWNER || !GH_REPO) {
  console.error("[eval] Thiếu GITHUB_REPO_OWNER hoặc GITHUB_REPO_NAME");
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error("[eval] Thiếu GEMINI_API_KEY");
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────────────────────
// GitHub fetch
// ──────────────────────────────────────────────────────────────────────────────

function ghHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "vnexpress-eval",
    ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}),
  };
}

async function ghFetch(path) {
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.content) return null;
  return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
}

async function listSlugs() {
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/datasets?ref=${GH_BRANCH}`;
  const res = await fetch(url, {
    headers: { ...ghHeaders(), "Cache-Control": "no-cache" },
  });
  if (!res.ok) return [];
  const entries = await res.json();
  if (!Array.isArray(entries)) return [];
  return entries.filter((e) => e.type === "dir").map((e) => e.name);
}

// ──────────────────────────────────────────────────────────────────────────────
// Gọi chính endpoint của app (không dựng lại ngữ cảnh ở đây)
// ──────────────────────────────────────────────────────────────────────────────

const jar = new Map();

function saveCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

async function req(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: {
      ...(init.headers ?? {}),
      cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    },
  });
  saveCookies(res);
  return res;
}

async function login() {
  const { csrfToken } = await (await req(`${BASE}/api/auth/csrf`)).json();
  await req(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      username: PLATFORM_USER,
      password: PLATFORM_PASS,
      callbackUrl: BASE,
      json: "true",
    }),
  });
  const session = await (await req(`${BASE}/api/auth/session`)).json();
  if (!session?.user?.username) {
    throw new Error("Đăng nhập thất bại — kiểm tra PLATFORM_USER / PLATFORM_PASS");
  }
  return session.user.username;
}

/** Trả về `{ raw, contextChars }` — kích thước ngữ cảnh là thứ SC-001 đặt trần. */
async function askDiscovery(query) {
  const res = await req(`${BASE}/api/chat/discovery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  return { raw: text, contextChars: Number(res.headers.get("X-Context-Chars") ?? 0) };
}

function parseJSON(content) {
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned);
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

const goldPath = path.join(ROOT, "eval", "gold-questions.json");
const reportDir = path.join(ROOT, "eval", "reports");

const goldSet = JSON.parse(await readFile(goldPath, "utf-8"));

if (!PLATFORM_USER || !PLATFORM_PASS) {
  console.error(
    "Cần PLATFORM_USER / PLATFORM_PASS trong .env.local (script gọi API của app, API đòi đăng nhập).",
  );
  process.exit(2);
}

console.log(`[eval] ${goldSet.length} câu hỏi chuẩn, gọi qua ${BASE}`);
const who = await login();
console.log(`[eval] đăng nhập: ${who}`);
console.log("");

const contextSizes = [];

const results = [];
for (const item of goldSet) {
  process.stdout.write(`Q${item.id}: "${item.query.slice(0, 40)}..." `);
  const start = Date.now();
  let response;
  try {
    const { raw, contextChars } = await askDiscovery(item.query);
    if (contextChars > 0) contextSizes.push(contextChars);
    response = parseJSON(raw);
  } catch (err) {
    console.log(`FAIL (${err.message})`);
    results.push({
      ...item,
      ok: false,
      error: err.message,
      latency_ms: Date.now() - start,
    });
    continue;
  }

  const cited = (response.datasets ?? []).map((d) => d.slug);
  const expected = item.expected_dataset_slugs ?? [];
  const matchedExpected = expected.filter((s) => cited.includes(s));

  // CẢNH BÁO: cả 8 câu trong gold-questions.json đang có `expected_dataset_slugs: []`,
  // và với mảng rỗng thì hai công thức dưới đây suy biến — `accuracy` luôn bằng 1,
  // `recall` bằng 1 chỉ khi KHÔNG cite gì. Chúng không đo chất lượng tìm kiếm. Muốn
  // đo thật thì phải điền slug kỳ vọng cho từng câu trước. Xem docs/phase-2.md.
  //
  // Accuracy: % expected slugs được cite. Empty expected → 1 nếu trả OK
  const accuracy =
    expected.length > 0 ? matchedExpected.length / expected.length : 1;

  // Recall: % cited slugs match expected (penalize hallucinated slugs)
  const recall =
    cited.length > 0
      ? cited.filter((s) => expected.includes(s)).length / cited.length
      : expected.length === 0
        ? 1
        : 0;

  // Vietnamese compliance — crude check: nhiều từ 4+ ký tự English liên tiếp = fail
  const answerText = response.answer ?? "";
  const englishSentencePattern = /\b(?:the|is|are|was|were|this|that|with|from|have)\b/i;
  const vietnamese_ok = !englishSentencePattern.test(answerText);

  // Pattern check (if provided)
  let pattern_ok = true;
  if (item.expected_answer_pattern) {
    const re = new RegExp(item.expected_answer_pattern, "i");
    pattern_ok = re.test(answerText);
  }

  // Zero-match expected?
  let zero_match_ok = true;
  if (item.zero_match) {
    zero_match_ok = cited.length === 0;
  }

  results.push({
    ...item,
    ok: true,
    response_summary: answerText.slice(0, 150),
    cited,
    expected,
    accuracy,
    recall,
    vietnamese_ok,
    pattern_ok,
    zero_match_ok,
    latency_ms: Date.now() - start,
  });

  const status = item.zero_match
    ? zero_match_ok
      ? "ZERO-OK"
      : "ZERO-FAIL"
    : `acc=${accuracy.toFixed(2)}`;
  console.log(`${status} (${Date.now() - start}ms)`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Aggregate + report
// ──────────────────────────────────────────────────────────────────────────────

const total = results.length;
const successCount = results.filter((r) => r.ok).length;
const accuracyAvg =
  results.filter((r) => r.ok).reduce((s, r) => s + r.accuracy, 0) /
  Math.max(successCount, 1);
const recallAvg =
  results.filter((r) => r.ok).reduce((s, r) => s + r.recall, 0) /
  Math.max(successCount, 1);
const vietRate =
  results.filter((r) => r.ok && r.vietnamese_ok).length / Math.max(successCount, 1);
const patternRate =
  results.filter((r) => r.ok && r.pattern_ok).length / Math.max(successCount, 1);

const summary = {
  date: new Date().toISOString(),
  model: AI_MODEL,
  total,
  success_rate: successCount / total,
  avg_accuracy: accuracyAvg,
  avg_recall: recallAvg,
  vietnamese_compliance: vietRate,
  // Kích thước ngữ cảnh mỗi câu hỏi — trần của SC-001. Đây là chỉ số DUY NHẤT ở
  // đây so được giữa các lần chạy một cách có nghĩa; xem cảnh báo về
  // accuracy/recall ở trên và ở docs/phase-2.md.
  context_chars_avg: contextSizes.length
    ? Math.round(contextSizes.reduce((a, b) => a + b, 0) / contextSizes.length)
    : null,
  context_chars_max: contextSizes.length ? Math.max(...contextSizes) : null,
  pattern_match_rate: patternRate,
  results,
};

await mkdir(reportDir, { recursive: true });
const dateStr = new Date().toISOString().slice(0, 10);
const reportPath = path.join(reportDir, `${dateStr}.json`);
await writeFile(reportPath, JSON.stringify(summary, null, 2));

console.log("");
console.log("─── Summary ───");
console.log(`Total:        ${total}`);
console.log(`Success:      ${((successCount / total) * 100).toFixed(1)}%`);
console.log(`Avg accuracy: ${(accuracyAvg * 100).toFixed(1)}%  (vô nghĩa — xem chú thích trong file)`);
console.log(`Avg recall:   ${(recallAvg * 100).toFixed(1)}%  (vô nghĩa — xem chú thích trong file)`);
if (contextSizes.length) {
  const avg = Math.round(contextSizes.reduce((a, b) => a + b, 0) / contextSizes.length);
  console.log(`Ngữ cảnh:     ${avg} ký tự trung bình, cao nhất ${Math.max(...contextSizes)}`);
}
console.log(`Vietnamese:   ${(vietRate * 100).toFixed(1)}%`);
console.log(`Pattern:      ${(patternRate * 100).toFixed(1)}%`);
console.log(`Report:       ${path.relative(ROOT, reportPath)}`);

// Exit code: 0 if success_rate >= 70% AND vietnamese >= 95%
const PASS_SUCCESS = 0.7;
const PASS_VIETNAMESE = 0.95;
if (successCount / total < PASS_SUCCESS) {
  console.error(
    `\n[eval] FAIL — success rate ${(successCount / total) * 100}% < ${PASS_SUCCESS * 100}%`,
  );
  process.exit(1);
}
if (vietRate < PASS_VIETNAMESE) {
  console.error(
    `\n[eval] WARN — Vietnamese compliance ${(vietRate * 100).toFixed(1)}% < ${PASS_VIETNAMESE * 100}%`,
  );
}
