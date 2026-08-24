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
  | "dan-so"
  | "xa-hoi"
  | "giao-duc"
  | "y-te"
  | "moi-truong"
  | "chinh-tri"
  | "khi-hau"
  | "ha-tang"
  | "khac";

/**
 * Edit history entry — mirror MetadataYaml.edits[] (spec D2).
 * Canonical location — `src/lib/datasets/types.ts` re-export từ đây.
 */
export interface EditEntry {
  by: string;        // username
  at: string;        // ISO datetime
  summary?: string;  // vd: "Edit metadata", auto-generated
}

/**
 * Article link — mirror MetadataYaml.articles[] (spec 2026-07-24-article-linking).
 * Canonical location — `src/lib/datasets/types.ts` re-export từ đây.
 */
export interface ArticleEntry {
  url: string;
  title: string;
  author?: string;
  published_at?: string;
  section?: string;
  thumbnail?: string;
  added_at: string;
  added_by: string;
}

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
 *
 * Canonical location — `src/lib/datasets/types.ts` re-export từ đây.
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
  /** Auth nhẹ (spec 2026-07-24) — actor tracking */
  last_edited_by?: string;
  last_edited_at?: string; // ISO
  /** Full edit history — append mỗi lần user edit metadata (spec D2). */
  edits?: EditEntry[];
  resources: Resource[];
  data_dictionary: DataDictionaryEntry[];
  /** GeoJSON-only — undefined cho tabular/pdf/mp3. */
  feature_count?: number;
  geometry_type?: string;
  bbox?: [number, number, number, number];
  crs?: string;
  /** Articles — provenance ngược, bài báo đã dùng dataset (spec 2026-07-24). */
  articles?: ArticleEntry[];
}

/**
 * NGUỒN SỰ THẬT DUY NHẤT cho category.
 *
 * Trước 2026-08-24: MetadataEditor cho chọn 9 giá trị, DatasetExplorer lọc theo 6.
 * Hệ quả: dataset lưu với `moi-truong`/`dan-so`/`y-te`/`khac` KHÔNG BAO GIỜ hiện
 * trong filter Category. Đo thực tế lúc phát hiện: 8/17 dataset (nguyên bộ Rừng VN)
 * vô hình. Ngược lại `xa-hoi` có trong filter nhưng không chọn được lúc upload.
 *
 * Mọi nơi (upload form, filter sidebar, type union) PHẢI đọc từ hằng số này.
 */
export const CATEGORY_LABELS: Record<Category, string> = {
  "kinh-te": "Kinh tế",
  "dan-so": "Dân số",
  "xa-hoi": "Xã hội",
  "giao-duc": "Giáo dục",
  "y-te": "Y tế",
  "moi-truong": "Môi trường",
  "chinh-tri": "Chính trị",
  "khi-hau": "Khí hậu",
  "ha-tang": "Hạ tầng",
  khac: "Khác",
};

/** Thứ tự hiển thị trong filter sidebar + dropdown upload. */
export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  data: "Dữ liệu",
  document: "Tài liệu",
  audio: "Ghi âm",
  geo_layer: "Bản đồ",
  image: "Hình ảnh",
};
