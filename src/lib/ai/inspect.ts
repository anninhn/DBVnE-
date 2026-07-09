import * as XLSX from "xlsx";
import { parseCSV } from "@/lib/parse/csv";

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
}

export interface FileInspection {
  format: TabularFormat;
  filename: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnInspection[];
  /** 5 sample rows cho AI context */
  sampleRows: Record<string, string | number | boolean | null>[];
  /** sheet name nếu XLSX */
  sheetName?: string;
}

const MAX_SAMPLE_ROWS_FOR_AI = 5;
const MAX_SAMPLE_VALUES_PER_COLUMN = 5;
const MAX_ROWS_FOR_INSPECTION = 1000; // cap để tránh file khổng lồ

/**
 * Detect format từ filename.
 */
export function detectFormat(filename: string): TabularFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  return null;
}

/**
 * Inspect CSV/TSV buffer → FileInspection.
 *
 * Dùng native parseCSV (D6) — không papaparse. Header row → objects keyed by column name.
 */
function inspectCsv(buffer: Buffer, filename: string): FileInspection {
  const text = buffer.toString("utf-8");
  const rawRows = parseCSV(text);
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
  // Map rows (skip header) → objects, skip empty rows
  const allRows: Record<string, string>[] = [];
  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (row.every((c) => c === "")) continue; // skipEmptyLines
    const obj: Record<string, string> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i] ?? "";
    });
    allRows.push(obj);
  }

  const rows = allRows.slice(0, MAX_ROWS_FOR_INSPECTION);

  return {
    format: "csv",
    filename,
    rowCount: allRows.length,
    columnCount: columns.length,
    columns: columns.map((col) => inspectColumn(col, rows)),
    sampleRows: rows.slice(0, MAX_SAMPLE_ROWS_FOR_AI),
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
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });
  const sliced = rows.slice(0, MAX_ROWS_FOR_INSPECTION);

  // Column order từ keys của row đầu (giữ thứ tự xuất hiện)
  const columnSet = new Set<string>();
  sliced.forEach((r) => Object.keys(r).forEach((k) => columnSet.add(k)));
  const columns = Array.from(columnSet);

  return {
    format: "xlsx",
    filename,
    rowCount: rows.length,
    columnCount: columns.length,
    columns: columns.map((col) => inspectColumn(col, sliced as Record<string, string | number | boolean | null>[])),
    sampleRows: sliced.slice(0, MAX_SAMPLE_ROWS_FOR_AI) as Record<string, string | number | boolean | null>[],
    sheetName,
  };
}

/**
 * Inspect 1 column → stats cơ bản + samples.
 */
function inspectColumn(
  name: string,
  rows: Record<string, string | number | boolean | null>[]
): ColumnInspection {
  const values = rows.map((r) => r[name] ?? null);
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
  const uniqueValues = new Set(nonNull.map(String));
  const nullCount = values.length - nonNull.length;

  // Try numeric infer
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

  return {
    name,
    inferredType,
    nullCount,
    uniqueCount: uniqueValues.size,
    min,
    max,
    samples: nonNull.slice(0, MAX_SAMPLE_VALUES_PER_COLUMN).map(String),
  };
}

/**
 * Entry point — inspect file dựa trên format detect từ filename.
 */
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
