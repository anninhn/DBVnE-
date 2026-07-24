/**
 * Single-file listing index — `datasets/index.json`.
 *
 * Thay thế N+1 GitHub calls (list folders + fetch metadata.yaml từng slug)
 * bằng 1 call fetch index.json. listDatasets() chỉ cần đọc file này + hydrate
 * downloads từ R2 counters (real-time). Speedup ~95% (2.8s → ~50ms cold).
 *
 * Write path: update atomic cùng metadata.yaml trong cùng commit (xem
 * `commitMetadata` trong `src/lib/dataset-commit.ts`). Mỗi upload/edit/delete
 * upsert entry tương ứng. Soft delete giữ entry với `status: "deleted"` để
 * trace — listDatasets filter ra.
 *
 * Race condition: 2 user upload cùng lúc có thể lost-write index (last-write-wins).
 * Acceptable cho newsroom scale (upload là event hiếm, vài lần/tuần). Recovery:
 * `tools/rebuild-index.mjs` rebuild từ metadata.yaml trong <10s.
 *
 * Cache layer (Fix A): `unstable_cache` wrap listDatasets (revalidate 60s,
 * tag "datasets"). Mỗi write path gọi `revalidateTag("datasets")`.
 */

import { parse as parseYaml } from "yaml";
import type { MetadataYaml } from "./types";
import { fetchFileContents } from "@/lib/github/contents-api";

/** Path trong repo (GitHub Contents API). */
export const INDEX_PATH = "datasets/index.json";

/**
 * Subset của MetadataYaml đủ cho listing (filter/sort/render card).
 * KHÔNG chứa dictionary hay structured_data — load ở detail page.
 */
export interface IndexEntry {
  slug: string;
  title: string;
  description: string;
  category?: string;
  tags: string[];
  /** ISO datetime */
  uploaded_at: string;
  uploaded_by?: string;
  /** Auth nhẹ — actor tracking */
  last_edited_by?: string;
  last_edited_at?: string;
  /** Tabular */
  row_count: number;
  file_count: number;
  total_size_mb: number;
  /** Top-level format (legacy) */
  format?: string;
  source?: string;
  source_url?: string;
  /** "active" (mặc định) | "deleted" (soft delete) */
  status?: "active" | "deleted";
  /** Temporal coverage → dùng cho year filter */
  year_range: number[];
  /**
   * Resource summary cho listing:
   *   - `type` → filter theo file_type ở DatasetExplorer
   *   - `r2_key` → build file_url lúc read (lib/r2/client) cho enrich fallback
   *   - `size_mb` → ROW_COUNT_SIZE_CAP_MB check
   * KHÔNG chứa structured_data/column_stats — load ở detail page.
   */
  resources: Array<{
    type: string;
    r2_key?: string;
    size_mb?: number;
  }>;
  /** GeoJSON-only */
  feature_count?: number;
  geometry_type?: string;
  bbox?: number[];
  crs?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Fetch
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Fetch + parse `datasets/index.json`.
 *
 * Returns `[]` khi:
 *   - File không tồn tại (404) — bootstrap chưa chạy
 *   - Parse fail — graceful fallback (caller có thể dùng legacy path)
 */
export async function fetchListingIndex(): Promise<IndexEntry[]> {
  const result = await fetchFileContents(INDEX_PATH);
  if (!result) return [];
  try {
    const arr = JSON.parse(result.content);
    if (!Array.isArray(arr)) return [];
    return arr as IndexEntry[];
  } catch (err) {
    console.warn("[index-json] parse fail:", err);
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Mapper: MetadataYaml → IndexEntry
// ──────────────────────────────────────────────────────────────────────────────

function inferFileType(filename: string, format?: string): string {
  if (format && ["csv", "xlsx", "pdf", "mp3", "geojson", "json"].includes(format)) {
    return format;
  }
  const ext = filename.split(".").pop() ?? "";
  if (["csv", "xlsx", "pdf", "mp3", "geojson", "json"].includes(ext)) return ext;
  return "csv";
}

function flattenSource(source: MetadataYaml["source"]): { name: string; url?: string } {
  if (!source) return { name: "" };
  if (typeof source === "string") return { name: source };
  return { name: source.name ?? "", url: source.url };
}

function extractYearRange(meta: MetadataYaml): number[] {
  const temporal = meta.coverage?.temporal ?? [];
  return temporal
    .map((t) => (typeof t === "number" ? t : parseInt(String(t), 10)))
    .filter((n) => !isNaN(n));
}

/** Map MetadataYaml → IndexEntry. Caller đã parse YAML sẵn. */
export function metadataToIndexEntry(meta: MetadataYaml): IndexEntry {
  const files = meta.files ?? [];
  const source = flattenSource(meta.source);
  const topLevelFormat = typeof meta.format === "string" ? meta.format : undefined;

  const resources: IndexEntry["resources"] = files.map((f) => ({
    type: inferFileType(f.filename ?? f.r2_key ?? "", topLevelFormat),
    r2_key: f.r2_key || undefined,
    size_mb: f.size_mb,
  }));
  // Fallback khi files[] rỗng nhưng có top-level format (vd: dataset legacy)
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
    total_size_mb: files.reduce((sum, f) => sum + (f.size_mb ?? 0), 0),
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

// ──────────────────────────────────────────────────────────────────────────────
// Serialize / mutate helpers (pure — caller fetch + commit)
// ──────────────────────────────────────────────────────────────────────────────

/** Upsert 1 entry vào index — replace nếu slug đã có, push nếu chưa. */
export function upsertEntry(
  index: IndexEntry[],
  entry: IndexEntry,
): IndexEntry[] {
  const i = index.findIndex((e) => e.slug === entry.slug);
  if (i >= 0) {
    const next = [...index];
    next[i] = entry;
    return next;
  }
  return [...index, entry];
}

/** Serialize + sort by uploaded_at desc (mới nhất trước) — sẵn cho commit. */
export function serializeIndex(entries: IndexEntry[]): string {
  const sorted = [...entries].sort((a, b) =>
    (b.uploaded_at ?? "").localeCompare(a.uploaded_at ?? ""),
  );
  return JSON.stringify(sorted, null, 2) + "\n";
}

/**
 * Build 1 file entry `{ path, content }` cho `datasets/index.json` chứa index
 * đã upsert entry từ YAML text. Caller ghép vào `commitFiles([...])` call để
 * commit atomic cùng metadata.yaml.
 *
 * Returns `null` khi:
 *   - YAML parse fail hoặc thiếu slug/title (skip index update — caller proceed)
 *   - Fetch current index fail (graceful — caller có thể retry hoặc skip)
 *
 * Dùng cho delete route (raw YAML) thay vì parse riêng. Upload/edit đi qua
 * `commitMetadata` đã handle index inline.
 */
export async function buildIndexFileFromYaml(
  yamlText: string,
): Promise<{ path: string; content: string } | null> {
  let meta: MetadataYaml;
  try {
    meta = parseYaml(yamlText) as MetadataYaml;
  } catch {
    return null;
  }
  if (!meta?.slug || !meta?.title) return null;

  const currentIndex = await fetchListingIndex();
  const nextEntry = metadataToIndexEntry(meta);
  const nextIndex = upsertEntry(currentIndex, nextEntry);
  return {
    path: INDEX_PATH,
    content: serializeIndex(nextIndex),
  };
}
