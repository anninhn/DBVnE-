/**
 * Pure functions tính thống kê cột — dùng chung cho DatasetViewer + R2FileViewer.
 *
 * Không có React deps, thuần logic số liệu.
 *  - numericStats: min/max dạng chuỗi, format theo group_char/decimal_char của cột
 *  - histogramBins: 8 bins từ min→max
 *  - countDistinct: số giá trị unique
 *  - categoricalSegments: top-12 segments theo count desc
 *
 * Frictionless schema (decimal_char/group_char) hỗ trợ parse số từ raw cell
 * theo đúng locale của dataset. Nếu không truyền schema → fallback `.` decimal.
 */

import type { NumberSchema } from "@/lib/parse/number";
import { formatNumberWithSchema } from "@/lib/datasets/number-schema";
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

/**
 * Min/max dạng chuỗi, format theo quy ước của CHÍNH cột đó.
 *
 * Trước đây format cứng bằng `toLocaleString("vi-VN")`, nên cột `Năm` hiện 2019
 * thành `2.019` — dấu nhóm hàng nghìn trên con số năm làm người đọc hiểu sai.
 * `formatNumberWithSchema` dùng `group_char` mà dictionary khai cho cột đó: cột
 * năm không khai gì nên không nhóm.
 */
export function numericStats(
  rows: DataRow[],
  colName: string,
  schema?: NumberSchema
): { min: string; max: string } | null {
  const values = extractNumericValues(rows, colName, schema);
  if (values.length === 0) return null;
  return {
    min: formatNumberWithSchema(Math.min(...values), schema),
    max: formatNumberWithSchema(Math.max(...values), schema),
  };
}

/**
 * Histogram 8 bins — trả counts array cho inline SVG chart.
 *
 * Trả kèm `min`/`max` để chỗ vẽ ghi được nhãn khoảng của từng cột khi hover.
 * Thiếu hai số này thì biểu đồ không có cách nào nói cột đang đứng cho khoảng
 * giá trị nào — người đọc chỉ thấy tám cái cột xám.
 */
export function histogramBins(
  rows: DataRow[],
  colName: string,
  schema?: NumberSchema
): { counts: number[]; min: number; max: number } | null {
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
  return { counts, min, max };
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
