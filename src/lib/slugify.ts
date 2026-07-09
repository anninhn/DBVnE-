/**
 * Shared slugify — dùng cho cả client (MetadataEditor auto-fill) và server (commit API).
 *
 * Vietnamese-safe: strip diacritics, đ→d, chỉ giữ [a-z0-9-], max 60 chars.
 * "GRDP 34 Tỉnh 2024" → "grdp-34-tinh-2024"
 * "Thủ tục hành chính" → "thu-tuc-hanh-chinh"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, "") // trim leading/trailing hyphen
    .slice(0, 60);
}

/**
 * Validate slug — true nếu hợp lệ (chỉ a-z, 0-9, hyphen; không bắt/kết thúc bằng hyphen).
 */
export function isValidSlug(slug: string): boolean {
  if (!slug) return false;
  if (slug.length > 60) return false;
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}
