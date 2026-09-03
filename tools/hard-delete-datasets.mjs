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
console.log("\nXong. Slug đã được giải phóng, upload lại được cùng slug.");
