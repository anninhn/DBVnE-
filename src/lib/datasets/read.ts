/**
 * Đọc 1 dataset từ GitHub raw — runtime fetch.
 *
 * Page `/datasets/[slug]` gọi `getDatasetBySlug(slug)` mỗi request.
 * Không cache fetch layer (no-store) — tránh stale 404 sau upload.
 * Per-request cache vẫn có qua React `cache()` wrapper ở getDatasetBySlug.
 *
 * Atomic link: metadata.yaml field `files[].r2_key + version_id + sha256`
 * tham chiếu R2 object. Chi tiết: constitution/tech-stack.md.
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { parse as parseYaml } from "yaml";
import type {
  Dataset,
  Resource,
  DataDictionaryEntry,
} from "@/lib/types/dataset";
import { buildFileUrl } from "@/lib/r2/client";
import { getDownloadCount } from "@/lib/r2/counter";
import { fetchFileContents } from "@/lib/github/contents-api";
import { withPreviewData } from "./enrichment";
import {
  type DictionaryEntry,
  type GithubConfig,
  type MetadataYaml,
} from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// Fetch helpers
// ──────────────────────────────────────────────────────────────────────────────

async function fetchRaw(path: string): Promise<string | null> {
  return (await fetchFileContents(path))?.content ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Dictionary.md parser
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Parse markdown table:
 *   | Column | Type | Dec | Group | Unit | Description |
 *   |--------|------|-----|-------|------|-------------|
 *   | `grdp` | number | , | . | tỷ VND | GRDP |
 *
 * Backward compat: nếu chỉ có 4 cột cũ (Column|Type|Unit|Description) thì parse OK,
 * decimal_char/group_char = undefined (sử dụng default `.` và `,`).
 *
 * → DataDictionaryEntry[] (compat với Dataset.data_dictionary type hiện tại).
 */
export function parseDictionaryMarkdown(md: string): DataDictionaryEntry[] {
  const lines = md.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return [];

  // Skip header + separator row
  const dataRows = lines.slice(2);
  return dataRows
    .map((line) => {
      // Split theo `|`, filter empty (do leading/trailing `|` tạo 2 empty cells)
      const cells = line.split("|").map((c) => c.trim());
      // Bỏ 2 empty cells ở 2 đầu (vì markdown table `| a | b |` → ["", "a", "b", ""])
      const trimmed = cells.filter((_, i) => i !== 0 && i !== cells.length - 1);
      if (trimmed.length < 1) return null;

      // Layout mới (6 cột): Column | Type | Dec | Group | Unit | Description
      // Layout cũ (4 cột):   Column | Type | Unit | Description
      let column: string | undefined;
      let type: string | undefined;
      let decimalChar: string | undefined;
      let groupChar: string | undefined;
      let unit: string | undefined;
      let description: string | undefined;

      if (trimmed.length >= 6) {
        [column, type, decimalChar, groupChar, unit, description] = trimmed;
      } else {
        // Layout cũ — không có Dec/Group
        [column, type, unit, description] = trimmed;
      }

      const normalizeSep = (v: string | undefined): "." | "," | " " | undefined => {
        if (!v || v === "-") return undefined;
        if (v === "." || v === "," || v === " ") return v;
        return undefined;
      };

      return {
        column_name: column?.replace(/`/g, "") ?? "",
        label_vi: column?.replace(/`/g, "") ?? "",
        data_type: mapDictionaryType(type),
        unit: unit && unit !== "-" ? unit : undefined,
        description: description && description !== "-" ? description : undefined,
        decimal_char: normalizeSep(decimalChar) as DataDictionaryEntry["decimal_char"],
        group_char: normalizeSep(groupChar) as DataDictionaryEntry["group_char"],
      } as DataDictionaryEntry;
    })
    .filter((row): row is DataDictionaryEntry => row !== null);
}

function mapDictionaryType(
  raw?: string,
): DataDictionaryEntry["data_type"] {
  if (!raw) return "text";
  const t = raw.toLowerCase();
  if (t.includes("int") || t.includes("number")) return "int";
  if (t.includes("float") || t.includes("decimal")) return "float";
  if (t.includes("date")) return "date";
  return "text";
}

