/**
 * Pure functions tính thống kê cột — dùng chung cho DatasetViewer + R2FileViewer.
 *
 * Không có React deps, thuần logic số liệu.
 *  - numericStats: min/max dạng chuỗi định dạng vi-VN
 *  - histogramBins: 8 bins từ min→max
 *  - countDistinct: số giá trị unique
 *  - categoricalSegments: top-12 segments theo count desc
 */

type CellValue = string | number | boolean | null | undefined;
type DataRow = Record<string, CellValue>;

/** Trích giá trị số từ cột — parse string → number, bỏ NaN/null. */
function extractNumericValues(rows: DataRow[], colName: string): number[] {
  return rows
    .map((r) => r[colName])
    .filter((v) => v != null && v !== "")
    .map((v) => (typeof v === "string" ? parseFloat(v) : (v as number)))
    .filter((n) => !Number.isNaN(n));
}

/** Min/max dạng chuỗi định dạng vi-VN — cho hiển thị stats header. */
export function numericStats(
  rows: DataRow[],
  colName: string
): { min: string; max: string } | null {
  const values = extractNumericValues(rows, colName);
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min: min.toLocaleString("vi-VN"), max: max.toLocaleString("vi-VN") };
}

/** Histogram 8 bins — trả counts array cho inline SVG chart. */
export function histogramBins(
  rows: DataRow[],
  colName: string
): { counts: number[] } | null {
  const values = extractNumericValues(rows, colName);
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
