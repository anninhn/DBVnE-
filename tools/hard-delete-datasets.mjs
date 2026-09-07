#!/usr/bin/env node
/**
 * Xoá HẲN dataset theo slug — folder GitHub + object R2 + entry trong index.json.
 *
 * Khác `/api/dataset/delete` (soft delete): route đó chỉ ghi `status: deleted` vào
 * metadata.yaml và GIỮ nguyên folder, nên slug vẫn bị chiếm — upload lại cùng tiêu đề
 * sẽ ra `<slug>-2` (resolveUniqueSlug trong src/app/api/upload/commit/route.ts).
 * Script này dùng khi cần upload lại chính slug đó, hoặc dọn dataset trùng.
 *
 * KHÔNG HOÀN TÁC ĐƯỢC. Dry-run là mặc định, phải có `--apply` mới xoá.
 *
 * Làm đủ 3 việc để không để lại trạng thái nửa vời:
 *   1. Xoá object trong R2 (đọc r2_key từ metadata.yaml)
 *   2. Xoá mọi file trong `datasets/<slug>/`
 *   3. Bỏ entry khỏi `datasets/index.json` — bước này cleanup-orphans.mjs không làm,
 *      thiếu nó thì listing còn entry trỏ vào metadata đã mất.
 *
 * Usage:
 *   node --env-file=.env.local tools/hard-delete-datasets.mjs <slug> [<slug> ...]
 *   node --env-file=.env.local tools/hard-delete-datasets.mjs --file slugs.txt --apply
 */

import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const fileIdx = args.indexOf("--file");
const slugs = fileIdx >= 0
  ? readFileSync(args[fileIdx + 1], "utf8").split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"))
  : args.filter((a) => !a.startsWith("--"));

const { GITHUB_TOKEN: GH_TOKEN, GITHUB_REPO_OWNER: GH_OWNER, GITHUB_REPO_NAME: GH_REPO } = process.env;
const GH_BRANCH = process.env.GITHUB_REPO_BRANCH || "main";
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
const R2_BUCKET = process.env.R2_BUCKET_NAME; // tên biến khớp src/lib/r2/client.ts

if (!slugs.length) {
  console.error("Thiếu slug. Xem hướng dẫn ở đầu file.");
  process.exit(2);
}
if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
  console.error("Thiếu GITHUB_TOKEN / GITHUB_REPO_OWNER / GITHUB_REPO_NAME — chạy với `node --env-file=.env.local`.");
  process.exit(2);
}

const r2 = R2_ACCESS_KEY_ID
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    })
  : null;

