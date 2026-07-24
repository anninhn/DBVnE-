#!/usr/bin/env node
/**
 * Rebuild datasets/index.json từ metadata.yaml của mỗi dataset folder.
 *
 * Fix B (single-file listing) + Fix C (row_count persist) bootstrap:
 *   1. List dataset folders (exclude _users, _audit)
 *   2. Read metadata.yaml từng folder
 *   3. Backfill row_count nếu thiếu (CSV/XLSX <10MB) — fetch R2 file + count
 *   4. Update metadata.yaml (regex replace) + index.json entry
 *   5. Commit atomic tất cả thay đổi cùng 1 SHA
 *
 * Race-safe: chỉ 1 người chạy tại 1 thời điểm. Nếu concurrently có user upload,
 * last-write-wins — chạy lại script để fix.
 *
 * Usage:
 *   node tools/rebuild-index.mjs              # dry-run, report only
 *   node tools/rebuild-index.mjs --apply      # commit updates
 *   node tools/rebuild-index.mjs --no-backfill # skip row_count backfill
 *
 * Env (đọc từ .env.local):
 *   GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_REPO_BRANCH
 *   R2_PUBLIC_BASE (để fetch file đếm rows)
 */

import { Octokit } from "@octokit/rest";
import { parse as parseYaml } from "yaml";

const OWNER = process.env.GITHUB_REPO_OWNER;
const REPO = process.env.GITHUB_REPO_NAME;
const BRANCH = process.env.GITHUB_REPO_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE;

if (!OWNER || !REPO || !TOKEN) {
  console.error(
    "Thiếu env: GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_TOKEN (đọc từ .env.local)",
  );
  process.exit(1);
}

const octokit = new Octokit({ auth: TOKEN });
const apply = process.argv.includes("--apply");
const skipBackfill = process.argv.includes("--no-backfill");
const ROW_COUNT_SIZE_CAP_MB = 10;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

async function listDatasetFolders() {
  const resp = await octokit.rest.repos.getContent({
    owner: OWNER,
    repo: REPO,
    path: "datasets",
    ref: BRANCH,
  });
  if (!Array.isArray(resp.data)) return [];
  return resp.data
    .filter(
      (e) =>
        e.type === "dir" && e.name !== "_users" && e.name !== "_audit",
    )
    .map((e) => e.name);
}

async function readMetadata(slug) {
  try {
    const resp = await octokit.rest.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: `datasets/${slug}/metadata.yaml`,
      ref: BRANCH,
    });
    if (Array.isArray(resp.data) || !("content" in resp.data)) return null;
    const b64 = resp.data.content.replace(/\n/g, "");
    const text = Buffer.from(b64, "base64").toString("utf-8");
    return { text, sha: resp.data.sha };
  } catch {
    return null;
  }
}

function inferFileType(filename, format) {
  const f = format ?? filename.split(".").pop() ?? "";
  if (["csv", "xlsx", "pdf", "mp3", "geojson", "json"].includes(f)) return f;
  return "csv";
}

async function countRowsFromR2(r2Key, fileType, sizeMb) {
  if (!R2_PUBLIC_BASE) {
    console.warn("  [backfill] R2_PUBLIC_BASE missing — skip count");
    return null;
  }
  if ((sizeMb ?? 0) >= ROW_COUNT_SIZE_CAP_MB) {
    console.warn(`  [backfill] skip — file ${sizeMb}MB >= cap ${ROW_COUNT_SIZE_CAP_MB}MB`);
    return null;
  }
  const url = `${R2_PUBLIC_BASE}/${r2Key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  [backfill] fetch fail ${res.status} — ${url}`);
      return null;
    }
    if (fileType === "csv") {
      const text = await res.text();
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      return Math.max(0, lines.length - 1); // trừ header
    }
    if (fileType === "xlsx") {
      const XLSX = await import("xlsx");
      const buf = await res.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(sheet, { defval: null }).length;
    }
  } catch (err) {
    console.warn(`  [backfill] error:`, err?.message ?? err);
  }
  return null;
}

/**
 * Insert/replace row_count trong YAML text. Preserve formatting/comments.
 *   - Nếu đã có `row_count:` line → replace value
 *   - Nếu không có → insert sau `slug:` line
 */
