/**
 * Cleanup orphans — scan GitHub metadata vs R2 objects, report + xóa chéo.
 *
 * 2 loại orphan (luôn scan):
 *   - GitHub orphan: metadata.yaml có r2_key nhưng object không tồn tại trong R2
 *   - R2 orphan: object tồn tại trong R2 nhưng không có metadata nào reference
 *
 * KHÔNG đụng vào các prefix trong PROTECTED_PREFIXES (log chat, counter download)
 * — chúng không được metadata nào tham chiếu nên nếu không loại trừ sẽ bị xoá nhầm.
 *
 * Optional --include-deleted (spec D3 hard delete):
 *   Scan dataset có `status: deleted` trong metadata.yaml → hard delete GitHub
 *   folder + R2 objects. Log vào datasets/_audit/purge.log.
 *
 * Usage:
 *   node tools/cleanup-orphans.mjs                          # dry-run, chỉ report
 *   node tools/cleanup-orphans.mjs --apply                   # xóa orphans thật
 *   node tools/cleanup-orphans.mjs --include-deleted         # dry-run + show soft-deleted
 *   node tools/cleanup-orphans.mjs --include-deleted --apply # hard delete soft-deleted + orphans
 *
 * Cần env vars trong .env.local:
 *   GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_REPO_BRANCH
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 */
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";

// ─── Load env ──────────────────────────────────────────────────────────────

const envContent = readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match && match[2]) process.env[match[1]] = match[2];
}

const GH_TOKEN = process.env.GITHUB_TOKEN;
const GH_OWNER = process.env.GITHUB_REPO_OWNER;
const GH_REPO = process.env.GITHUB_REPO_NAME;
const GH_BRANCH = process.env.GITHUB_REPO_BRANCH || "main";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET_NAME;

const missing = [
  !GH_OWNER && "GITHUB_REPO_OWNER",
  !GH_REPO && "GITHUB_REPO_NAME",
  !R2_ACCOUNT_ID && "R2_ACCOUNT_ID",
  !R2_ACCESS_KEY_ID && "R2_ACCESS_KEY_ID",
  !R2_SECRET_ACCESS_KEY && "R2_SECRET_ACCESS_KEY",
  !R2_BUCKET && "R2_BUCKET_NAME",
].filter(Boolean);
if (missing.length > 0) {
  console.error(`❌ Missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const INCLUDE_DELETED = process.argv.includes("--include-deleted");

/**
 * Prefix trong R2 KHÔNG phải file dataset — không metadata.yaml nào tham chiếu
 * tới chúng, nên logic "object không được reference = rác" sẽ xoá nhầm.
 *
 * Đo thực tế 2026-08-27: dry-run xếp 16 file log Discovery Chat vào diện orphan.
 * Chạy `--apply` lúc đó là mất sạch lịch sử hội thoại + bộ đếm quota.
 *
 *   logs/chat/<ngày>.json          — src/lib/r2/chat-log.ts
 *   logs/chat/_quota/<ngày>.json   — bộ đếm quota theo ngày
 *   _counters/<slug>.json          — đếm lượt download
 *
 * Thêm tính năng nào ghi thẳng vào R2 thì phải khai prefix ở đây.
 */
const PROTECTED_PREFIXES = ["logs/", "_counters/"];

const isProtectedKey = (key) =>
  PROTECTED_PREFIXES.some((prefix) => key.startsWith(prefix));

// AWS SDK v3 mặc định thêm checksum → R2 reject. Tắt đi.
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

// ─── GitHub helpers ────────────────────────────────────────────────────────

async function ghFetch(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      "User-Agent": "cleanup-orphans-script",
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${url}`);
  return res.json();
}

