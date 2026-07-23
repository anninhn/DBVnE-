import * as XLSX from "xlsx";
import { parseCSVHead, forEachCSVRow } from "@/lib/parse/csv";
import { detectDecimalFormat, type DecimalFormat } from "@/lib/parse/decimal-detect";
import type { ColumnStats } from "@/lib/types/dataset";

export type TabularFormat = "csv" | "xlsx";

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
  format: TabularFormat;
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
}

const MAX_SAMPLE_ROWS_FOR_AI = 5;
const MAX_SAMPLE_VALUES_PER_COLUMN = 5;
const MAX_ROWS_FOR_INSPECTION = 1000; // cap để tránh file khổng lồ

// ──────────────────────────────────────────────────────────────────────────────
// Format detection
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Detect format từ filename.
 */
export function detectFormat(filename: string): TabularFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Full-dataset stats — streaming, không store rows
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Compute per-column stats từ FULL CSV dataset (streaming, không store rows).
 *
 * Numeric: accumulate values → min/max/histogram (8 bins) ở cuối.
 * Categorical: Map<value, count> → distinct + top-12 segments.
 *
 * Memory: O(numeric_rows × cols × 8 bytes) cho numeric values +
 *         O(distinct_cap × cols) cho categorical maps.
 * Không store toàn bộ rows → handle được hàng triệu rows.
 *
 * @param text CSV text (toàn bộ file, bao gồm header)
 * @param columnNames thứ tự cột (từ header row)
 * @param typeMap inferred type per column ("number" | "string" | "date")
 */
function computeCSVStats(
  text: string,
  columnNames: string[],
  typeMap: Map<string, string>
): Record<string, ColumnStats> {
  // Map column name → index trong row array
  const colIndex = new Map<string, number>();
  columnNames.forEach((col, i) => colIndex.set(col, i));

  // Numeric: store values để compute min/max/histogram
  const numericCols = columnNames.filter((c) => typeMap.get(c) === "number");
  const numericValues = new Map<string, number[]>();
  numericCols.forEach((c) => numericValues.set(c, []));

  // Categorical: Map<value, count>
  const catCols = columnNames.filter((c) => typeMap.get(c) !== "number");
  const catCounts = new Map<string, Map<string, number>>();
  catCols.forEach((c) => catCounts.set(c, new Map()));

  const DISTINCT_CAP = 10000;
  const catCapped = new Set<string>();
  let firstRow = true;

  forEachCSVRow(text, (fields) => {
    if (firstRow) {
      firstRow = false;
      return; // skip header
    }

    for (const col of numericCols) {
      const idx = colIndex.get(col)!;
      const raw = fields[idx];
      if (!raw) continue;
      const val = Number(raw);
      if (!Number.isNaN(val)) numericValues.get(col)!.push(val);
    }

    for (const col of catCols) {
      if (catCapped.has(col)) continue;
      const idx = colIndex.get(col)!;
      const raw = fields[idx];
      if (!raw || raw === "") continue;
      const counts = catCounts.get(col)!;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
      if (counts.size > DISTINCT_CAP) catCapped.add(col);
    }
  });

  // Build result
  const result: Record<string, ColumnStats> = {};

  // Numeric: min/max + histogram
  const BINS = 8;
  for (const [col, values] of numericValues) {
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
  }

  // Categorical: distinct + top-12 segments
  for (const [col, counts] of catCounts) {
    if (counts.size === 0) continue;
    const segments = Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
    result[col] = {
      kind: "categorical",
      distinct: counts.size,
      segments,
    };
  }

  return result;
}

/**
 * Compute stats từ XLSX rows (đã load full vào memory qua xlsx package).
 * XLSX files trong app đều nhỏ (< 1MB) → safe parse full.
 */
