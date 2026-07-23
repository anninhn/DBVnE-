/**
 * Dataset domain types — dùng chung cho data layer, mock, và frontend.
 *
 * Bám theo constitution/tech-stack.md Data Model (dataset-centric).
 * Frontend components import các type này; dữ liệu thật đến từ Supabase
 * qua src/lib/data/datasets.ts.
 */

export type ResourceType =
  | "data"
  | "document"
  | "audio"
  | "geo_layer"
  | "image";

export type FileType = "csv" | "xlsx" | "pdf" | "mp3" | "geojson" | "json";

export type Category =
  | "kinh-te"
  | "xa-hoi"
  | "chinh-tri"
  | "khi-hau"
  | "ha-tang";

export interface DataDictionaryEntry {
  column_name: string;
  label_vi: string;
  data_type: "int" | "float" | "text" | "date";
  unit?: string;
  description?: string;
  source?: string;
  /**
   * Frictionless Data Table Schema: ký tự phân cách thập phân.
   * Mặc định `.` (canonical). `,` cho định dạng Việt Nam / châu Âu.
   * Parser đọc field này để parse đúng số từ raw cell.
   * See: https://frictionlessdata.io/specs/table-schema/
   */
  decimal_char?: "." | ",";
  /**
   * Frictionless Data Table Schema: ký tự nhóm hàng nghìn.
   * Mặc định `,`. `.` cho định dạng Việt Nam. `" "` cho chuẩn ISO 31-0.
   */
  group_char?: "." | "," | " ";
}

export interface Resource {
  id: number;
  resource_type: ResourceType;
  title: string;
  description?: string;
  file_url?: string;
  file_type?: FileType;
  file_size_mb?: number;
  /** Preview rows (first N) — DatasetViewer render table từ đây */
  structured_data?: Record<string, string | number | boolean | null>[];
  /** Column order override; fallback = keys của structured_data[0] */
  columns?: string[];
  /**
   * Precomputed per-column statistics over the FULL dataset (not the preview).
   * Computed at seed time, stored in DB. Viewer reads these for charts.
   * If absent, viewer falls back to computing from structured_data (preview only).
   * See specs/2026-06-24-column-statistics/.
   */
  column_stats?: Record<string, ColumnStats>;
  tags?: string[];
  year?: number;
  uploaded_by: string;
  uploaded_at: string; // ISO
}

/**
 * Stats cho 1 cột. Phân biệt bằng `kind`:
 *  - numeric: min/max + histogram (8 bins) — render bar chart
 *  - categorical: distinct count + top segments — render proportion bar
 */
export type ColumnStats =
  | { kind: "numeric"; min: number; max: number; histogram: number[] }
  | { kind: "categorical"; distinct: number; segments: { label: string; count: number }[] };

export interface Dataset {
  slug: string;
  title: string;
  description: string;
  category: Category;
  tags: string[];
  license: "internal" | "public" | "restricted";
  year_range: number[];
  row_count: number;
  file_count: number;
  total_size_mb: number;
  downloads: number;
  likes: number;
  source: string;
  source_url?: string;
  uploaded_by: string;
  uploaded_at: string; // ISO
  resources: Resource[];
  data_dictionary: DataDictionaryEntry[];
}

export const CATEGORY_LABELS: Record<Category, string> = {
  "kinh-te": "Kinh tế",
  "xa-hoi": "Xã hội",
  "chinh-tri": "Chính trị",
  "khi-hau": "Khí hậu",
  "ha-tang": "Hạ tầng",
};

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  data: "Dữ liệu",
  document: "Tài liệu",
  audio: "Ghi âm",
  geo_layer: "Bản đồ",
  image: "Hình ảnh",
};