async function listDatasetSlugs() {
  const data = await ghFetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/datasets?ref=${GH_BRANCH}`
  );
  // Skip internal folders _users + _audit (spec 2026-07-24)
  return data
    .filter((e) => e.type === "dir" && !e.name.startsWith("_"))
    .map((e) => e.name);
}

async function getMetadataR2Keys(slug) {
  const url = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/datasets/${slug}/metadata.yaml`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${GH_TOKEN}`, "User-Agent": "cleanup-orphans" },
  });
  if (!res.ok) return { keys: [], title: slug, status: undefined };

  const meta = parseYaml(await res.text());
  const keys = (meta.files ?? [])
    .map((f) => f.r2_key)
    .filter(Boolean);
  return { keys, title: meta.title ?? slug, status: meta.status };
}

async function deleteGithubFolder(slug) {
  // Lấy SHA của tất cả files trong folder để commit delete
  const entries = await ghFetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/datasets/${slug}?ref=${GH_BRANCH}`
  );

  for (const entry of entries) {
    if (entry.type !== "file") continue;
    await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${entry.path}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          "User-Agent": "cleanup-orphans-script",
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Cleanup orphan: delete ${entry.path}`,
          sha: entry.sha,
          branch: GH_BRANCH,
        }),
      }
    );
  }
}

// ─── R2 helpers ────────────────────────────────────────────────────────────

async function listR2Objects() {
  const keys = [];
  let cursor;
  do {
    const res = await r2.send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET, ContinuationToken: cursor })
    );
    for (const obj of res.Contents ?? []) keys.push(obj.Key);
    cursor = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (cursor);
  return keys;
}

async function deleteR2Objects(keys) {
  // R2 giới hạn 1000 keys/batch DeleteObjects
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await r2.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET,
        Delete: { Objects: batch.map((Key) => ({ Key })) },
      })
    );
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

console.log(`\n${APPLY ? "🔴 APPLY MODE" : "🔵 DRY RUN"} (add --apply to delete)${INCLUDE_DELETED ? " + --include-deleted" : ""}\n`);

// 1. List GitHub slugs + collect r2_keys
console.log("→ Scanning GitHub datasets...");
const slugs = await listDatasetSlugs();
const slugToMeta = new Map();
const githubR2Keys = new Set();
const softDeleted = []; // spec D3 — datasets có status: deleted
for (const slug of slugs) {
  const { keys, title, status } = await getMetadataR2Keys(slug);
  slugToMeta.set(slug, { keys, title, status });
  keys.forEach((k) => githubR2Keys.add(k));
  if (status === "deleted") softDeleted.push(slug);
}
console.log(`   ${slugs.length} datasets, ${githubR2Keys.size} r2_keys referenced, ${softDeleted.length} soft-deleted\n`);

// 2. List R2 objects
console.log("→ Scanning R2 bucket...");
const r2Keys = new Set(await listR2Objects());
console.log(`   ${r2Keys.size} objects in R2\n`);

// 3. Diff
const githubOrphans = []; // metadata exists, R2 missing
for (const [slug, { keys, title }] of slugToMeta) {
  for (const key of keys) {
    if (!r2Keys.has(key)) {
      githubOrphans.push({ slug, title, missingKey: key });
    }
  }
}

const r2Orphans = []; // R2 exists, no metadata
const protectedKeys = []; // R2 exists, không phải file dataset → KHÔNG đụng vào
for (const key of r2Keys) {
  if (githubR2Keys.has(key)) continue;
  if (isProtectedKey(key)) {
    protectedKeys.push(key);
    continue;
  }
  r2Orphans.push(key);
}

// 4. Report
console.log("═══ REPORT ═══\n");

if (protectedKeys.length > 0) {
  console.log(`Bỏ qua ${protectedKeys.length} object không phải file dataset (prefix: ${PROTECTED_PREFIXES.join(", ")})\n`);
}

if (githubOrphans.length === 0 && r2Orphans.length === 0) {
  console.log("✅ No orphans. GitHub + R2 synced.\n");
  process.exit(0);
}

if (githubOrphans.length > 0) {
  console.log(`GitHub orphans (metadata references missing R2 file): ${githubOrphans.length}`);
  for (const o of githubOrphans) {
    console.log(`  • ${o.slug}`);
    console.log(`      title: ${o.title}`);
    console.log(`      missing r2_key: ${o.missingKey}`);
  }
  console.log("");
}

if (r2Orphans.length > 0) {
  console.log(`R2 orphans (file exists but no metadata references it): ${r2Orphans.length}`);
  for (const key of r2Orphans) {
    console.log(`  • ${key}`);
  }
  console.log("");
}

// Soft-deleted (spec D3 — only with --include-deleted flag)
if (INCLUDE_DELETED && softDeleted.length > 0) {
  console.log(`Soft-deleted datasets (status: deleted) — will hard delete: ${softDeleted.length}`);
  for (const slug of softDeleted) {
    const meta = slugToMeta.get(slug);
    console.log(`  • ${slug} — ${meta.title} (${meta.keys.length} R2 keys)`);
  }
  console.log("");
} else if (!INCLUDE_DELETED && softDeleted.length > 0) {
  console.log(`ℹ️  ${softDeleted.length} soft-deleted dataset(s) skipped — re-run with --include-deleted to hard delete`);
  console.log("");
}

if (!APPLY) {
  console.log("Dry run only. Run with --apply to delete orphans.\n");
  process.exit(0);
}

// 5. Apply deletion
console.log("═══ APPLYING ═══\n");

// GitHub orphan: xóa cả folder metadata (vì file chính đã mất, metadata vô dụng)
// Trừ khi user muốn giữ metadata — hiện chọn delete toàn bộ
if (githubOrphans.length > 0) {
  const slugsToDelete = [...new Set(githubOrphans.map((o) => o.slug))];
  console.log(`→ Deleting ${slugsToDelete.length} GitHub dataset folders...`);
  for (const slug of slugsToDelete) {
    try {
      await deleteGithubFolder(slug);
      console.log(`  ✓ datasets/${slug}/`);
    } catch (err) {
      console.error(`  ✗ ${slug}: ${err.message}`);
    }
  }
}

// R2 orphan: xóa object
if (r2Orphans.length > 0) {
  console.log(`→ Deleting ${r2Orphans.length} R2 orphan objects...`);
  try {
    await deleteR2Objects(r2Orphans);
    console.log(`  ✓ All orphan objects deleted`);
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
  }
}

// Soft-deleted: hard delete GitHub folder + R2 objects + append purge.log (spec D3)
if (INCLUDE_DELETED && softDeleted.length > 0) {
  console.log(`\n→ Hard deleting ${softDeleted.length} soft-deleted dataset(s)...`);
  const purgeLogLines = [];
  for (const slug of softDeleted) {
    const meta = slugToMeta.get(slug);
    const iso = new Date().toISOString();
    try {
      // Delete R2 objects
      if (meta.keys.length > 0) {
        await deleteR2Objects(meta.keys);
      }
      // Delete GitHub folder
      await deleteGithubFolder(slug);
      purgeLogLines.push(`${iso} | ${slug} | ${meta.keys.length} r2 keys | github folder purged`);
      console.log(`  ✓ ${slug} — purged (${meta.keys.length} R2 keys + GitHub folder)`);
    } catch (err) {
      purgeLogLines.push(`${iso} | ${slug} | ERROR: ${err.message}`);
      console.error(`  ✗ ${slug}: ${err.message}`);
    }
  }

  // Append purge.log (best-effort)
  if (purgeLogLines.length > 0) {
    try {
      const purgePath = "datasets/_audit/purge.log";
      let existing = "";
      try {
        const resp = await ghFetch(
          `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${purgePath}?ref=${GH_BRANCH}`
        );
        existing = Buffer.from(resp.content.replace(/\n/g, ""), "base64").toString("utf-8");
      } catch {
        // 404 OK — file mới
      }
      const newContent = existing + purgeLogLines.join("\n") + "\n";
      const b64 = Buffer.from(newContent, "utf-8").toString("base64");
      await fetch(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${purgePath}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${GH_TOKEN}`,
            "User-Agent": "cleanup-orphans-script",
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: `Purge ${softDeleted.length} soft-deleted datasets`,
            content: b64,
            branch: GH_BRANCH,
          }),
        }
      );
      console.log(`✓ Appended ${purgeLogLines.length} entries to datasets/_audit/purge.log`);
    } catch (err) {
      console.warn(`⚠ Could not append purge.log: ${err.message}`);
    }
  }
}

console.log("\n✅ Cleanup complete.\n");
