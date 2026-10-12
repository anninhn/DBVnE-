/**
 * proxiedR2Url — đổi public URL của R2 thành đường same-origin qua app.
 *
 * Dùng cho mọi chỗ client fetch nội dung file để preview (map GeoJSON, bảng
 * CSV/XLSX). Fetch thẳng `pub-xxx.r2.dev` là cross-origin nên chết CORS khi dev
 * chạy cổng lạ hoặc khi deploy lên domain không nằm trong CORS policy của
 * bucket. Xem `src/app/api/r2/object/route.ts`.
 *
 * KHÔNG dùng cho link download của user — đường đó là `/api/dataset/download`
 * (có auth + đếm lượt tải).
 */
export function proxiedR2Url(fileUrl: string): string {
  return `/api/r2/object?url=${encodeURIComponent(fileUrl)}`;
}
