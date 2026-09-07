#!/usr/bin/env node
/**
 * Tính lại `column_stats` + điền `coverage.temporal` cho toàn bộ dataset đã có.
 *
 * Vì sao cần chạy: 495 dataset trong kho được upload TRƯỚC khi ngưỡng lưu giá trị
 * cột nâng từ 12 lên 200 (spec 005, FR-038). Metadata của chúng chỉ giữ 12 giá
 * trị phổ biến nhất mỗi cột, mà không có dấu hiệu nào cho biết đã bị cắt — nên
 * câu hỏi "dataset nào có Đà Nẵng" trả lời sai theo chiều nguy hiểm nhất: nói
 * "không có" về một dataset thật ra có. Cùng lượt này điền luôn khoảng thời gian
 * (đang trống 495/495), vì cả hai đều cần đọc file CSV từ R2 — tách làm hai lượt
 * là trả tiền băng thông và thời gian hai lần cho đúng một dữ liệu.
 *
 * KHÔNG gọi AI. Description và Data Dictionary giữ nguyên từng chữ.
 *
 * Việc tính nằm ở `POST /api/dataset/recompute` chứ không ở script này — logic
 * đọc CSV (streaming, schema thập phân Frictionless) là TypeScript trong
 * `src/lib/ai/inspect/`. Chép nó sang đây là tạo bản thứ hai sẽ lệch dần với bản
 * thật, mà lệch ở đây nghĩa là số trong metadata khác số hiện trên trang dataset.
 *
 * An toàn:
 *   - Dry-run là mặc định. Phải có `--apply` mới commit.
 *   - Route từ chối ghi khi tính lại ra 0 cột trong khi metadata đang có cột
 *     (dấu hiệu file trong R2 đã bị thay tay) — script đếm vào mục "chặn".
 *   - Checkpoint sau mỗi dataset, chạy lại là tiếp từ chỗ dừng.
 *
 * Mỗi dataset = 1 commit (metadata.yaml + dictionary.md + index.json). GitHub
 * REST cho 5.000 call/giờ, mỗi commit ~9 call → trần ~550 dataset/giờ.
 *
 * Usage:
 *   node --env-file=.env.local tools/backfill-column-values.mjs
 *   node --env-file=.env.local tools/backfill-column-values.mjs --apply
 *   node --env-file=.env.local tools/backfill-column-values.mjs --apply --limit 5
 *
 * Flags:
 *   --base <url>   base URL của app                      (mặc định http://localhost:3000)
 *   --apply        ghi thật; thiếu cờ này là dry-run
 *   --limit <n>    chỉ xử lý n dataset đầu còn lại
 *   --delay <ms>   nghỉ giữa 2 dataset                   (mặc định 400)
 *   --slug <slug>  chỉ chạy đúng một dataset (để soi trước khi chạy cả kho)
 *   --reset        bỏ checkpoint, chạy lại từ đầu
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";

const args = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const BASE = flag("base", "http://localhost:3000").replace(/\/$/, "");
const APPLY = has("apply");
const LIMIT = Number(flag("limit", "0")) || Infinity;
const DELAY_MS = Number(flag("delay", "400"));
const ONE_SLUG = flag("slug");

const USER = process.env.PLATFORM_USER;
const PASS = process.env.PLATFORM_PASS;

const STATE_FILE = "/tmp/backfill-column-values.state.json";

if (has("reset") && existsSync(STATE_FILE)) {
  unlinkSync(STATE_FILE);
  console.log("Đã xoá checkpoint.");
}

// Route `recompute` gọi requireUserOr401 kể cả khi chỉ thử — nó đọc file từ R2,
// không phải endpoint công khai. Nên dry-run cũng phải đăng nhập.
if (!USER || !PASS) {
  console.error(
    "Cần PLATFORM_USER / PLATFORM_PASS (tài khoản đăng nhập platform).\n" +
    "Thêm 2 dòng vào .env.local rồi chạy với --env-file=.env.local:\n" +
    "  PLATFORM_USER=<tên đăng nhập>\n" +
    "  PLATFORM_PASS=<mật khẩu>\n" +
    "Cách này giữ mật khẩu ngoài shell history."
  );
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Cookie jar tối giản — NextAuth trả session token qua Set-Cookie ───────────

const jar = new Map();

function saveCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
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
  const { csrfToken } = await (await req(`${BASE}/api/auth/csrf`)).json();
  await req(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      username: USER,
      password: PASS,
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

// ── Checkpoint ────────────────────────────────────────────────────────────────

function loadState() {
  if (!existsSync(STATE_FILE)) return { done: [], failed: [] };
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { done: [], failed: [] };
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Chạy ──────────────────────────────────────────────────────────────────────

async function main() {
  const who = await login();
  console.log(`Đăng nhập: ${who} — ${APPLY ? "GHI THẬT" : "dry-run"}\n`);

  let slugs;
  if (ONE_SLUG) {
    slugs = [ONE_SLUG];
  } else {
    // `/api/datasets` đã lọc bỏ dataset xoá mềm — đúng thứ ta muốn ở đây, khác
    // với bulk-upload (nó phải thấy cả slug đã xoá vì slug vẫn bị chiếm chỗ).
    const list = await (await req(`${BASE}/api/datasets`)).json();
    if (!Array.isArray(list)) {
      throw new Error(`GET /api/datasets trả về không phải mảng: ${JSON.stringify(list).slice(0, 200)}`);
    }
    slugs = list.map((d) => d.slug);
  }

  const state = ONE_SLUG ? { done: [], failed: [] } : loadState();
  const doneSet = new Set(state.done);
  const todo = slugs.filter((s) => !doneSet.has(s)).slice(0, LIMIT);

  console.log(`${slugs.length} dataset trong kho, ${todo.length} cần xử lý lượt này.\n`);

  let changed = 0;
  let unchanged = 0;
  let blocked = 0;
  let skipped = 0;
  let failed = 0;
  let gainedValues = 0;
  let gainedTemporal = 0;
  let stillTruncated = 0;

  for (const [i, slug] of todo.entries()) {
    const prefix = `[${i + 1}/${todo.length}] ${slug}`;
    try {
      const res = await req(`${BASE}/api/dataset/recompute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, apply: APPLY }),
      });
      const out = await res.json();

      if (!res.ok) {
        // 409 = chốt chặn của route (tính lại ra 0 cột). Đây KHÔNG phải lỗi hạ
        // tầng — là dataset cần người xem, nên tách khỏi mục "lỗi".
        if (res.status === 409) {
          blocked++;
          console.log(`${prefix} — CHẶN: ${out.error}`);
        } else if (res.status === 413) {
          // File quá lớn để đọc lại — không phải lỗi, là quyết định có chủ ý.
          skipped++;
          console.log(`${prefix} — bỏ qua: ${out.error}`);
        } else {
          failed++;
          state.failed.push({ slug, error: out.error ?? res.status });
          console.log(`${prefix} — lỗi ${res.status}: ${out.error ?? ""}`);
        }
      } else if (!out.changed) {
        unchanged++;
        console.log(`${prefix} — không đổi`);
      } else {
        changed++;
        if (out.completeColumns > 0) gainedValues++;
        if (out.temporalAfter) gainedTemporal++;
        stillTruncated += out.truncatedColumns;
        const time = out.temporalAfter
          ? `${out.temporalAfter[0]}–${out.temporalAfter[1]} (cột "${out.temporalColumn}")`
          : "không có chiều thời gian";
        console.log(
          `${prefix} — ${out.columnsBefore}→${out.columnsAfter} cột | ` +
          `${out.completeColumns} cột lưu đủ, ${out.truncatedColumns} bị cắt | ${time}` +
          (out.committed ? ` | commit ${out.commitSha?.slice(0, 7)}` : "")
        );
      }

      // 413 là kết luận dứt điểm (file vượt trần, chạy lại vẫn thế) → đánh dấu
      // xong luôn, nếu không mỗi lần chạy lại sẽ tải lại chúng vô ích.
      if (APPLY && (res.ok || res.status === 413)) {
        state.done.push(slug);
        if (!ONE_SLUG) saveState(state);
      }
    } catch (err) {
      failed++;
      state.failed.push({ slug, error: String(err) });
      if (!ONE_SLUG) saveState(state);
      console.log(`${prefix} — lỗi: ${err}`);
    }

    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  console.log(
    `\nxong    : ${changed} đổi | ${unchanged} không đổi | ${skipped} bỏ qua | ${blocked} chặn | ${failed} lỗi\n` +
    `chi tiết: ${gainedValues} dataset có cột lưu đủ giá trị, ` +
    `${gainedTemporal} dataset điền được khoảng thời gian, ` +
    `${stillTruncated} cột vẫn bị cắt vì quá 200 giá trị`
  );
  if (!APPLY) console.log("\nĐây là dry-run — chưa ghi gì. Thêm --apply để commit.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
