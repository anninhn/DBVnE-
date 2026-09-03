#!/usr/bin/env node
/**
 * Bulk upload CSV Cục Thống kê (NSO) — đi đúng luồng Upload Wizard.
 *
 * Mỗi dataset chạy hết 3 endpoint như wizard: presign → PUT R2 → analyze → commit.
 * `analyze` GỌI AI thật (Gemini) để sinh description + Data Dictionary, vì chất
 * lượng chữ của prompt `tools/prompts/dataset-reviewer-tabular.md` tốt hơn mô tả
 * sinh bằng template.
 *
 * Input: thư mục đã chạy `data/scripts/nso_pxweb_to_tidy.py`, có manifest.json.
 * CSV thô của NSO KHÔNG upload trực tiếp được — tiêu đề nằm ở dòng 1 nên parser
 * lấy nó làm header, ra dataset 1 cột (src/lib/ai/inspect/csv.ts).
 *
 * Giới hạn quyết định nhịp chạy:
 *   - GitHub REST 5.000 call/giờ, mỗi `commit` tốn ~9 call (src/lib/git/commit.ts)
 *     → tối đa ~550 dataset/giờ. Đây là trần thật khi dùng key AI trả tiền.
 *   - Với key Gemini free tier (250 req/day) thì AI mới là trần: chạy với
 *     `--delay 7000 --ai-budget 240`, 483 file mất ~2 ngày.
 *
 * An toàn:
 *   - Dry-run là mặc định. Phải có `--apply` mới ghi thật.
 *   - Slug đã tồn tại thì SKIP, không ghi đè. `commit` gặp slug trùng sẽ tự thêm
 *     `-2`, `-3` mà không báo lỗi — đúng cách 3 bản `hien-trang-rung-*` trùng nhau
 *     đã sinh ra. Check trước là cách duy nhất chặn.
 *   - Checkpoint sau mỗi dataset, chạy lại là tiếp từ chỗ dừng.
 *
 * Chạy với `--env-file=.env.local` để lấy GITHUB_TOKEN (dò slug đã xoá mềm) và
 * PLATFORM_USER/PLATFORM_PASS nếu bạn đặt sẵn trong đó — mật khẩu không lọt vào shell history.
 *
 * Usage:
 *   node --env-file=.env.local tools/bulk-upload-nso.mjs --dir /tmp/nso_pilot
 *   node --env-file=.env.local tools/bulk-upload-nso.mjs --dir /tmp/nso_pilot --apply --limit 3
 *
 * Flags:
 *   --dir <path>     thư mục chứa manifest.json + CSV đã transform  (bắt buộc)
 *   --base <url>     base URL của app                               (mặc định http://localhost:3000)
 *   --apply          ghi thật; thiếu cờ này là dry-run
 *   --limit <n>      chỉ xử lý n dataset đầu còn lại
 *   --delay <ms>     nghỉ giữa 2 dataset                            (mặc định 1200)
 *   --ai-budget <n>  số lần gọi AI tối đa trong lượt chạy           (mặc định 1000)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const args = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const DIR = flag("dir");
const BASE = (flag("base", "http://localhost:3000")).replace(/\/$/, "");
const APPLY = has("apply");
const LIMIT = Number(flag("limit", "0")) || Infinity;
// Mặc định cho key TRẢ TIỀN: rate limit cao, không có hạn 250 req/ngày như free
// tier. Nghỉ 1,2s giữa các file chỉ để không dồn cục lên GitHub API (mỗi commit
// ~9 call, trần 5.000/giờ). Dùng key free thì đặt lại `--delay 7000 --ai-budget 240`.
const DELAY_MS = Number(flag("delay", "1200"));
const AI_BUDGET = Number(flag("ai-budget", "1000"));

// Tài khoản đăng nhập CỦA PLATFORM (datasets/_users/users.json), không phải
// tài khoản nào của Cục Thống kê — script chỉ đọc file CSV đã tải về sẵn.
const USER = process.env.PLATFORM_USER;
const PASS = process.env.PLATFORM_PASS;

// Nguồn ghi cứng: prompt cấm AI đoán source ("Không bịa source" → trả "unknown"
// + confidence low). Ở đây ta biết chắc vì file lấy từ thư mục NSO trên Drive.
const SOURCE_NAME = "Cục Thống kê (NSO)";
const SOURCE_URL = "https://www.nso.gov.vn/";

// Phải khớp CATEGORY_LABELS (src/lib/types/dataset.ts). AI đôi khi trả về một
// giá trị ngoài danh sách — đo thực tế 2026-08-27: 1 dataset nhận
// `category: "lao-dong"` (đó là tag, không phải category). Hệ quả im lặng:
// dataset không bao giờ hiện trong filter Category, đúng bug đã ghi ở
// dataset.ts:146. Không chốt chặn thì mỗi lô lại lọt vài cái.
const VALID_CATEGORIES = new Set([
  "kinh-te", "dan-so", "xa-hoi", "giao-duc", "y-te",
  "moi-truong", "chinh-tri", "khi-hau", "ha-tang", "khac",
]);

if (!DIR) {
  console.error("Thiếu --dir. Xem hướng dẫn ở đầu file.");
  process.exit(2);
}
// Dry-run chỉ đọc manifest + GET /api/datasets (endpoint không protected, xem
// authorized() trong src/auth.config.ts) → không cần credential. Chỉ `--apply`
// mới phải đăng nhập vì presign/analyze/commit đều gọi requireUserOr401.
if (APPLY && (!USER || !PASS)) {
  console.error(
    "--apply cần PLATFORM_USER / PLATFORM_PASS (tài khoản đăng nhập platform).\n" +
    "Cách gọn nhất: thêm 2 dòng vào .env.local rồi chạy với --env-file=.env.local\n" +
    "  PLATFORM_USER=<tên đăng nhập>\n" +
    "  PLATFORM_PASS=<mật khẩu>\n" +
    "Cách này giữ mật khẩu ngoài shell history."
  );
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ──────────────────────────────────────────────────────────────────────────────
// Cookie jar tối giản — NextAuth trả session token qua Set-Cookie
// ──────────────────────────────────────────────────────────────────────────────

const jar = new Map();

function saveCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function req(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers ?? {}), cookie: cookieHeader() },
  });
  saveCookies(res);
  return res;
}

async function login() {
  const csrfRes = await req(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();

  const body = new URLSearchParams({
    csrfToken,
    username: USER,
    password: PASS,
    callbackUrl: BASE,
    json: "true",
  });
  await req(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const session = await (await req(`${BASE}/api/auth/session`)).json();
  if (!session?.user?.username) {
    throw new Error("Đăng nhập thất bại — kiểm tra PLATFORM_USER / PLATFORM_PASS");
  }
  return session.user.username;
}

// ──────────────────────────────────────────────────────────────────────────────
// Slug đã dùng — PHẢI tính cả dataset đã xoá mềm
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Đọc trực tiếp datasets/index.json qua GitHub Contents API.
 *
 * Không dùng GET /api/datasets được: `listDatasets()` lọc bỏ entry
 * `status: "deleted"` (src/lib/datasets/list.ts). Mà soft delete GIỮ NGUYÊN
 * `datasets/<slug>/metadata.yaml` (src/app/api/dataset/delete/route.ts) — nên
 * slug đã xoá vẫn chiếm chỗ: `resolveUniqueSlug` thấy folder còn đó và âm thầm
 * đặt `<slug>-2`. Đo thực tế 2026-08-27: 17 slug sống nhưng 22 slug đã chiếm.
 *
 * Cần GITHUB_TOKEN + GITHUB_REPO_* → chạy bằng `node --env-file=.env.local`.
 */