const GH = {
  Authorization: `Bearer ${GH_TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "hard-delete-datasets",
  "Content-Type": "application/json",
};

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/${path}`, {
    ...init,
    headers: { ...GH, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function readFileJson(path) {
  const res = await gh(`contents/${path}?ref=${GH_BRANCH}`);
  const data = await res.json();
  return { sha: data.sha, text: Buffer.from(data.content, "base64").toString("utf8") };
}

async function inspect(slug) {
  try {
    const entries = await (await gh(`contents/datasets/${slug}?ref=${GH_BRANCH}`)).json();
    const files = entries.filter((e) => e.type === "file");
    const metaEntry = files.find((f) => f.name === "metadata.yaml");
    let keys = [], title = slug, status;
    if (metaEntry) {
      const { text } = await readFileJson(metaEntry.path);
      const meta = parseYaml(text);
      keys = (meta.files ?? []).map((f) => f.r2_key).filter(Boolean);
      title = meta.title ?? slug;
      status = meta.status;
    }
    return { slug, exists: true, files, keys, title, status };
  } catch {
    return { slug, exists: false, files: [], keys: [], title: slug };
  }
}

async function deleteFolder(slug, files) {
  for (const f of files) {
    await gh(`contents/${f.path}`, {
      method: "DELETE",
      body: JSON.stringify({ message: `Hard delete dataset ${slug}: ${f.name}`, sha: f.sha, branch: GH_BRANCH }),
    });
  }
}

async function pruneIndex(removed) {
  const { sha, text } = await readFileJson("datasets/index.json");
  const parsed = JSON.parse(text);
  const list = Array.isArray(parsed) ? parsed : parsed.datasets ?? [];
  const kept = list.filter((e) => !removed.has(e.slug));
  if (kept.length === list.length) {
    console.log("index.json: không có entry nào cần bỏ");
    return 0;
  }
  const body = Array.isArray(parsed) ? kept : { ...parsed, datasets: kept };
  await gh("contents/datasets/index.json", {
    method: "PUT",
    body: JSON.stringify({
      message: `Hard delete: bỏ ${list.length - kept.length} entry khỏi index.json`,
      content: Buffer.from(JSON.stringify(body, null, 2) + "\n", "utf8").toString("base64"),
      sha,
      branch: GH_BRANCH,
    }),
  });
  return list.length - kept.length;
}

const AUDIT_PATH = "datasets/_audit/delete.log";

/**
 * Ghi vết xoá vào `datasets/_audit/delete.log` — cùng file mà route soft delete ghi.
 *
 * Vì sao script này phải tự ghi: nó xoá thẳng GitHub + R2, không đi qua
 * `/api/dataset/delete`, nên `appendDeleteAudit` không bao giờ chạy. Trước khi có
 * hàm này, mọi lượt hard delete đều không để lại dòng nào trong log — đo thực tế
 * 2026-09-04: 7 dataset bị xoá hẳn, log không có dòng nào.
 *
 * Vết vẫn còn trong git history (mỗi lượt xoá là một commit), nhưng log tồn tại
 * đúng để không phải đi đọc git log mới biết ai xoá gì. Log không phản ánh đúng
 * thì nó tệ hơn không có log: người đọc tin nó là đầy đủ.
 *
 * Đánh dấu `hard delete` ở cột lý do để phân biệt với soft delete — hai việc khác
 * nhau về mức không hoàn tác được, và người đọc log cần thấy ngay.
 */
async function appendDeleteLog(targets) {
  // Hạ chữ thường: route soft delete ghi `user.username` (đã là chữ thường), còn
  // `PLATFORM_USER` trong .env.local người ta gõ hoa. Hai cách viết cho cùng một
  // người làm log không lọc được theo user — mà đó gần như là việc duy nhất người
  // ta làm với file này.
  const who = (process.env.PLATFORM_USER || process.env.USER || "unknown").toLowerCase();
  const iso = new Date().toISOString();
  const lines = targets
    .map((t) => `${iso} | ${who} | ${t.slug} | hard delete (tools/hard-delete-datasets.mjs)`)
    .join("\n") + "\n";

  let existing = "";
  let sha;
  try {
    const cur = await readFileJson(AUDIT_PATH);
    existing = cur.text;
    sha = cur.sha;
  } catch {
    // Chưa có file — tạo mới. Không bọc try quanh cả hàm: ghi log THẤT BẠI phải
    // báo ra, xem chỗ gọi.
  }

  await gh(`contents/${AUDIT_PATH}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `Audit: hard delete ${targets.length} dataset by ${who}`,
      content: Buffer.from(existing + lines, "utf8").toString("base64"),
      ...(sha ? { sha } : {}),
      branch: GH_BRANCH,
    }),
  });
  return targets.length;
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log(`\n${APPLY ? "APPLY — XOÁ THẬT, KHÔNG HOÀN TÁC" : "DRY-RUN — không xoá gì"}\n`);

const targets = [];
for (const slug of slugs) {
  const info = await inspect(slug);
  targets.push(info);
  if (!info.exists) {
    console.log(`  BỎ QUA  ${slug} — không có folder datasets/${slug}/`);
    continue;
  }
  console.log(`  XOÁ     ${slug}${info.status === "deleted" ? "  [đang soft-deleted]" : ""}`);
  console.log(`          title   : ${info.title}`);
  console.log(`          file GH : ${info.files.map((f) => f.name).join(", ") || "(không có)"}`);
  console.log(`          object R2: ${info.keys.join(", ") || "(không có)"}`);
}

const live = targets.filter((t) => t.exists);
console.log(`\ntổng: ${live.length} dataset | ${live.reduce((n, t) => n + t.files.length, 0)} file GitHub | ${live.reduce((n, t) => n + t.keys.length, 0)} object R2`);

if (!APPLY) {
  console.log("\nThêm --apply để xoá thật.");
  process.exit(0);
}

const allKeys = live.flatMap((t) => t.keys);
if (allKeys.length) {
  if (!r2) {
    console.error("Thiếu R2_* trong env — không xoá được object R2. Dừng để tránh xoá nửa vời.");
    process.exit(1);
  }
  for (let i = 0; i < allKeys.length; i += 1000) {
    await r2.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET,
        Delete: { Objects: allKeys.slice(i, i + 1000).map((Key) => ({ Key })) },
      })
    );
  }
  console.log(`R2: đã xoá ${allKeys.length} object`);
}

for (const t of live) {
  await deleteFolder(t.slug, t.files);
  console.log(`GitHub: đã xoá datasets/${t.slug}/`);
}

const pruned = await pruneIndex(new Set(live.map((t) => t.slug)));
console.log(`index.json: đã bỏ ${pruned} entry`);

// Ghi log SAU khi xoá xong: ghi trước rồi xoá lỗi giữa đường là log nói dối theo
// chiều tệ hơn — báo đã xoá một thứ vẫn còn đó.
try {
  const n = await appendDeleteLog(live);
  console.log(`_audit/delete.log: đã ghi ${n} dòng`);
} catch (err) {
  // KHÔNG im lặng: dataset đã xoá xong, nhưng log thiếu dòng thì lần sau không ai
  // biết là thiếu. In ra đúng dòng cần thêm tay.
  console.error(`\n!! GHI LOG THẤT BẠI: ${err.message}`);
  console.error("Dataset ĐÃ bị xoá. Thêm tay các dòng sau vào datasets/_audit/delete.log:");
  const who = (process.env.PLATFORM_USER || process.env.USER || "unknown").toLowerCase();
  const iso = new Date().toISOString();
  for (const t of live) {
    console.error(`  ${iso} | ${who} | ${t.slug} | hard delete (tools/hard-delete-datasets.mjs)`);
  }
}

console.log("\nXong. Slug đã được giải phóng, upload lại được cùng slug.");

// Script này xoá thẳng GitHub + R2, KHÔNG đi qua `/api/dataset/delete` — nên nó
// cũng không chạy `removeDatasetIndexes`. Chỉ mục tra cứu vì thế còn giữ entry của
// dataset vừa xoá, và câu hỏi sau đó vẫn được chỉ tới một dataset không còn tồn
// tại. Nhắc ra đây thay vì tự gọi: script chạy được cả khi app không bật (D6).
console.log(
  "\nCHƯA XONG một việc: chỉ mục tra cứu còn entry của các dataset vừa xoá.\n" +
  "Chạy tiếp để dọn (script sẽ báo chúng ở mục \"không còn trong kho\"):\n" +
  "  node --env-file=.env.local tools/build-retrieval-index.mjs --apply"
);
