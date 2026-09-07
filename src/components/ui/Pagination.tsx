/**
 * Pagination dùng chung cho trang danh mục và bảng xem trước dataset.
 *
 * Vì sao tách ra: hai chỗ này từng có hai bản sao gần như y hệt, và bản ở trang
 * danh mục render **toàn bộ** số trang (`Array.from({ length: totalPages })`)
 * trong khi bản ở bảng xem trước đã dùng `pageWindow`. Chú thích ở đó còn ghi
 * "reuse pattern từ DatasetViewer.tsx" — tức ý định dùng lại có, chỉ là phần cắt
 * cửa sổ không được mang theo. Một component thì không lệch được nữa.
 *
 * Hậu quả đo trên production 2026-09-07 (493 dataset = 25 trang):
 *
 *   hộp trắng (max-w-[1280px])     313 → 1593
 *   dòng dataset + đường kẻ        593 → 1608   ← tràn 15px ra ngoài hộp
 *
 * Không phải hai lỗi mà là một: 27 nút cần 1015px, còn cột nội dung của grid chỉ
 * có 1000px. Grid item mặc định `min-width: auto` nên track phình ra theo nội
 * dung thay vì cắt — và **mọi thứ** trong cột đó (kể cả đường kẻ ngăn cách các
 * dataset) bị đẩy quá mép hộp trắng. Kiểm bằng cách ẩn pager: dòng co ngay về
 * 1569, nằm gọn trong hộp.
 */

"use client";

/**
 * Trả danh sách page index (0-based) kèm `"…"`.
 *
 * Luôn hiện trang đầu và trang cuối, cửa sổ `current ± 2` ở giữa. Tối đa 9 phần
 * tử, nên chiều rộng pager không còn phụ thuộc số trang.
 */
export function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i);
  }
  const items: (number | "…")[] = [0];
  const start = Math.max(1, current - 2);
  const end = Math.min(total - 2, current + 2);
  if (start > 1) items.push("…");
  for (let i = start; i <= end; i++) items.push(i);
  if (end < total - 2) items.push("…");
  items.push(total - 1);
  return items;
}

export default function Pagination({
  page,
  totalPages,
  onChange,
  className = "",
}: {
  /** Trang hiện tại, 0-based */
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** Thêm class cho khung ngoài — bảng xem trước cần `border-b` */
  className?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex justify-center gap-1 py-4 ${className}`}>
      <button
        onClick={() => onChange(Math.max(0, page - 1))}
        disabled={page === 0}
        // `whitespace-nowrap`: thiếu nó thì khi pager hết chỗ, nhãn gãy thành hai
        // dòng ("‹" trên, "Previous" dưới) và nút cao 47px thay vì 28px — đúng
        // cái làm hàng paging trông lệch trước khi cắt cửa sổ số trang.
        className="px-2.5 py-1 text-[13px] whitespace-nowrap text-hf-text-muted rounded hover:bg-hf-bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ‹ Previous
      </button>

      {pageWindow(page, totalPages).map((item, idx) =>
        item === "…" ? (
          <span
            key={`e${idx}`}
            className="px-1 py-1 text-[13px] text-hf-text-muted select-none"
          >
            …
          </span>
        ) : (
          <button
            key={item}
            onClick={() => onChange(item)}
            className={`min-w-[32px] px-2 py-1 text-[13px] rounded ${
              item === page
                ? "bg-hf-text text-white font-medium"
                : "text-hf-text-muted hover:bg-hf-bg-muted"
            }`}
          >
            {item + 1}
          </button>
        ),
      )}

      <button
        onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1}
        className="px-2.5 py-1 text-[13px] whitespace-nowrap text-hf-text-muted rounded hover:bg-hf-bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next ›
      </button>
    </div>
  );
}
