/**
 * Inspect layer — types + shared column helpers.
 *
 * Tách từ src/lib/ai/inspect.ts (refactor 2026-07-24-pre-launch-refactor).
 * Module này chứa:
 *   - Types: InspectionFormat, ColumnInspection, FileInspection
 *   - Constants: MAX_SAMPLE_*, MAX_ROWS_FOR_INSPECTION
 *   - inspectColumn: phân tích 1 cột từ sample rows (cho AI context)
 *   - computeStatsFromRows: full-dataset stats từ rows đã load (XLSX/GeoJSON)
 *
 * CSV dùng computeCSVStats riêng (streaming, không store rows) — xem ./csv.ts.
 */

import type { ColumnStats } from "@/lib/types/dataset";
import {
  detectDecimalFormat,
  type DecimalFormat,
} from "@/lib/parse/decimal-detect";
import { parseNumberWithSchema, type NumberSchema } from "@/lib/parse/number";
import type { GeoJsonGeometryType } from "@/lib/parse/geojson";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type InspectionFormat = "csv" | "xlsx" | "geojson";

export interface ColumnInspection {
  name: string;
  /** type infer từ sample — string | number | date | boolean */
  inferredType: string;
  /** basic stats */
  nullCount: number;
  uniqueCount: number;
  /** numeric only */
  min?: number;
  max?: number;
  /** sample values (3-5) để AI hiểu context */
  samples: (string | number | boolean | null)[];
  /**
   * Frictionless schema đề xuất từ auto-detect ("vi" | "en" | "unknown").
   * Chỉ áp dụng cho cột numeric — chỉ ra decimal_char/group_char cần dùng.
   * AI sẽ dùng làm gợi ý ban đầu; user có thể override trong wizard.
   */
  decimalFormat?: DecimalFormat;
  /** Schema đề xuất chi tiết (decimal_char + group_char) khi decimalFormat !== "unknown" */
  decimalSchema?: { decimal_char: "." | ","; group_char: "." | "," };
}

