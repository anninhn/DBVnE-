/**
 * Controlled vocabulary cho dataset tags — hardcoded.
 *
 * Trước đây lưu trong PostgreSQL `tags` table (Supabase). Sau re-arch
 * 2026-07-02, source of truth chuyển sang file-based → tags cũng chuyển
 * sang hardcoded vì:
 *   - Controlled vocabulary, đổi cực hiếm (< 1 lần/tháng)
 *   - 20 entries — không cần DB để query
 *   - Mỗi tag mới = 1 PR review (better governance)
 *
 * Để thêm tag: edit array này + commit.
 */
const TAGS: string[] = [
  "bao-cao",
  "bo-tai-chinh",
  "csv",
  "doanh-nghiep",
  "geojson",
  "giao-duc",
  "gso",
  "ha-tang",
  "khi-hau",
  "lao-dong",
  "nien-giam",
  "papi",
  "pci",
  "pdf",
  "phong-van",
  "quy-hoach",
  "sach-trang",
  "vi-mo",
  "xep-hang",
  "y-te",
];

/**
 * Return list of tag slugs — sync, không cần cache (in-memory constant).
 */
export function getTags(): string[] {
  return TAGS;
}
