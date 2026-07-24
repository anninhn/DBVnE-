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
import {
  fetchFileContents,
  listFolderEntries,
} from "@/lib/github/contents-api";
import { metadataToDataset } from "./read";
import { enrichRowCounts, enrichDownloadCounts } from "./enrichment";

// ──────────────────────────────────────────────────────────────────────────────
// GitHub contents API
// ──────────────────────────────────────────────────────────────────────────────

async function listDatasetFolders(): Promise<string[]> {
  const entries = await listFolderEntries("datasets");
  return entries.filter((e) => e.type === "dir").map((e) => e.name);
}

// ──────────────────────────────────────────────────────────────────────────────
// Fetch metadata.yaml cho 1 slug
// ──────────────────────────────────────────────────────────────────────────────

async function fetchMetadata(slug: string): Promise<MetadataYaml | null> {
  const result = await fetchFileContents(`datasets/${slug}/metadata.yaml`);
  if (!result) return null;
  try {
    return parseYaml(result.content) as MetadataYaml;
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
    // Skip soft-deleted — spec D3, listing không render dataset có status: deleted
    if (meta.status === "deleted") continue;
    // Listing không cần dictionary — load only khi click vào detail
    datasets.push(metadataToDataset(meta, []));
  }

  // Backfill row_count cho dataset cũ thiếu metadata row_count (self-healing).
  // Chỉ fetch file khi row_count===0 — dataset mới đã persist nên skip.
  await enrichRowCounts(datasets);

  // Hydrate downloads từ R2 counters (fetch song song, 1 round-trip tổng).
  // Cần trước khi sort "Most downloaded" / "Trending" để sort đúng.
  await enrichDownloadCounts(datasets);

  // Sort by uploaded_at desc (mới nhất trước)
  datasets.sort((a, b) => {
    const ta = new Date(a.uploaded_at).getTime();
    const tb = new Date(b.uploaded_at).getTime();
    return tb - ta;
  });

  return datasets;
});