export interface FileInspection {
  format: InspectionFormat;
  filename: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnInspection[];
  /** 5 sample rows cho AI context */
  sampleRows: Record<string, string | number | boolean | null>[];
  /**
   * Full-dataset stats per column — computed streaming, không từ sample.
   * DatasetViewer dùng cho histogram/proportion bar/min-max display.
   */
  columnStats?: Record<string, ColumnStats>;
  /** sheet name nếu XLSX */
  sheetName?: string;
  /** GeoJSON-only: số features (tương đương rowCount cho GeoJSON) */
  featureCount?: number;
  /** GeoJSON-only: majority geometry type */
  geometryType?: GeoJsonGeometryType;
  /** GeoJSON-only: [minLng, minLat, maxLng, maxLat] */
  bbox?: [number, number, number, number];
  /** GeoJSON-only: CRS string, vd "EPSG:4326" */
  crs?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Số giá trị tối đa lưu cho một cột phân loại khi lưu ĐỦ.
 *
 * Ngưỡng 200 chốt ở `specs/005-discovery-chat-scale/spec.md` § Clarifications, dựa
 * trên số đo 203 cột phân loại của bộ dữ liệu Cục Thống kê: median 32, p90 71, cao
 * nhất 100. Ngưỡng 200 phủ trọn bộ hiện tại và dư gấp đôi, đồng thời vẫn cắt dữ liệu
 * cấp xã/phường (~3.300 đơn vị) — chỗ đúng ra phải cắt.
 */
export const MAX_STORED_SEGMENTS = 200;

/**
 * Số giá trị lưu khi cột VƯỢT ngưỡng trên. Chỉ đủ để vẽ thanh tỷ lệ — mục đích ban
 * đầu của `segments`. Cột như vậy luôn kèm `complete: false`.
 */
export const TRUNCATED_SEGMENTS = 12;

export const MAX_SAMPLE_ROWS_FOR_AI = 5;
export const MAX_SAMPLE_VALUES_PER_COLUMN = 5;
export const MAX_ROWS_FOR_INSPECTION = 1000; // cap để tránh file khổng lồ

// ──────────────────────────────────────────────────────────────────────────────
// inspectColumn — từ sample rows, cho AI context
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Inspect 1 column → stats cơ bản + samples + decimal format detection.
 *
 * Detection Frictionless schema: nếu column có strong signal vi format (`1.234,56`)
 * hoặc en format (`1,234.56`), đề xuất decimal_char/group_char cho dictionary.
 */
export function inspectColumn(
  name: string,
  rows: Record<string, string | number | boolean | null>[],
): ColumnInspection {
  const values = rows.map((r) => r[name] ?? null);
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
  const uniqueValues = new Set(nonNull.map(String));
  const nullCount = values.length - nonNull.length;

  // Try numeric infer (theo canonical `.` — không biết vi format)
  const numericSamples = nonNull
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));
  const isNumeric =
    numericSamples.length > 0 && numericSamples.length / nonNull.length > 0.8;

  let inferredType = "string";
  let min: number | undefined;
  let max: number | undefined;
  if (isNumeric) {
    inferredType = "number";
    min = Math.min(...numericSamples);
    max = Math.max(...numericSamples);
  } else {
    // Try date
    const dateSamples = nonNull
      .filter((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v)))
      .slice(0, 3);
    if (dateSamples.length / Math.max(nonNull.length, 1) > 0.5) {
      inferredType = "date";
    }
  }

  // Auto-detect decimal format (Frictionless schema proposal)
  // Chỉ detect cho cột có vẻ numeric nhưng parse `.` fail (có thể là vi format)
  // hoặc cho mọi cột string có digits — đều chạy detection.
  let decimalFormat: DecimalFormat | undefined;
  let decimalSchema: ColumnInspection["decimalSchema"];
  if (inferredType !== "date") {
    const stringSamples = nonNull.map(String);
    const detection = detectDecimalFormat(stringSamples);
    if (detection.format !== "unknown") {
      decimalFormat = detection.format;
      decimalSchema = detection.schema;
      // Nếu detect vi và column chưa được infer là number, có thể là do parse `.` fail
      // → mark là number với schema vi
      if (detection.format === "vi" && inferredType !== "number") {
        inferredType = "number";
        // Re-compute min/max với schema vi
        const viNumbers = stringSamples
          .map((s) => {
            // Strip group_char `.`, đổi `,` decimal → `.`, parseFloat
            const normalized = s.replace(/\./g, "").replace(",", ".");
            const n = parseFloat(normalized);
            return Number.isFinite(n) ? n : NaN;
          })
          .filter((n) => !Number.isNaN(n));
        if (viNumbers.length > 0) {
          min = Math.min(...viNumbers);
          max = Math.max(...viNumbers);
        }
      }
    }
  }

  return {
    name,
    inferredType,
    nullCount,
    uniqueCount: uniqueValues.size,
    min,
    max,
    samples: nonNull.slice(0, MAX_SAMPLE_VALUES_PER_COLUMN).map(String),
    decimalFormat,
    decimalSchema,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// computeStatsFromRows — full-dataset stats từ rows đã load (XLSX, GeoJSON)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Compute stats từ rows đã load full vào memory (XLSX hoặc GeoJSON features.properties).
 *
 * XLSX files trong app đều nhỏ (< 1MB) → safe parse full.
 * GeoJSON feature_count cap ở STATS_FEATURE_CAP (10000) → safe parse first N features.
 */
/**
 * Số cột tối đa khi đếm theo từng giá trị.
 *
 * Biểu đồ rộng 110px, nên 16 cột là ~6,9px mỗi cột — vẫn phân biệt được. Nhiều
 * hơn thì quay về chia khoảng.
 */
const MAX_PER_VALUE_BARS = 16;

/**
 * Thống kê một cột số: chọn giữa **đếm theo giá trị** và **chia theo khoảng**.
 *
 * 1. **Ít giá trị khác nhau (≤16) → một cột mỗi giá trị.** Chia khoảng ở đây tạo
 *    ra hình dạng KHÔNG có trong dữ liệu: đo thực tế cột `Tháng` (12 tháng × 345
 *    dòng, đều tuyệt đối) bị 8 khoảng rộng 1,375 tháng biến thành
 *    `[690,345,690,345,345,690,345,690]`, và cột `Năm` 7 năm đều nhau ra
 *    `[21,21,21,0,21,21,21,21]` — một khoảng RỖNG giữa dữ liệu đầy.
 *    Quét toàn kho: 480/1469 cột số (32,7%) rơi vào nhóm bị chia bin sai kiểu.
 *
 * 2. **Cột nguyên nhiều giá trị → bề rộng khoảng là SỐ NGUYÊN.** Nguồn của hiện
 *    tượng xen kẽ là bề rộng lẻ (1,375 tháng): khoảng này chứa 2 giá trị, khoảng
 *    kia chứa 1. Bề rộng nguyên thì mọi khoảng chứa cùng số giá trị khả dĩ.
 *
 * 3. **Cột thực → chia đều `min`…`max`** như cũ.
 *
 * Thứ tự cột luôn theo GIÁ TRỊ, không theo số đếm. Với cột năm/tháng thì thứ tự
 * thời gian là thông tin quan trọng nhất — sắp theo số đếm thì một dataset hụt
 * hẳn một năm nhìn y như một dataset đủ.
 */
export function numericStats(
  values: number[],
  min: number,
  max: number,
  bins: number,
): ColumnStats {
  const uniq = Array.from(new Set(values)).sort((a, b) => a - b);
  const distinct = uniq.length;

  if (distinct <= MAX_PER_VALUE_BARS) {
    const counts = new Map<number, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return {
      kind: "numeric",
      min,
      max,
      distinct,
      values: uniq,
      histogram: uniq.map((v) => counts.get(v) ?? 0),
    };
  }

  const allInt =
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    values.every((v) => Number.isInteger(v));

  if (allInt) {
    const span = max - min + 1;
    const width = Math.max(1, Math.ceil(span / bins));
    const n = Math.ceil(span / width);
    const histogram = new Array(n).fill(0);
    for (const v of values) {
      let idx = Math.floor((v - min) / width);
      if (idx >= n) idx = n - 1;
      if (idx < 0) idx = 0;
      histogram[idx]++;
    }
    return { kind: "numeric", min, max, distinct, histogram };
  }

  const step = (max - min) / bins || 1;
  const histogram = new Array(bins).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - min) / step);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    histogram[idx]++;
  }
  return { kind: "numeric", min, max, distinct, histogram };
}

