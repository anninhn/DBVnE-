/**
 * Pure functions tính thống kê cột — dùng chung cho DatasetViewer + R2FileViewer.
 *
 * Không có React deps, thuần logic số liệu.
 *  - numericStats: min/max dạng chuỗi định dạng vi-VN
 *  - histogramBins: 8 bins từ min→max
 *  - countDistinct: số giá trị unique
 *  - categoricalSegments: top-12 segments theo count desc
 *
 * Frictionless schema (decimal_char/group_char) hỗ trợ parse số từ raw cell
 * theo đúng locale của dataset. Nếu không truyền schema → fallback `.` decimal.
 */

import type { NumberSchema } from "@/lib/parse/number";
import { parseNumberWithSchema } from "@/lib/parse/number";

type CellValue = string | number | boolean | null | undefined;
type DataRow = Record<string, CellValue>;

/**
 * Trích giá trị số từ cột — parse string → number theo schema, bỏ NaN/null.
 *
 * Không có schema → parseFloat default (`.` decimal).
 * Có schema vi (decimal_char: ",") → parse đúng `1.234,56` → 1234.56.
 */
function extractNumericValues(
  rows: DataRow[],
  colName: string,
  schema?: NumberSchema
): number[] {
  return rows
    .map((r) => r[colName])
    .filter((v) => v != null && v !== "")
    .map((v) => {
      if (typeof v === "number") return v;
      if (typeof v === "string") return parseNumberWithSchema(v, schema);
      return null;
    })
    .filter((n): n is number => n != null && !Number.isNaN(n));
}

/** Min/max dạng chuỗi định dạng vi-VN — cho hiển thị stats header. */
export function numericStats(
  rows: DataRow[],
  colName: string,
  schema?: NumberSchema
): { min: string; max: string } | null {
  const values = extractNumericValues(rows, colName, schema);
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min: min.toLocaleString("vi-VN"), max: max.toLocaleString("vi-VN") };
}

/** Histogram 8 bins — trả counts array cho inline SVG chart. */
export function histogramBins(
  rows: DataRow[],
  colName: string,
  schema?: NumberSchema
): { counts: number[] } | null {
  const values = extractNumericValues(rows, colName, schema);
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const BINS = 8;
  const step = (max - min) / BINS || 1;
  const counts = new Array(BINS).fill(0);
  values.forEach((v) => {
    let idx = Math.floor((v - min) / step);
    if (idx >= BINS) idx = BINS - 1;
    counts[idx]++;
  });
  return { counts };
}

/** Đếm số giá trị distinct trong cột. */
export function countDistinct(
  rows: DataRow[],
  colName: string
): number {
  const set = new Set(
    rows
      .map((r) => r[colName])
      .filter((v) => v != null && v !== "")
      .map((v) => String(v))
  );
  return set.size;
}

/** Top-12 categorical segments — cho proportion bar chart. */
export function categoricalSegments(
  rows: DataRow[],
  colName: string
): { segments: { label: string; count: number }[]; total: number } | null {
  const counts: Record<string, number> = {};
  let total = 0;
  rows.forEach((r) => {
    const v = r[colName];
    if (v == null || v === "") return;
    const key = String(v);
    counts[key] = (counts[key] ?? 0) + 1;
    total++;
  });
  const entries = Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  if (entries.length === 0) return null;
  return { segments: entries, total };
}