function computeXlsxStats(
  allRows: Record<string, unknown>[],
  columnNames: string[],
  typeMap: Map<string, string>
): Record<string, ColumnStats> {
  const result: Record<string, ColumnStats> = {};
  const BINS = 8;

  for (const col of columnNames) {
    const isNumeric = typeMap.get(col) === "number";

    if (isNumeric) {
      const values: number[] = [];
      for (const row of allRows) {
        const raw = row[col];
        if (raw == null || raw === "") continue;
        const val = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isNaN(val)) values.push(val);
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

// ──────────────────────────────────────────────────────────────────────────────
// Inspect functions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Inspect CSV buffer → FileInspection.
 *
 * 2 giai đoạn:
 * 1. parseCSVHead → first 1000 rows: type inference + sampleRows (cho AI)
 * 2. computeCSVStats → streaming toàn bộ file: min/max/histogram/distinct (cho UI)
 */
function inspectCsv(buffer: Buffer, filename: string): FileInspection {
  const text = buffer.toString("utf-8");

  // Giai đoạn 1: parse first MAX_ROWS_FOR_INSPECTION+1 rows (1 header + data)
  const { rows: rawRows, totalRowCount } = parseCSVHead(
    text,
    MAX_ROWS_FOR_INSPECTION + 1
  );

  if (rawRows.length === 0) {
    return {
      format: "csv",
      filename,
      rowCount: 0,
      columnCount: 0,
      columns: [],
      sampleRows: [],
    };
  }

  const columns = rawRows[0];
  // Map data rows (skip header) → objects
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (row.every((c) => c === "")) continue; // skipEmptyLines
    const obj: Record<string, string> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i] ?? "";
    });
    rows.push(obj);
  }

  const rowCount = Math.max(0, totalRowCount - 1);
  const columnInspections = columns.map((col) => inspectColumn(col, rows));

  // Giai đoạn 2: full-dataset stats (streaming, không store rows)
  const typeMap = new Map<string, string>();
  columnInspections.forEach((c) => typeMap.set(c.name, c.inferredType));
  const columnStats = computeCSVStats(text, columns, typeMap);

  return {
    format: "csv",
    filename,
    rowCount,
    columnCount: columns.length,
    columns: columnInspections,
    sampleRows: rows.slice(0, MAX_SAMPLE_ROWS_FOR_AI),
    columnStats,
  };
}

/**
 * Inspect XLSX buffer → FileInspection. Đọc sheet đầu tiên.
 */
function inspectXlsx(buffer: Buffer, filename: string): FileInspection {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("XLSX không có sheet nào");
  }
  const sheet = workbook.Sheets[sheetName];
  const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });
  const sliced = allRows.slice(0, MAX_ROWS_FOR_INSPECTION);

  // Column order từ keys của row đầu (giữ thứ tự xuất hiện)
  const columnSet = new Set<string>();
  sliced.forEach((r) => Object.keys(r).forEach((k) => columnSet.add(k)));
  const columns = Array.from(columnSet);

  const columnInspections = columns.map((col) =>
    inspectColumn(col, sliced as Record<string, string | number | boolean | null>[])
  );

  // Full-dataset stats (XLSX nhỏ → safe compute từ allRows)
  const typeMap = new Map<string, string>();
  columnInspections.forEach((c) => typeMap.set(c.name, c.inferredType));
  const columnStats = computeXlsxStats(allRows, columns, typeMap);

  return {
    format: "xlsx",
    filename,
    rowCount: allRows.length,
    columnCount: columns.length,
    columns: columnInspections,
    sampleRows:
      sliced.slice(0, MAX_SAMPLE_ROWS_FOR_AI) as Record<
        string,
        string | number | boolean | null
      >[],
    columnStats,
    sheetName,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Column inspection (từ sample rows — cho AI context)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Inspect 1 column → stats cơ bản + samples + decimal format detection.
 *
 * Detection Frictionless schema: nếu column có strong signal vi format (`1.234,56`)
 * hoặc en format (`1,234.56`), đề xuất decimal_char/group_char cho dictionary.
 */
function inspectColumn(
  name: string,
  rows: Record<string, string | number | boolean | null>[]
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
// Entry point
// ──────────────────────────────────────────────────────────────────────────────

export function inspectFile(
  buffer: Buffer,
  filename: string
): FileInspection {
  const format = detectFormat(filename);
  if (!format) {
    throw new Error(`Unsupported file format: ${filename}`);
  }
  if (format === "csv") return inspectCsv(buffer, filename);
  return inspectXlsx(buffer, filename);
}
