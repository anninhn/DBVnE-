/**
 * CSV inspection — parse + streaming stats.
 *
 * 2 giai đoạn:
 *   1. parseCSVHead → first 1000 rows: type inference + sampleRows (cho AI)
 *   2. computeCSVStats → streaming toàn bộ file: min/max/histogram/distinct (cho UI)
 *
 * Streaming không store rows → handle được hàng triệu rows.
 */

import type { ColumnStats } from "@/lib/types/dataset";
import { parseCSVHead, forEachCSVRow } from "@/lib/parse/csv";
import { parseNumberWithSchema, type NumberSchema } from "@/lib/parse/number";
import type { FileInspection } from "./column";
import {
  MAX_SAMPLE_ROWS_FOR_AI,
  MAX_ROWS_FOR_INSPECTION,
  inspectColumn,
} from "./column";

/**
 * Compute per-column stats từ FULL CSV dataset (streaming, không store rows).
 *
 * Numeric: accumulate values → min/max/histogram (8 bins) ở cuối.
 * Categorical: Map<value, count> → distinct + top-12 segments.
 *
 * Memory: O(numeric_rows × cols × 8 bytes) cho numeric values +
 *         O(distinct_cap × cols) cho categorical maps.
 * Không store toàn bộ rows → handle được hàng triệu rows.
 */
function computeCSVStats(
  text: string,
  columnNames: string[],
  typeMap: Map<string, string>,
  /**
   * Schema thập phân mỗi cột (từ `inspectColumn().decimalSchema`).
   * CSV là format phổ biến nhất → thiếu cái này thì cột số kiểu Việt Nam
   * (`1.234,56`) parse ra NaN và biến mất khỏi `column_stats` trong metadata.yaml,
   * mâu thuẫn chính quyết định Frictionless của dự án.
   */
  schemaMap?: Map<string, NumberSchema | undefined>,
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
      const val = parseNumberWithSchema(raw, schemaMap?.get(col)) ?? NaN;
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
 * Inspect CSV buffer → FileInspection.
 */
export function inspectCsv(buffer: Buffer, filename: string): FileInspection {
  const text = buffer.toString("utf-8");

  // Giai đoạn 1: parse first MAX_ROWS_FOR_INSPECTION+1 rows (1 header + data)
  const { rows: rawRows, totalRowCount } = parseCSVHead(
    text,
    MAX_ROWS_FOR_INSPECTION + 1,
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
  const schemaMap = new Map<string, NumberSchema | undefined>();
  columnInspections.forEach((c) => schemaMap.set(c.name, c.decimalSchema));
  const columnStats = computeCSVStats(text, columns, typeMap, schemaMap);

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
