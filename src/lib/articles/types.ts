/**
 * Article entry — link bài báo VNExpress sử dụng dataset.
 *
 * Spec: specs/2026-07-24-article-linking/
 *
 * Stored trong metadata.yaml `articles[]` field. Phase 1 MVP: add + display only.
 * Multi-dataset per article: cùng URL có thể link từ nhiều datasets (mỗi dataset
 * giữ articles[] riêng — không global table).
 *
 * Field strategy:
 * - url, title: bắt buộc (URL để verify + title để hiển thị)
 * - author, published_at, section, thumbnail: từ OG tags, user có edit
 * - added_at, added_by: auto từ session khi user submit form
 */

export interface ArticleEntry {
  /** URL vnexpress.net — canonical, không có query hash redundant */
  url: string;
  /** Tiêu đề bài báo — og:title hoặc user edit */
  title: string;
  /** Tác giả — article:author hoặc byline fallback */
  author?: string;
  /** ISO date (vd: "2026-07-15") — article:published_time */
  published_at?: string;
  /** Chuyên mục — article:section (vd: "Thời sự", "Kinh doanh") */
  section?: string;
  /** OG image URL — thumbnail cho card */
  thumbnail?: string;
  /** ISO datetime — khi add vào dataset (auto từ session) */
  added_at: string;
  /** Username — ai add (auto từ session, dùng cho audit) */
  added_by: string;
}