export function computeStatsFromRows(
  allRows: Record<string, unknown>[],
  columnNames: string[],
  typeMap: Map<string, string>,
  /**
   * Schema thập phân mỗi cột (từ `inspectColumn().decimalSchema`).
   * BẮT BUỘC truyền cho cột số kiểu Việt Nam: `Number("1.234,56")` → NaN → giá trị
   * bị loại khỏi `column_stats` lưu trong metadata.yaml, mâu thuẫn chính quyết định
   * Frictionless của dự án. Bỏ trống = hành vi cũ (parse kiểu Anh).
   */
  schemaMap?: Map<string, NumberSchema | undefined>,
): Record<string, ColumnStats> {
  const result: Record<string, ColumnStats> = {};
  const BINS = 8;

  for (const col of columnNames) {
    const isNumeric = typeMap.get(col) === "number";

    if (isNumeric) {
      const schema = schemaMap?.get(col);
      const values: number[] = [];
      for (const row of allRows) {
        const raw = row[col];
        if (raw == null || raw === "") continue;
        if (typeof raw === "number") {
          if (!Number.isNaN(raw)) values.push(raw);
          continue;
        }
        const parsed = parseNumberWithSchema(String(raw), schema);
        if (parsed !== null) values.push(parsed);
      }
      if (values.length === 0) continue;
      let min = Infinity;
      let max = -Infinity;
      for (const v of values) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      result[col] = numericStats(values, min, max, BINS);
    } else {
      const counts = new Map<string, number>();
      for (const row of allRows) {
        const raw = row[col];
        if (raw == null || raw === "") continue;
        const key = String(raw);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (counts.size === 0) continue;
      const complete = counts.size <= MAX_STORED_SEGMENTS;
      const segments = Array.from(counts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, complete ? counts.size : TRUNCATED_SEGMENTS);
      result[col] = { kind: "categorical", distinct: counts.size, segments, complete };
    }
  }

  return result;
}
