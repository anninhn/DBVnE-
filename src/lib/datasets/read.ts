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
import { parse as parseYaml } from "yaml";
import type {
  Dataset,
  Resource,
  DataDictionaryEntry,
} from "@/lib/types/dataset";
import { buildFileUrl } from "@/lib/r2/client";
import { getDownloadCount } from "@/lib/r2/counter";
import { parseCSV } from "@/lib/parse/csv";
import * as XLSX from "xlsx";
import {
  type DictionaryEntry,
  type GithubConfig,
  type MetadataYaml,
  getGithubConfig,
  rawUrl,
} from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// Fetch helpers
// ──────────────────────────────────────────────────────────────────────────────

async function fetchRaw(path: string): Promise<string | null> {
  const config = getGithubConfig();
  const url = rawUrl(config, path);
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "vnexpress-data-platform",
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
  };

  // Contents API: response JSON có field `content` base64-encoded
  const res = await fetch(url, { headers, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub contents API failed: ${path} (${res.status})`);
  }
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (!data.content) return null;
  // Contents API trả content base64-encoded, có newlines → strip trước khi decode
  const b64 = data.content.replace(/\n/g, "");
  return Buffer.from(b64, "base64").toString("utf-8");
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
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/** Read 1 dataset by slug từ GitHub raw metadata.yaml + dictionary.md. */
export const getDatasetBySlug = cache(async (slug: string): Promise<Dataset | null> => {
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

// ──────────────────────────────────────────────────────────────────────────────
// Preview enrichment — populate structured_data cho DatasetViewer (tab Dataset card)
// ──────────────────────────────────────────────────────────────────────────────

const PREVIEW_ROW_LIMIT = 1000;

/**
 * Coerce giá trị cell XLSX về primitive — đảm bảo RSC-serializable khi truyền
 * structured_data sang Client Component. Date → ISO string, object lạ → string.
 */
function coerceCell(v: unknown): string | number | boolean | null {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Fetch + parse resource tabular đầu tiên (CSV hoặc XLSX) trong dataset.resources,
 * gán vào resource.structured_data.
 *
 * Cho phép DatasetViewer render table + histogram ở tab "Dataset card" (SSR, không
 * flicker). Post-re-arch 2026-07-02 data nằm trong R2 nên mapFilesToResources không
 * set structured_data — helper này bù lại.
 *
 * Fail gracefully: lỗi fetch/parse → log + giữ nguyên (DatasetViewer render empty state).
 */
export async function withPreviewData(dataset: Dataset): Promise<Dataset> {
  const tabular = dataset.resources.find(
    (r) =>
      (r.file_type === "csv" || r.file_type === "xlsx" || r.file_type === "geojson") &&
      r.file_url,
  );
  if (!tabular?.file_url) return dataset;

  try {
    let headers: string[];
    let dataRows: Record<string, string | number | boolean | null>[];
    // Tổng số dòng thật (chỉ biết khi parse full file). CSV dùng Range chunk →
    // không biết tổng → null (không set dataset.row_count).
    let trueTotal: number | null = null;

    if (tabular.file_type === "csv") {
      // Range fetch ~1MB đầu — preview nhanh kể cả file 153MB. R2 hỗ trợ Range
      // (206 Partial Content). Full download + parse 153MB mất ~23s → không acceptable.
      const CHUNK = 1_048_576; // 1MB
      const res = await fetch(tabular.file_url, {
        headers: { Range: `bytes=0-${CHUNK - 1}` },
      });
      if (!res.ok) {
        console.warn(`[datasets] preview fetch failed (${res.status}) cho ${dataset.slug}`);
        return dataset;
      }
      const text = await res.text();
      const parsed = parseCSV(text);
      if (parsed.length < 2) return dataset;
      headers = parsed[0];
      const rowsAll = parsed.slice(1);
      // Dòng cuối chunk thường bị cắt ngang → bỏ nếu thiếu số cột.
      if (rowsAll.length > 0 && rowsAll[rowsAll.length - 1].length < headers.length) {
        rowsAll.pop();
      }
      dataRows = rowsAll.slice(0, PREVIEW_ROW_LIMIT).map((cells) => {
        const obj: Record<string, string | number | boolean | null> = {};
        headers.forEach((h, idx) => {
          obj[h] = cells[idx] ?? "";
        });
        return obj;
      });
    } else if (tabular.file_type === "xlsx") {
      // XLSX — parse full qua xlsx package (file XLSX trong app đều nhỏ < 1MB,
      // không range-parse được binary).
      // Rebuild từng row thành plain object {} với value primitive, vì sheet_to_json
      // có thể trả Date/cell-object (có methods) → RSC reject khi truyền sang Client
      // Component ("Only plain objects can be passed to Client Components").
      const res = await fetch(tabular.file_url);
      if (!res.ok) {
        console.warn(`[datasets] preview fetch failed (${res.status}) cho ${dataset.slug}`);
        return dataset;
      }
      const buf = await res.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: null,
      });
      if (jsonRows.length === 0) return dataset;
      headers = Object.keys(jsonRows[0]);
      trueTotal = jsonRows.length;
      dataRows = jsonRows.slice(0, PREVIEW_ROW_LIMIT).map((row) => {
        const obj: Record<string, string | number | boolean | null> = {};
        headers.forEach((h) => {
          obj[h] = coerceCell(row[h]);
        });
        return obj;
      });
    } else {
      // GeoJSON — flatten features.properties thành rows (table view ở Dataset card).
      // Skip file lớn (>10MB) vì fetch + JSON.parse blocking SSR; user vẫn xem table
      // ở tab "Files and versions" (client-side fetch). 169MB wards → skip, 18MB power → skip,
      // 2.2MB provinces → OK.
      if ((tabular.file_size_mb ?? 0) > 10) {
        console.info(
          `[datasets] GeoJSON ${dataset.slug} quá lớn (${tabular.file_size_mb}MB) — skip preview table`,
        );
        return dataset;
      }
      const res = await fetch(tabular.file_url);
      if (!res.ok) {
        console.warn(`[datasets] preview fetch failed (${res.status}) cho ${dataset.slug}`);
        return dataset;
      }
      const json = (await res.json()) as GeoJSON.FeatureCollection;
      const features = Array.isArray(json?.features) ? json.features : [];
      if (features.length === 0) return dataset;

      // Collect headers từ tất cả features (mỗi feature có thể có props khác nhau)
      const headerSet = new Set<string>();
      for (const f of features) {
        const props = f?.properties ?? {};
        for (const k of Object.keys(props)) headerSet.add(k);
      }
      headers = Array.from(headerSet);
      trueTotal = features.length;
      dataRows = features.slice(0, PREVIEW_ROW_LIMIT).map((f) => {
        const props = f?.properties ?? {};
        const obj: Record<string, string | number | boolean | null> = {};
        headers.forEach((h) => {
          obj[h] = coerceCell(props[h]);
        });
        return obj;
      });
    }

    tabular.structured_data = dataRows;
    tabular.columns = headers;
    // Backfill row_count chỉ khi biết tổng thật (XLSX full parse). CSV Range chunk
    // không biết tổng → không set.
    if (dataset.row_count === 0 && trueTotal != null) dataset.row_count = trueTotal;
  } catch (err) {
    console.warn(`[datasets] preview parse error cho ${dataset.slug}:`, err);
  }
  return dataset;
}

// ──────────────────────────────────────────────────────────────────────────────
// Row-count enrichment — listing fallback khi metadata thiếu row_count
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Đếm số dòng data của 1 resource tabular (CSV/XLSX) — fetch + parse full.
 * Trả null nếu không hợp lệ/lỗi. Phase 1 ít dataset → acceptable cho listing.
 */
async function countRows(resource: Resource): Promise<number | null> {
  if (!resource.file_url) return null;
  try {
    const res = await fetch(resource.file_url);
    if (!res.ok) return null;
    if (resource.file_type === "csv") {
      const parsed = parseCSV(await res.text());
      return Math.max(0, parsed.length - 1);
    }
    if (resource.file_type === "xlsx") {
      const buf = await res.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(sheet, { defval: null }).length;
    }
  } catch {
    // ignore — trả null
  }
  return null;
}

/**
 * Backfill row_count cho các dataset thiếu (metadata pre-row_count-persist).
 * Chỉ fetch resource tabular đầu tiên NHỎ (file_size_mb < SIZE_CAP_MB) — không
 * download file 153MB để count. Dùng ở listing (listDatasets) — self-healing cho
 * dataset nhỏ; dataset lớn phải có row_count trong metadata (persist lúc upload).
 */
const ROW_COUNT_SIZE_CAP_MB = 10;
export async function enrichRowCounts(datasets: Dataset[]): Promise<void> {
  await Promise.all(
    datasets.map(async (d) => {
      if (d.row_count > 0) return;
      const tabular = d.resources.find(
        (r) => r.file_type === "csv" || r.file_type === "xlsx",
      );
      if (!tabular) return;
      // Skip file lớn — download 153MB để count rows là quá đắt cho listing.
      if ((tabular.file_size_mb ?? 0) >= ROW_COUNT_SIZE_CAP_MB) return;
      const count = await countRows(tabular);
      if (count != null) d.row_count = count;
    }),
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Download-count enrichment — fetch R2 counters song song cho listing
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Hydrate `downloads` field cho mỗi dataset từ R2 counter file.
 *
 * R2 GET/object ~50ms, fetch song song nên listing 20 dataset vẫn ~50ms tổng
 * (không phải 20×50ms). Failures tự động trả 0 trong getDownloadCount.
 */
export async function enrichDownloadCounts(datasets: Dataset[]): Promise<void> {
  await Promise.all(
    datasets.map(async (d) => {
      d.downloads = await getDownloadCount(d.slug);
    }),
  );
}

export type { DictionaryEntry, GithubConfig, MetadataYaml };