async function fetchExistingSlugs() {
  const { GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME } = process.env;
  const branch = process.env.GITHUB_REPO_BRANCH || "main";

  if (GITHUB_TOKEN && GITHUB_REPO_OWNER && GITHUB_REPO_NAME) {
    const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/datasets/index.json?ref=${branch}`;
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: "application/vnd.github.raw" },
    });
    if (res.ok) {
      const index = await res.json();
      const entries = Array.isArray(index) ? index : (index.datasets ?? []);
      return {
        existing: new Set(entries.map((e) => e.slug)),
        // Tên file CSV đã nằm trong R2, lấy từ r2_key dạng `<uuid>/<filename>`.
        // Đối chiếu theo slug KHÔNG đủ: `resolveUniqueSlug` của app tự thêm hậu
        // tố `-2` khi trùng, nên slug trong kho lệch với slug script sinh ra —
        // chạy lại sẽ upload trùng. Tên file thì cố định theo file nguồn.
        uploadedFiles: new Set(
          entries.flatMap((e) =>
            (e.resources ?? [])
              .map((r) => (r.r2_key ?? "").split("/").pop())
              .filter(Boolean)
          )
        ),
        source: "index.json (gồm cả slug đã xoá mềm)",
      };
    }
    console.warn(`  ! đọc index.json thất bại HTTP ${res.status} — quay về /api/datasets`);
  } else {
    console.warn("  ! thiếu GITHUB_TOKEN/GITHUB_REPO_* — quay về /api/datasets");
  }

  const list = await (await req(`${BASE}/api/datasets`)).json();
  console.warn("  ! CẢNH BÁO: nguồn này KHÔNG thấy slug đã xoá mềm → có thể tạo ra slug -2");
  return {
    existing: new Set(list.map((d) => d.slug)),
    uploadedFiles: new Set(
      list.flatMap((d) =>
        (d.resources ?? []).map((r) => (r.file_url ?? "").split("/").pop()).filter(Boolean)
      )
    ),
    source: "/api/datasets",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Một dataset: presign → PUT → analyze → commit
// ──────────────────────────────────────────────────────────────────────────────

async function jsonPost(endpoint, payload) {
  const res = await req(`${BASE}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${endpoint} trả về không phải JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}: ${data.error ?? text.slice(0, 200)}`);
  return data;
}

async function uploadOne(entry, dir) {
  const filePath = path.join(dir, entry.output_file);
  const buffer = readFileSync(filePath);

  // 1. presign
  const { presignedUrl, fileId, r2Key } = await jsonPost("/api/upload/presign", {
    filename: entry.output_file,
    contentType: "text/csv",
    size: buffer.length,
  });

  // 2. PUT lên R2 — presigned URL, không gửi cookie
  const put = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "content-type": "text/csv" },
    body: buffer,
  });
  if (!put.ok) throw new Error(`PUT R2 thất bại HTTP ${put.status}`);

  // 3. analyze — AI sinh metadata + dictionary (đúng prompt wizard đang dùng)
  const { proposal, filePreview } = await jsonPost("/api/upload/analyze", {
    fileId,
    r2Key,
    filename: entry.output_file,
  });
  if (!proposal?.metadata || !Array.isArray(proposal.dictionary)) {
    throw new Error("AI không trả đủ metadata + dictionary");
  }

  const aiCategory = proposal.metadata.category;
  const category = VALID_CATEGORIES.has(aiCategory) ? aiCategory : "khac";

  // 4. commit — giữ nguyên chữ của AI, chỉ ghi đè nguồn (AI bị cấm đoán source)
  const committed = await jsonPost("/api/upload/commit", {
    fileId,
    r2Key,
    custom_slug: entry.slug,
    metadata: {
      ...proposal.metadata,
      category,
      source: SOURCE_NAME,
      source_url: SOURCE_URL,
      confidence: "high",
      format: "csv",
      filename: entry.output_file,
      row_count: filePreview.rowCount,
      columns_count: filePreview.columnCount,
    },
    dictionary: proposal.dictionary,
    column_stats: filePreview.columnStats,
  });

  return {
    slug: committed.slug,
    title: proposal.metadata.title,
    category,
    badCategory: category === aiCategory ? null : aiCategory,
    tags: proposal.metadata.tags,
    description: proposal.metadata.description,
    questions: proposal.questions ?? [],
    commitSha: committed.commitSha,
  };
}

// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const dir = path.resolve(DIR);
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const statePath = path.join(dir, ".bulk-upload-state.json");
  const prev = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
  // `done` là checkpoint, phải giữ qua các lượt. `skipped`/`failed` thì reset:
  // cộng dồn khiến bản tổng kết báo lại lỗi của lượt trước như thể vừa xảy ra —
  // đo thực tế 2026-08-27: lượt sạch 150/150 vẫn in "17 lỗi" của lượt đầu.
  const state = { done: prev.done ?? [], skipped: [], failed: [], failedHistory: prev.failedHistory ?? [] };
  if ((prev.failed ?? []).length) {
    state.failedHistory.push(...prev.failed);
    console.log(`(${prev.failed.length} lỗi của lượt trước đã chuyển vào failedHistory)`);
  }

  console.log(`chế độ     : ${APPLY ? "APPLY — ghi thật" : "DRY-RUN — không ghi gì"}`);
  if (APPLY) {
    console.log(`đăng nhập  : ${await login()}`);
  }

  const { existing, uploadedFiles, source } = await fetchExistingSlugs();
  console.log(`kho hiện có: ${existing.size} slug đã dùng (nguồn: ${source})`);

  const doneFiles = new Set(state.done.map((d) => d.file).filter(Boolean));
  const todo = manifest.datasets.filter(
    (e) => !doneFiles.has(e.output_file) && !uploadedFiles.has(e.output_file)
  );
  console.log(`còn phải làm: ${todo.length}/${manifest.datasets.length}\n`);

  let aiCalls = 0;
  let n = 0;
  const badCategories = [];
  for (const entry of todo) {
    if (n >= LIMIT) {
      console.log(`\n→ dừng: đạt --limit ${LIMIT}`);
      break;
    }
    if (aiCalls >= AI_BUDGET) {
      console.log(`\n→ dừng: đã dùng ${aiCalls} lượt AI (hạn ngày ${AI_BUDGET}). Chạy lại mai.`);
      break;
    }

    if (uploadedFiles.has(entry.output_file)) {
      console.log(`SKIP  ${entry.slug} — file ${entry.output_file} đã upload rồi`);
      state.skipped.push({ slug: entry.slug, reason: "file đã upload" });
      continue;
    }
    if (existing.has(entry.slug)) {
      console.log(`SKIP  ${entry.slug} — slug đã có trong kho`);
      state.skipped.push({ slug: entry.slug, reason: "slug đã tồn tại" });
      continue;
    }

    n += 1;
    const label = `[${n}/${Math.min(todo.length, LIMIT)}] ${entry.slug.slice(0, 52)}`;

    if (!APPLY) {
      console.log(`DRY   ${label} ← ${entry.output_file} (${entry.row_count} rows)`);
      continue;
    }

    try {
      const res = await uploadOne(entry, dir);
      aiCalls += 1;
      state.done.push({
        slug: res.slug,
        file: entry.output_file, // khoá đối chiếu bền hơn slug
        commitSha: res.commitSha,
        title: res.title,
      });
      console.log(`OK    ${label}`);
      console.log(`      title    : ${res.title}`);
      console.log(`      category : ${res.category} | tags: ${(res.tags ?? []).join(", ")}`);
      if (res.badCategory) {
        badCategories.push({ slug: res.slug, ai: res.badCategory });
        console.log(`      ! AI trả category "${res.badCategory}" không hợp lệ → đổi thành "khac"`);
      }
      if (res.questions.length) {
        console.log(`      AI hỏi   : ${res.questions.join(" | ")}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      state.failed.push({ slug: entry.slug, error: msg });
      console.error(`FAIL  ${label}\n      ${msg}`);
      // Hết quota AI thì dừng cả lô — chạy tiếp chỉ tạo thêm lỗi
      if (/quota|429|RESOURCE_EXHAUSTED|hết quota/i.test(msg)) {
        console.error("\n→ dừng: AI hết quota.");
        break;
      }
    }

    writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
    if (n < todo.length) await sleep(DELAY_MS);
  }

  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
  console.log(`\nxong    : ${state.done.length} upload | ${state.skipped.length} skip | ${state.failed.length} lỗi`);
  console.log(`lượt AI : ${aiCalls}`);
  console.log(`state   : ${statePath}`);
  if (badCategories.length) {
    console.log(`\ncategory AI trả sai, đã đổi thành "khac" — nên sửa tay ${badCategories.length} dataset:`);
    for (const b of badCategories) console.log(`  - ${b.slug} (AI đề xuất "${b.ai}")`);
  }
  if (state.failed.length) {
    console.log("\nlỗi:");
    for (const f of state.failed.slice(-10)) console.log(`  - ${f.slug}: ${f.error.slice(0, 120)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
