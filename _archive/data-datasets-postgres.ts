/**
 * Data access layer — nguồn dữ liệu thật từ Supabase.
 *
 * Frontend server components import `listDatasets()` / `getDatasetBySlug()`
 * thay vì mock. Row mapping từ Postgres → Dataset type ở đây.
 */

import { getSupabase } from "@/lib/db/supabase";
import type {
  Dataset,
  Resource,
  DataDictionaryEntry,
  ColumnStats,
} from "@/lib/types/dataset";

// ──────────────────────────────────────────────────────────────────────────────
// Postgres row shapes (từ Supabase JS client — JSON, đã parse)
// ──────────────────────────────────────────────────────────────────────────────

interface DatasetRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  license: string | null;
  year_range: number[] | null;
  row_count: number | null;
  file_count: number | null;
  total_size_mb: number | null;
  downloads: number | null;
  likes: number | null;
  source: string | null;
  uploaded_by: string;
  uploaded_at: string;
  updated_at: string;
}

interface ResourceRow {
  id: number;
  dataset_id: number;
  resource_type: string;
  title: string;
  description: string | null;
  file_url: string | null;
  file_type: string | null;
  file_size_mb: number | null;
  structured_data: Record<string, unknown>[] | null;
  columns:
    | Array<{ name: string; type: string; label_vi: string }>
    | string[]
    | null;
  column_stats: Record<string, unknown> | null;
  row_count: number | null;
  tags: string[] | null;
  year: number | null;
  uploaded_by: string;
  uploaded_at: string;
}

interface DictionaryRow {
  id: number;
  dataset_id: number;
  column_name: string;
  label_vi: string;
  data_type: string | null;
  unit: string | null;
  description: string | null;
  source: string | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mappers
// ──────────────────────────────────────────────────────────────────────────────

function mapDataset(row: DatasetRow): Dataset {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description ?? "",
    category: (row.category as Dataset["category"]) ?? "xa-hoi",
    tags: row.tags ?? [],
    license: (row.license as Dataset["license"]) ?? "internal",
    year_range: row.year_range ?? [],
    row_count: row.row_count ?? 0,
    file_count: row.file_count ?? 0,
    total_size_mb: Number(row.total_size_mb ?? 0),
    downloads: row.downloads ?? 0,
    likes: row.likes ?? 0,
    source: row.source ?? "",
    uploaded_by: row.uploaded_by,
    uploaded_at: row.uploaded_at,
    resources: [],
    data_dictionary: [],
  };
}

/**
 * Parse raw column_stats JSONB (từ DB) → discriminated ColumnStats union.
 * DB không có field `kind` — infer từ presence của `histogram` vs `segments`.
 * Numbers có thể đến dưới dạng string từ JSON → coerce.
 */
function mapColumnStats(
  raw: Record<string, unknown> | null,
): Record<string, ColumnStats> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, ColumnStats> = {};
  for (const [col, val] of Object.entries(raw)) {
    if (!val || typeof val !== "object") continue;
    const v = val as Record<string, unknown>;
    if (Array.isArray(v.histogram)) {
      // numeric
      out[col] = {
        kind: "numeric",
        min: Number(v.min),
        max: Number(v.max),
        histogram: (v.histogram as unknown[]).map((n) => Number(n)),
      };
    } else if (Array.isArray(v.segments)) {
      // categorical
      out[col] = {
        kind: "categorical",
        distinct: Number(v.distinct ?? 0),
        segments: (v.segments as Array<Record<string, unknown>>).map((s) => ({
          label: String(s.label),
          count: Number(s.count),
        })),
      };
    }
    // entries without histogram/segments are skipped (e.g. null stats for missing columns)
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function mapResource(row: ResourceRow): Resource {
  // columns có thể là array của {name,type,label_vi} (từ seed JSONB) hoặc array string
  let columns: string[] | undefined;
  if (Array.isArray(row.columns) && row.columns.length > 0) {
    if (typeof row.columns[0] === "string") {
      columns = row.columns as string[];
    } else {
      columns = (row.columns as Array<{ name: string }>).map((c) => c.name);
    }
  }

  // structured_data: ép kiểu an toàn về Record<string, primitive|null>
  const structured = row.structured_data?.map((r) => {
    const out: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(r)) {
      out[k] =
        typeof v === "string" || typeof v === "number" || typeof v === "boolean"
          ? v
          : v === null || v === undefined
            ? null
            : String(v);
    }
    return out;
  });

  // column_stats: parse raw JSONB → discriminated ColumnStats union
  const column_stats = mapColumnStats(row.column_stats);

  return {
    id: row.id,
    resource_type: row.resource_type as Resource["resource_type"],
    title: row.title,
    description: row.description ?? undefined,
    file_url: row.file_url ?? undefined,
    file_type: (row.file_type as Resource["file_type"]) ?? undefined,
    file_size_mb: row.file_size_mb ?? undefined,
    structured_data: structured,
    columns,
    column_stats,
    tags: row.tags ?? undefined,
    year: row.year ?? undefined,
    uploaded_by: row.uploaded_by,
    uploaded_at: row.uploaded_at,
  };
}

function mapDictionary(row: DictionaryRow): DataDictionaryEntry {
  return {
    column_name: row.column_name,
    label_vi: row.label_vi,
    data_type: (row.data_type as DataDictionaryEntry["data_type"]) ?? "text",
    unit: row.unit ?? undefined,
    description: row.description ?? undefined,
    source: row.source ?? undefined,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/** Listing: metadata only (không resources/dictionary — nhẹ cho trang `/`) */
export async function listDatasets(): Promise<Dataset[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("datasets")
    .select("*")
    .order("uploaded_at", { ascending: false });

  if (error) {
    throw new Error(`listDatasets failed: ${error.message}`);
  }
  return (data as DatasetRow[]).map(mapDataset);
}

/** Detail: dataset + resources + data_dictionary, assemble thành 1 Dataset */
export async function getDatasetBySlug(
  slug: string,
): Promise<Dataset | null> {
  const supabase = getSupabase();

  const { data: dsRow, error: dsErr } = await supabase
    .from("datasets")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (dsErr) {
    throw new Error(`getDatasetBySlug failed: ${dsErr.message}`);
  }
  if (!dsRow) return null;

  const dataset = mapDataset(dsRow as DatasetRow);
  const dsId = (dsRow as DatasetRow).id;

  const { data: resRows, error: resErr } = await supabase
    .from("resources")
    .select("*")
    .eq("dataset_id", dsId)
    .order("id", { ascending: true });

  if (resErr) {
    throw new Error(`getDatasetBySlug resources failed: ${resErr.message}`);
  }
  dataset.resources = (resRows as ResourceRow[]).map(mapResource);

  const { data: dictRows, error: dictErr } = await supabase
    .from("data_dictionary")
    .select("*")
    .eq("dataset_id", dsId)
    .order("id", { ascending: true });

  if (dictErr) {
    throw new Error(`getDatasetBySlug dictionary failed: ${dictErr.message}`);
  }
  dataset.data_dictionary = (dictRows as DictionaryRow[]).map(mapDictionary);

  return dataset;
}