// ──────────────────────────────────────────────────────────────────────────────
// Mapper: MetadataYaml → Dataset (compat types/dataset.ts)
// ──────────────────────────────────────────────────────────────────────────────

function flattenSource(source: MetadataYaml["source"]): string {
  if (!source) return "";
  if (typeof source === "string") return source;
  return source.name;
}

function extractSourceUrl(source: MetadataYaml["source"]): string {
  if (!source || typeof source === "string") return "";
  return source.url ?? "";
}

function mapFilesToResources(
  files: MetadataYaml["files"],
  format: string | undefined,
  uploadedBy?: string,
  uploadedAt?: string,
): { resources: Resource[]; totalSizeMb: number } {
  if (!files || files.length === 0) return { resources: [], totalSizeMb: 0 };

  const resources: Resource[] = files.map((f, i) => {
    const r2Key = f.r2_key ?? "";
    if (!r2Key) {
      console.warn(`[datasets] File ref thiếu r2_key — skip file_url cho index ${i}`);
    }
    return {
      id: i + 1,
      resource_type: inferResourceType(f.filename ?? r2Key, format),
      title: f.filename ?? r2Key.split("/").pop() ?? "untitled",
      file_url: r2Key ? buildFileUrl(r2Key) : undefined,
      file_type: inferFileType(f.filename ?? r2Key, format),
      file_size_mb: f.size_mb ?? 0,
      column_stats: f.column_stats,
      // Spec T3 — lấy từ metadata top-level (real actor), không hardcode "demo"
      uploaded_by: uploadedBy ?? "unknown",
      uploaded_at: uploadedAt ?? new Date().toISOString(),
    };
  });

  const totalSizeMb = files.reduce((sum, f) => sum + (f.size_mb ?? 0), 0);
  return { resources, totalSizeMb };
}

function inferResourceType(
  filename: string,
  format?: string,
): Resource["resource_type"] {
  const f = format ?? filename.split(".").pop() ?? "";
  if (f === "pdf") return "document";
  if (f === "mp3") return "audio";
  if (f === "geojson" || f === "json") return "geo_layer";
  return "data";
}

function inferFileType(
  filename: string,
  format?: string,
): Resource["file_type"] {
  if (format === "csv" || format === "xlsx" || format === "pdf" || format === "mp3" || format === "geojson") {
    return format;
  }
  const ext = filename.split(".").pop();
  if (ext === "csv" || ext === "xlsx" || ext === "pdf" || ext === "mp3" || ext === "geojson" || ext === "json") {
    return ext;
  }
  return "csv";
}

