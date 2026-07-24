/**
 * Listing catalog — đọc 1 file `datasets/index.json` thay vì N+1 GitHub calls.
 *
 * Page `/` gọi `listDatasets()` mỗi request. Layer cache:
 *   1. React `cache()` — in-request dedupe (gọi nhiều lần trong 1 request = 1 fetch)
 *   2. Next.js `unstable_cache` — cross-request cache 60s + invalidate qua tag
 *      "datasets" (revalidateTag ở upload/edit/delete routes)
 *
 * Index.json được update atomic cùng metadata.yaml trong cùng commit (xem
 * `src/lib/dataset-commit.ts`). Sau upload/edit/delete, homepage refresh < 1s.
 *
 * Fallback defensive:
 *   - `enrichRowCounts` — backfill row_count cho dataset cũ thiếu (chạy bỏ
 *     sau khi bootstrap+backfill hoàn tất, Fix C).
 *   - `enrichDownloadCounts` — hydrate downloads từ R2 counters (real-time,
 *     không persist vào index vì counter update mỗi click).
 *
 * Reference: memory `project_next_session_ssr_perf.md` Fix A+B+C.
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";
import type {
  Dataset,
  Resource,
  ResourceType,
  FileType,
  Category,
} from "@/lib/types/dataset";
import { buildFileUrl } from "@/lib/r2/client";
import { fetchListingIndex, type IndexEntry } from "./index-json";
import { enrichRowCounts, enrichDownloadCounts } from "./enrichment";

// ──────────────────────────────────────────────────────────────────────────────
// Mapper: IndexEntry → Dataset (cho listing render)
// ──────────────────────────────────────────────────────────────────────────────

function inferResourceType(fmt: string): ResourceType {
  if (fmt === "pdf") return "document";
  if (fmt === "mp3") return "audio";
  if (fmt === "geojson" || fmt === "json") return "geo_layer";
  return "data";
}

function indexEntryToDataset(entry: IndexEntry): Dataset {
  // Synthesize Resource[] từ summary — đủ cho format filter (file_type) +
  // enrich fallback (file_url, file_size_mb). KHÔNG có structured_data/
  // column_stats — load ở detail page.
  const resources: Resource[] = entry.resources.map((r, i) => ({
    id: i + 1,
    resource_type: inferResourceType(r.type),
    title: entry.title,
    file_type: r.type as FileType,
    file_url: r.r2_key ? buildFileUrl(r.r2_key) : undefined,
    file_size_mb: r.size_mb,
    uploaded_by: entry.uploaded_by ?? "unknown",
    uploaded_at: entry.uploaded_at,
  }));

  return {
    slug: entry.slug,
    title: entry.title,
    description: entry.description,
    category: (entry.category as Category) ?? "xa-hoi",
    tags: entry.tags ?? [],
    license: "internal",
    year_range: entry.year_range,
    row_count: entry.row_count,
    file_count: entry.file_count,
    total_size_mb: entry.total_size_mb,
    downloads: 0,
    likes: 0,
    source: entry.source ?? "",
    source_url: entry.source_url,
    uploaded_by: entry.uploaded_by ?? "unknown",
    uploaded_at: entry.uploaded_at,
    last_edited_by: entry.last_edited_by,
    last_edited_at: entry.last_edited_at,
    resources,
    data_dictionary: [],
    feature_count: entry.feature_count,
    geometry_type: entry.geometry_type,
    bbox:
      Array.isArray(entry.bbox) && entry.bbox.length === 4
        ? [entry.bbox[0], entry.bbox[1], entry.bbox[2], entry.bbox[3]]
        : undefined,
    crs: entry.crs,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

async function listDatasetsImpl(): Promise<Dataset[]> {
  const index = await fetchListingIndex();
  if (index.length === 0) return [];

  const datasets = index
    .filter((e) => e.status !== "deleted")
    .map(indexEntryToDataset);

  // Defensive fallback — backfill row_count cho dataset thiếu. Bỏ sau Fix C
  // (bootstrap+backfill persist row_count vào metadata.yaml + index.json).
  await enrichRowCounts(datasets);

  // Hydrate downloads từ R2 counters (real-time, 1 round-trip song song).
  await enrichDownloadCounts(datasets);

  // Sort by uploaded_at desc (mới nhất trước). Index.json đã sort nhưng sort
  // lại để chắc chắn sau enrich không thay đổi thứ tự.
  datasets.sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));

  return datasets;
}

/** Listing: đọc từ index.json (1 GitHub call) + hydrate downloads. */
const listDatasetsMemo = cache(listDatasetsImpl);

export const listDatasets = unstable_cache(listDatasetsMemo, [
  "list-datasets-v1",
], {
  revalidate: 60,
  tags: ["datasets"],
});
