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
  children: ReactNode;
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
      {children}
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