export function metadataToDataset(
  meta: MetadataYaml,
  dictionary: DataDictionaryEntry[],
): Dataset {
  const format = typeof meta.format === "string" ? meta.format : undefined;
  const { resources, totalSizeMb } = mapFilesToResources(
    meta.files,
    format,
    meta.uploaded_by,
    meta.uploaded_at,
  );
  const temporal = meta.coverage?.temporal ?? [];
  const year_range = temporal
    .map((t) => (typeof t === "number" ? t : parseInt(String(t), 10)))
    .filter((n) => !isNaN(n));

  return {
    slug: meta.slug,
    title: meta.title,
    description: meta.description,
    category: (meta.category as Dataset["category"]) ?? "xa-hoi",
    tags: meta.tags ?? [],
    license: (meta.license as Dataset["license"]) ?? "internal",
    year_range,
    row_count: meta.row_count ?? 0,
    file_count: meta.files?.length ?? 0,
    total_size_mb: totalSizeMb,
    downloads: 0,
    likes: 0,
    source: flattenSource(meta.source),
    source_url: extractSourceUrl(meta.source),
    uploaded_by: meta.uploaded_by ?? "unknown",
    uploaded_at: meta.uploaded_at ?? new Date().toISOString(),
    // Auth nhẹ (spec D2) — optional, undefined cho dataset chưa edit
    last_edited_by: meta.last_edited_by,
    last_edited_at: meta.last_edited_at,
    edits: meta.edits,
    resources,
    data_dictionary: dictionary,
    // GeoJSON-only — undefined cho tabular/pdf/mp3.
    feature_count: meta.feature_count,
    geometry_type: meta.geometry_type,
    bbox:
      Array.isArray(meta.bbox) && meta.bbox.length === 4
        ? [meta.bbox[0], meta.bbox[1], meta.bbox[2], meta.bbox[3]]
        : undefined,
    crs: meta.crs,
    // Articles (spec 2026-07-24) — provenance ngược từ bài báo VNExpress.
    articles: meta.articles,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/** Read 1 dataset by slug từ GitHub raw metadata.yaml + dictionary.md. */
async function getDatasetBySlugImpl(slug: string): Promise<Dataset | null> {
  // Fetch metadata.yaml + dictionary.md + download counter song song
  // (độc lập, không phụ thuộc nhau) → giảm latency tổng.
  const [yamlText, dictText, downloads] = await Promise.all([
    fetchRaw(`datasets/${slug}/metadata.yaml`),
    fetchRaw(`datasets/${slug}/dictionary.md`),
    getDownloadCount(slug),
  ]);

  if (!yamlText) return null;

  const meta = parseYaml(yamlText) as MetadataYaml;
  if (!meta || typeof meta !== "object" || !meta.title) {
    console.warn(`[datasets] metadata.yaml không hợp lệ cho slug: ${slug}`);
    return null;
  }

  // Skip soft-deleted — spec D3, detail page return null → 404
  if (meta.status === "deleted") return null;

  const dictionary = dictText ? parseDictionaryMarkdown(dictText) : [];
  const dataset = metadataToDataset(meta, dictionary);
  // Hydrate downloads từ R2 counter (luôn >= 0, không bao giờ undefined)
  dataset.downloads = downloads;
  return dataset;
}

/**
 * Cached metadata fetch — cross-request cache 60s + invalidate qua tag
 * "datasets" (revalidateTag ở upload/edit/delete routes).
 *
 * Dùng cho listing/generateMetadata — không bao gồm preview data.
 * Detail page dùng `getDatasetDetail` (bao gồm cả preview).
 */
const getDatasetBySlugMemo = cache(getDatasetBySlugImpl);

export const getDatasetBySlug = unstable_cache(getDatasetBySlugMemo, [
  "dataset-by-slug-v1",
], {
  revalidate: 60,
  tags: ["datasets"],
});

/**
 * Detail fetch bao gồm preview data (structured_data cho DatasetViewer).
 *
 * Cache bao gồm cả kết quả `withPreviewData` (fetch + parse file CSV/XLSX/GeoJSON).
 * Sau hit đầu mỗi phút: detail page 3s → ~50ms.
 *
 * `withPreviewData` mutate dataset.resources[].structured_data in-place — đã
 * included trong cached result.
 */
async function getDatasetDetailImpl(slug: string): Promise<Dataset | null> {
  // Gọi impl trực tiếp (không qua cache layer) — tránh double-cache với
  // getDatasetBySlug. getDatasetDetail là cache outermost.
  const dataset = await getDatasetBySlugImpl(slug);
  if (!dataset) return null;
  await withPreviewData(dataset);
  return dataset;
}

const getDatasetDetailMemo = cache(getDatasetDetailImpl);

export const getDatasetDetail = unstable_cache(getDatasetDetailMemo, [
  "dataset-detail-v1",
], {
  revalidate: 60,
  tags: ["datasets"],
});

/** Get raw MetadataYaml (không map) — cho commit route check slug exists. */
export async function getMetadataYaml(
  slug: string,
): Promise<MetadataYaml | null> {
  const yamlText = await fetchRaw(`datasets/${slug}/metadata.yaml`);
  if (!yamlText) return null;
  return parseYaml(yamlText) as MetadataYaml;
}

/**
 * Get raw metadata.yaml text (không parse) — cho edit route merge auth fields.
 *
 * Trả về text thay vì object vì `injectEdited`/`mergeAuthFields` làm việc với text
 * (parse → mutate → stringify) để giữ formatting + comments tối đa.
 */
export async function getMetadataYamlRaw(
  slug: string,
): Promise<string | null> {
  return fetchRaw(`datasets/${slug}/metadata.yaml`);
}

export type { DictionaryEntry, GithubConfig, MetadataYaml };