function upsertRowCountInYaml(text, count) {
  const value = `row_count: ${count}`;
  if (/^row_count:\s*.+/m.test(text)) {
    return text.replace(/^row_count:\s*.+/m, value);
  }
  // Insert sau `slug:` line — slug luôn có trong metadata
  return text.replace(/(^slug:\s*.+$)/m, `$1\n${value}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Mapper: MetadataYaml → IndexEntry
// ──────────────────────────────────────────────────────────────────────────────

function flattenSource(source) {
  if (!source) return { name: "", url: undefined };
  if (typeof source === "string") return { name: source, url: undefined };
  return { name: source.name ?? "", url: source.url };
}

function extractYearRange(meta) {
  const temporal = meta.coverage?.temporal ?? [];
  return temporal
    .map((t) => (typeof t === "number" ? t : parseInt(String(t), 10)))
    .filter((n) => !isNaN(n));
}

function metadataToIndexEntry(meta) {
  const files = meta.files ?? [];
  const source = flattenSource(meta.source);
  const topLevelFormat =
    typeof meta.format === "string" ? meta.format : undefined;

  const resources = files.map((f) => ({
    type: inferFileType(f.filename ?? f.r2_key ?? "", topLevelFormat),
    r2_key: f.r2_key || undefined,
    size_mb: f.size_mb,
  }));
  if (resources.length === 0 && topLevelFormat) {
    resources.push({ type: topLevelFormat });
  }

  return {
    slug: meta.slug,
    title: meta.title,
    description: meta.description ?? "",
    category: typeof meta.category === "string" ? meta.category : undefined,
    tags: meta.tags ?? [],
    uploaded_at: meta.uploaded_at ?? new Date().toISOString(),
    uploaded_by: meta.uploaded_by,
    last_edited_by: meta.last_edited_by,
    last_edited_at: meta.last_edited_at,
    row_count: meta.row_count ?? 0,
    file_count: files.length,
    total_size_mb: files.reduce((s, f) => s + (f.size_mb ?? 0), 0),
    format: topLevelFormat,
    source: source.name || undefined,
    source_url: source.url,
    status: meta.status,
    year_range: extractYearRange(meta),
    resources,
    feature_count: meta.feature_count,
    geometry_type: meta.geometry_type,
    bbox: meta.bbox,
    crs: meta.crs,
  };
}

function serializeIndex(entries) {
  const sorted = [...entries].sort((a, b) =>
    (b.uploaded_at ?? "").localeCompare(a.uploaded_at ?? ""),
  );
  return JSON.stringify(sorted, null, 2) + "\n";
}

// ──────────────────────────────────────────────────────────────────────────────
// Atomic multi-file commit (GitHub git API: blob → tree → commit → ref)
// ──────────────────────────────────────────────────────────────────────────────

async function commitMulti(files, commitMessage) {
  // 1. Get current HEAD commit SHA + tree SHA
  const refResp = await octokit.rest.git.getRef({
    owner: OWNER,
    repo: REPO,
    ref: `heads/${BRANCH}`,
  });
  const parentSha = refResp.data.object.sha;
  const commitResp = await octokit.rest.git.getCommit({
    owner: OWNER,
    repo: REPO,
    commit_sha: parentSha,
  });
  const baseTreeSha = commitResp.data.tree.sha;

  // 2. Create blobs
  const treeItems = await Promise.all(
    files.map(async (file) => {
      const blob = await octokit.rest.git.createBlob({
        owner: OWNER,
        repo: REPO,
        content: file.content,
        encoding: "utf-8",
      });
      return {
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: blob.data.sha,
      };
    }),
  );

  // 3. Create tree
  const treeResp = await octokit.rest.git.createTree({
    owner: OWNER,
    repo: REPO,
    base_tree: baseTreeSha,
    tree: treeItems,
  });

  // 4. Create commit
  const newCommit = await octokit.rest.git.createCommit({
    owner: OWNER,
    repo: REPO,
    message: commitMessage,
    tree: treeResp.data.sha,
    parents: [parentSha],
  });

  // 5. Update ref
  await octokit.rest.git.updateRef({
    owner: OWNER,
    repo: REPO,
    ref: `heads/${BRANCH}`,
    sha: newCommit.data.sha,
  });

  return {
    commitSha: newCommit.data.sha,
    commitUrl: newCommit.data.html_url,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Rebuild index — mode: ${apply ? "APPLY" : "DRY-RUN"}, backfill: ${skipBackfill ? "SKIP" : "ON"}`);
  console.log(`Repo: ${OWNER}/${REPO}@${BRANCH}`);
  console.log("");

  const slugs = await listDatasetFolders();
  console.log(`Found ${slugs.length} dataset folders:`);
  console.log("  " + slugs.join(", "));
  console.log("");

  const entries = [];
  const filesToCommit = [];
  let backfillCount = 0;
  let missingRowCount = 0;

  for (const slug of slugs) {
    const meta = await readMetadata(slug);
    if (!meta) {
      console.warn(`  [skip] ${slug}: không đọc được metadata.yaml`);
      continue;
    }
    let parsed;
    try {
      parsed = parseYaml(meta.text);
    } catch (err) {
      console.warn(`  [skip] ${slug}: parse fail —`, err.message);
      continue;
    }
    if (!parsed?.title || !parsed?.slug) {
      console.warn(`  [skip] ${slug}: thiếu title/slug`);
      continue;
    }
    // Soft-deleted — vẫn include vào index với status: deleted (listDatasets filter)
    if (parsed.status === "deleted") {
      console.log(`  [soft-deleted] ${slug} — include với status: deleted`);
    }

    // Backfill row_count nếu thiếu
    let textUpdated = meta.text;
    const needsBackfill =
      !skipBackfill && (!parsed.row_count || parsed.row_count === 0);
    if (needsBackfill) {
      const tabular = (parsed.files ?? []).find(
        (f) =>
          inferFileType(f.filename ?? f.r2_key ?? "", parsed.format) === "csv" ||
          inferFileType(f.filename ?? f.r2_key ?? "", parsed.format) === "xlsx",
      );
      if (tabular?.r2_key) {
        const ftype = inferFileType(
          tabular.filename ?? tabular.r2_key,
          parsed.format,
        );
        console.log(`  [backfill] ${slug}: đếm rows từ R2 (${ftype})...`);
        const count = await countRowsFromR2(
          tabular.r2_key,
          ftype,
          tabular.size_mb,
        );
        if (count != null) {
          console.log(`    → ${count} rows`);
          parsed.row_count = count;
          textUpdated = upsertRowCountInYaml(meta.text, count);
          backfillCount++;
        } else {
          missingRowCount++;
        }
      } else {
        missingRowCount++;
        console.warn(`  [backfill] ${slug}: không có tabular file để count`);
      }
    }

    if (textUpdated !== meta.text) {
      filesToCommit.push({
        path: `datasets/${slug}/metadata.yaml`,
        content: textUpdated,
      });
    }

    entries.push(metadataToIndexEntry(parsed));
  }

  const indexContent = serializeIndex(entries);
  filesToCommit.push({ path: "datasets/index.json", content: indexContent });

  console.log("");
  console.log(`Summary:`);
  console.log(`  Entries: ${entries.length}`);
  console.log(`  Row count backfilled: ${backfillCount}`);
  console.log(`  Row count still missing: ${missingRowCount}`);
  console.log(`  Files to commit: ${filesToCommit.length}`);
  console.log("");

  if (entries.length > 0) {
    console.log("Index preview:");
    for (const e of entries) {
      const status = e.status === "deleted" ? " [DELETED]" : "";
      console.log(
        `  ${e.slug}: rows=${e.row_count} files=${e.file_count} size=${e.total_size_mb.toFixed(1)}MB${status}`,
      );
    }
    console.log("");
  }

  if (!apply) {
    console.log("DRY-RUN — không commit. Chạy với --apply để commit thật.");
    console.log("Index.json preview (first 500 chars):");
    console.log(indexContent.slice(0, 500));
    if (indexContent.length > 500) console.log(`  ... (+${indexContent.length - 500} chars)`);
    return;
  }

  console.log("Committing...");
  const result = await commitMulti(
    filesToCommit,
    `Rebuild datasets/index.json (${entries.length} entries)`,
  );
  console.log(`✓ Committed: ${result.commitSha}`);
  console.log(`  ${result.commitUrl}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
