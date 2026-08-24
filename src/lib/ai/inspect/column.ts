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
      const step = (max - min) / BINS || 1;
      const histogram = new Array(BINS).fill(0);
      for (const v of values) {
        let idx = Math.floor((v - min) / step);
        if (idx >= BINS) idx = BINS - 1;
        if (idx < 0) idx = 0;
        histogram[idx]++;
      }
      result[col] = { kind: "numeric", min, max, histogram };
    } else {
      const counts = new Map<string, number>();
      for (const row of allRows) {
        const raw = row[col];
        if (raw == null || raw === "") continue;
        const key = String(raw);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (counts.size === 0) continue;
      const segments = Array.from(counts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);
      result[col] = { kind: "categorical", distinct: counts.size, segments };
    }
  }

  return result;
}
