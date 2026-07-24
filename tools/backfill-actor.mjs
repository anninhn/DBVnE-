#!/usr/bin/env node
/**
 * Backfill actor fields (uploaded_by/at) cho dataset cũ thiếu.
 *
 * Spec plan task 19 + validation task 11.
 *
 * Scan datasets/*/metadata.yaml — nếu thiếu `uploaded_by`, set:
 *   uploaded_by: "ninh"     (default admin)
 *   uploaded_at: <git first-commit-date ISO>
 *
 * Usage:
 *   node tools/backfill-actor.mjs              # dry-run, report only
 *   node tools/backfill-actor.mjs --apply      # commit updates
 */

import { Octokit } from "@octokit/rest";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const OWNER = process.env.GITHUB_REPO_OWNER;
const REPO = process.env.GITHUB_REPO_NAME;
const BRANCH = process.env.GITHUB_REPO_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;

if (!OWNER || !REPO || !TOKEN) {
  console.error(
    "Thiếu env: GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_TOKEN (đọc từ .env.local)"
  );
  process.exit(1);
}

const octokit = new Octokit({ auth: TOKEN });
const apply = process.argv.includes("--apply");
const DEFAULT_USER = "ninh";

async function listDatasets() {
  const resp = await octokit.rest.repos.getContent({
    owner: OWNER,
    repo: REPO,
    path: "datasets",
    ref: BRANCH,
  });
  if (!Array.isArray(resp.data)) return [];
  return resp.data.filter((e) => e.type === "dir" && e.name !== "_users" && e.name !== "_audit").map((e) => e.name);
}

async function getFirstCommitDate(slug) {
  try {
    const resp = await octokit.rest.repos.listCommits({
      owner: OWNER,
      repo: REPO,
      path: `datasets/${slug}/metadata.yaml`,
      per_page: 1,
    });
    if (resp.data.length === 0) return null;
    return resp.data[0].commit.committer?.date ?? null;
  } catch {
    return null;
  }
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

async function commitUpdate(slug, newText, existingSha) {
  const b64 = Buffer.from(newText, "utf-8").toString("base64");
  await octokit.rest.repos.createOrUpdateFile({
    owner: OWNER,
    repo: REPO,
    path: `datasets/${slug}/metadata.yaml`,
    message: `Backfill uploaded_by for ${slug}`,
    content: b64,
    branch: BRANCH,
    sha: existingSha,
  });
}

async function main() {
  console.log(`${apply ? "[APPLY]" : "[DRY-RUN]"} Backfill actor fields\n`);
  const slugs = await listDatasets();
  console.log(`Scan ${slugs.length} datasets...\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const slug of slugs) {
    const meta = await readMetadata(slug);
    if (!meta) {
      console.warn(`✗ ${slug}: không đọc được metadata.yaml`);
      failed++;
      continue;
    }

    const parsed = parseYaml(meta.text);
    if (parsed.uploaded_by && parsed.uploaded_at) {
      console.log(`✓ ${slug}: đã có uploaded_by=${parsed.uploaded_by}`);
      skipped++;
      continue;
    }

    const firstCommitDate = await getFirstCommitDate(slug);
    const uploadedAt = parsed.uploaded_at ?? firstCommitDate ?? new Date().toISOString();
    parsed.uploaded_by = parsed.uploaded_by ?? DEFAULT_USER;
    parsed.uploaded_at = uploadedAt;

    const newText = stringifyYaml(parsed);
    console.log(
      `→ ${slug}: sẽ set uploaded_by=${parsed.uploaded_by}, uploaded_at=${uploadedAt}`
    );

    if (apply) {
      try {
        await commitUpdate(slug, newText, meta.sha);
        console.log(`  ✓ committed`);
        updated++;
      } catch (err) {
        console.error(`  ✗ commit fail:`, err.message);
        failed++;
      }
    } else {
      updated++;
    }
  }

  console.log(
    `\n${apply ? "Đã update" : "Sẽ update"}: ${updated} | Skip: ${skipped} | Fail: ${failed}`
  );
  if (!apply && updated > 0) {
    console.log("\nChạy với --apply để commit thật.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
