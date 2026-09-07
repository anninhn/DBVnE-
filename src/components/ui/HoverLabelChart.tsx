"use client";

import { useState, type ReactNode } from "react";

/**
 * Bọc một biểu đồ SVG nhỏ để hiện nhãn khi trỏ chuột vào.
 *
 * Vì sao không dùng `<title>` của SVG: nó là tooltip NATIVE của trình duyệt —
 * phải giữ chuột yên khoảng một giây mới hiện, và Safari xử lý không đáng tin.
 * Người dùng báo "hover không thấy hiện gì" dù DOM đã có đủ `<title>`. Với một
 * công cụ dữ liệu thì đọc được giá trị của cột là việc chính, không phải tính
 * năng phụ, nên nó cần một tooltip thật.
 *
 * `<title>` VẪN giữ trong SVG (do chỗ gọi truyền vào) — nó là thứ trình đọc màn
 * hình đọc được, tooltip này không thay thế được vai trò đó.
 *
 * Cách xác định cột đang trỏ: `segmentEnds` là mốc kết thúc của từng đoạn theo
 * đơn vị của `viewBox`. Histogram thì các đoạn bằng nhau, proportion bar thì
 * không — dùng mốc tích luỹ nên cùng một component chạy cho cả hai.
 */
export default function HoverLabelChart({
  labels,
  segmentEnds,
  viewBoxWidth,
  children,
}: {
  /** Nhãn của từng đoạn, cùng thứ tự với `segmentEnds` */
  labels: string[];
  /** Mốc kết thúc mỗi đoạn theo đơn vị viewBox, tăng dần */
  segmentEnds: number[];
  viewBoxWidth: number;
  /**
   * Nhận chỉ số đoạn đang trỏ chuột (`null` = không trỏ) để tự tô sáng.
   *
   * Dùng render prop chứ không `ReactNode` tĩnh: biểu đồ cần biết đoạn nào đang
   * hover mới làm nổi được nó, mà state đó nằm ở đây. Truyền xuống qua prop thì
   * mỗi chỗ gọi lại phải tự quản một state trùng lặp.
   */
  children: (hoverIndex: number | null) => ReactNode;
}) {
  const [hover, setHover] = useState<{ index: number; left: number } | null>(
    null,
  );

  const onMove = (e: React.MouseEvent<HTMLSpanElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    // Đổi từ pixel trên màn hình sang đơn vị viewBox — SVG được scale bằng CSS
    // nên hai hệ toạ độ không trùng nhau.
    const xView = ((e.clientX - box.left) / box.width) * viewBoxWidth;
    const index = segmentEnds.findIndex((end) => xView <= end);
    const resolved = index === -1 ? segmentEnds.length - 1 : index;
    if (resolved < 0 || !labels[resolved]) return;
    setHover({ index: resolved, left: e.clientX - box.left });
  };

  return (
    <span
      className="relative inline-block"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      {children(hover ? hover.index : null)}
      {hover && (
        <span
          // `pointer-events-none`: tooltip nằm dưới con trỏ, nếu nó nhận chuột
          // thì `onMouseMove` của khung ngoài không còn nhận được và nhãn nhấp
          // nháy khi di chuột.
          className="pointer-events-none absolute bottom-full z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-hf-text px-1.5 py-0.5 text-[11px] font-normal leading-tight text-white shadow-sm"
          style={{ left: hover.left }}
        >
          {labels[hover.index]}
        </span>
      )}
    </span>
  );
}

/**
 * Bán kính góc cột, tính theo % bề rộng cột.
 *
 * Dùng tỉ lệ chứ không số cố định: biểu đồ ở tab Dataset card cao 30px với cột
 * rộng ~11,8px, còn cái ở tab Files chỉ cao 12px với cột rộng ~6,5px. Một `rx`
 * cố định làm cái nhỏ trông gần như vuông trong khi cái lớn đã tròn.
 *
 * Markup HF được cung cấp không có `rx`, nên đây là chọn của dự án
 * (HF-DESIGN-SPEC.md § 19.4). Đã thử 0,28 — tròn quá, cột 11,75px thành gần như
 * viên thuốc. 0,16 cho ~1,9px trên cột đó: thấy rõ là bo nhưng vẫn ra hình cột.
 */
export const BAR_RADIUS_RATIO = 0.16;

/**
 * Chiều cao tối thiểu của cột có dữ liệu, tính theo đơn vị viewBox.
 *
 * Bin nào có ít nhất một dòng thì PHẢI thấy được. Tỉ lệ thuần
 * `count / maxCount * H` làm bin nhỏ biến mất dưới nửa pixel khi phân bố lệch —
 * đo trên cột `Tổng diện tích rừng` (hist `[1130,0,0,0,0,0,1,17]`, khung 30px):
 *
 *     bin 6 · 1 dòng   → 0,025px
 *     bin 7 · 17 dòng  → 0,421px
 *
 * Cả hai gần như không hiện, nên mắt chỉ đọc được MỘT cột và biểu đồ trông như
 * bị lỗi. Đây là lỗi vẽ, không phải lỗi chia bin: số liệu vẫn đúng, chỉ là không
 * nhìn thấy. Sàn này làm "có dữ liệu" khác hẳn "không có dữ liệu" về mặt thị
 * giác — đúng thứ một biểu đồ phân bố cần nói ra trước tiên.
 *
 * Đánh đổi: bin 1 dòng và bin 17 dòng đều cao 1px nên không phân biệt được bằng
 * mắt. Chấp nhận được vì tooltip cho số chính xác, còn phương án kia là không
 * thấy gì cả.
 */
export const MIN_BAR_HEIGHT = 1;

/**
 * Path cho một cột histogram bo góc **CHỈ Ở ĐỈNH**, chân vuông.
 *
 * `<rect rx>` bo cả bốn góc, nên chân cột cũng tròn và nó trông như đang nổi lên
 * chứ không đứng trên trục. Không có cách nào bo một phía bằng `rect`, phải vẽ
 * bằng `path`.
 *
 * Hai chỗ phải chặn, nếu không path sẽ méo thay vì chỉ hơi lệch:
 *   - cột thấp hơn bán kính (`h < r`) → cung tròn vượt qua chân cột
 *   - bán kính lớn hơn nửa bề rộng → hai cung chồng nhau ở giữa
 *
 * @param x,y  góc trên-trái
 * @param w,h  bề rộng, chiều cao
 * @param r    bán kính mong muốn (sẽ bị kẹp lại nếu quá lớn)
 */
export function topRoundedBarPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  if (h <= 0 || w <= 0) return "";
  const rr = Math.max(0, Math.min(r, w / 2, h));
  const n = (v: number) => Number(v.toFixed(2));
  if (rr === 0) {
    return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
  }
  return [
    `M${n(x)} ${n(y + h)}`,
    `V${n(y + rr)}`,
    `A${n(rr)} ${n(rr)} 0 0 1 ${n(x + rr)} ${n(y)}`,
    `H${n(x + w - rr)}`,
    `A${n(rr)} ${n(rr)} 0 0 1 ${n(x + w)} ${n(y + rr)}`,
    `V${n(y + h)}`,
    "Z",
  ].join("");
}
