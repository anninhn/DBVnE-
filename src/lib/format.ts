/**
 * Format số ở dạng compact, human-readable.
 * - 1234       → "1.2K"
 * - 1600000    → "1.6M"
 * - 3400000000 → "3.4B"
 *
 * Dùng cho row_count, distinct counts, số dòng khớp trong viewer…
 * Hiển thị nhanh; khi cần giá trị chính xác, dùng toLocaleString("vi-VN").
 */
export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return String(n);
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/**
 * Format bytes → human-readable (KB, MB, GB).
 * 1536000  → "1.5 MB"
 * 52428800 → "50 MB"
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIdx]}`;
}
