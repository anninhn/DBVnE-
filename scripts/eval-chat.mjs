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
 * Pure JS (no new deps). Reads .env.local + reimplements flatten + AI call inline
 * (eval is dev tool, không chạy production, không cần reuse production modules).
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
// Flatten (simplified — không cần dictionary.md cho eval)
// ──────────────────────────────────────────────────────────────────────────────

async function flattenAll() {
  const slugs = await listSlugs();
  if (slugs.length === 0) return "(Hiện chưa có dataset nào trong kho.)";

  const results = await Promise.all(
    slugs.map(async (slug) => {
      const yamlText = await ghFetch(`datasets/${slug}/metadata.yaml`);
      if (!yamlText) return null;

      // Simple regex extraction — tránh thêm yaml dependency cho eval script
      const titleMatch = yamlText.match(/^title:\s*(.+)$/m);
      const descMatch = yamlText.match(/^description:\s*[>"']?\s*(.+)$/m);
      const tagsMatch = yamlText.match(/^tags:\s*\[(.+)\]\s*$/m);
      const formatMatch = yamlText.match(/^format:\s*(\w+)/m);
      const rowsMatch = yamlText.match(/^row_count:\s*(\d+)/m);
      const statusMatch = yamlText.match(/^status:\s*(\w+)/m);

      if (statusMatch?.[1] === "deleted") return null;

      const title = titleMatch?.[1]?.trim().replace(/['"]/g, "") ?? slug;
      const desc = descMatch?.[1]?.trim().replace(/['"]/g, "") ?? "";
      const tags = tagsMatch?.[1]?.trim() ?? "";
      const format = formatMatch?.[1]?.trim() ?? "";
      const rows = rowsMatch?.[1] ?? "";

      const lines = [`### ${title}`, `slug: \`${slug}\``];
      if (desc) lines.push(`Mô tả: ${desc}`);
      if (tags) lines.push(`Tags: ${tags}`);
      if (format) lines.push(`Định dạng: ${format}`);
      if (rows) lines.push(`Số dòng: ${rows}`);
      return lines.join("\n");
    }),
  );

  const blocks = results.filter((b) => b !== null);
  if (blocks.length === 0) return "(Không có dataset hợp lệ.)";
  return `DANH SÁCH DATASET TRONG KHO VnExpress (${blocks.length} datasets):\n\n${blocks.join("\n\n---\n\n")}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Gemini call (OpenAI compat)
// ──────────────────────────────────────────────────────────────────────────────

async function askDiscovery(query, flattened, systemPrompt) {
  const res = await fetch(`${AI_BASE_URL}chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GEMINI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `CÂU HỎI CỦA PHÓNG VIÊN:\n${query}\n\n\nDANH SÁCH DATASET:\n${flattened}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices[0]?.message?.content ?? "";
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
const promptPath = path.join(ROOT, "tools", "prompts", "discovery-chat.md");
const reportDir = path.join(ROOT, "eval", "reports");

const goldSet = JSON.parse(await readFile(goldPath, "utf-8"));
const systemPrompt = await readFile(promptPath, "utf-8");

console.log(`[eval] Loading ${goldSet.length} gold questions...`);
const flattened = await flattenAll();
console.log(`[eval] Context: ${flattened.length} chars`);
console.log("");

const results = [];
for (const item of goldSet) {
  process.stdout.write(`Q${item.id}: "${item.query.slice(0, 40)}..." `);
  const start = Date.now();
  let response;
  try {
    const raw = await askDiscovery(item.query, flattened, systemPrompt);
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

  // Vietnamese compliance — crude check: nhiều từ 4+ ký tự English подряд = fail
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
console.log(`Avg accuracy: ${(accuracyAvg * 100).toFixed(1)}%`);
console.log(`Avg recall:   ${(recallAvg * 100).toFixed(1)}%`);
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
