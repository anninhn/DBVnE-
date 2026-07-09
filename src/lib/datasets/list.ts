/**
 * Listing catalog — runtime fetch từ GitHub contents API.
 *
 * Page `/` gọi `listDatasets()` mỗi request. Không cache fetch layer
 * (no-store) — tránh stale list sau khi upload/delete dataset.
 * Per-request cache vẫn có qua React `cache()` wrapper ở listDatasets.
 *
 * Flow:
 *   1. GET /repos/{owner}/{repo}/contents/datasets → list folder slugs
 *   2. Với mỗi slug: GET raw metadata.yaml
 *   3. Parse + map sang Dataset (chỉ metadata, không load dictionary — nhẹ listing)
 *   4. Sort by uploaded_at desc
 */

import { cache } from "react";
import { parse as parseYaml } from "yaml";
import type { Dataset } from "@/lib/types/dataset";
import type { MetadataYaml } from "./types";
import { getGithubConfig, rawUrl } from "./types";
import { metadataToDataset } from "./read";

// ──────────────────────────────────────────────────────────────────────────────
// GitHub contents API
// ──────────────────────────────────────────────────────────────────────────────

interface GithubContentEntry {
  name: string;
  path: string;
  type: "file" | "dir";
}

async function listDatasetFolders(): Promise<string[]> {
  const config = getGithubConfig();
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/datasets?ref=${config.branch}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "vnexpress-data-platform",
    "Cache-Control": "no-cache",
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
  };

  const res = await fetch(url, { headers, cache: "no-store" });
  if (res.status === 404) {
    // datasets/ folder chưa tồn tại — chưa có dataset nào
    return [];
  }
  if (!res.ok) {
    throw new Error(`GitHub contents API failed: ${res.status}`);
  }

  const entries = (await res.json()) as GithubContentEntry[];
  return entries.filter((e) => e.type === "dir").map((e) => e.name);
}

// ──────────────────────────────────────────────────────────────────────────────
// Fetch metadata.yaml cho 1 slug
// ──────────────────────────────────────────────────────────────────────────────

async function fetchMetadata(slug: string): Promise<MetadataYaml | null> {
  const config = getGithubConfig();
  const url = rawUrl(config, `datasets/${slug}/metadata.yaml`);

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "vnexpress-data-platform",
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
  };

  // Contents API: response JSON có field `content` base64-encoded
  const res = await fetch(url, { headers, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    console.warn(`[listDatasets] skip ${slug}: ${res.status}`);
    return null;
  }

  const data = (await res.json()) as { content?: string };
  if (!data.content) return null;
  const b64 = data.content.replace(/\n/g, "");
  const text = Buffer.from(b64, "base64").toString("utf-8");

  try {
    return parseYaml(text) as MetadataYaml;
  } catch (err) {
    console.warn(`[listDatasets] parse fail ${slug}:`, err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/** Listing: metadata only (không load dictionary — nhẹ cho trang `/`). */
export const listDatasets = cache(async (): Promise<Dataset[]> => {
  const slugs = await listDatasetFolders();
  if (slugs.length === 0) return [];

  const results = await Promise.allSettled(slugs.map(fetchMetadata));

  const datasets: Dataset[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const meta = r.value;
    if (!meta.title || !meta.slug) continue;
    // Listing không cần dictionary — load only khi click vào detail
    datasets.push(metadataToDataset(meta, []));
  }

  // Sort by uploaded_at desc (mới nhất trước)
  datasets.sort((a, b) => {
    const ta = new Date(a.uploaded_at).getTime();
    const tb = new Date(b.uploaded_at).getTime();
    return tb - ta;
  });

  return datasets;
});
