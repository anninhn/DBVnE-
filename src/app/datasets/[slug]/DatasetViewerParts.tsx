"use client";

import type { ColumnStats } from "@/lib/types/dataset";
import type { NumberSchema } from "@/lib/parse/number";
import HoverLabelChart, {
  BAR_RADIUS_RATIO,
  MIN_BAR_HEIGHT,
  topRoundedBarPath,
} from "@/components/ui/HoverLabelChart";
import {
  binRangeLabel,
  formatNumberWithSchema,
} from "@/lib/datasets/number-schema";
import {
  numericStats,
  histogramBins,
  countDistinct,
  categoricalSegments,
} from "@/lib/viz/column-stats";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface ColumnDef {
  name: string;
  label: string;
  dtype: string;
  unit?: string;
  isNumeric: boolean;
  /** Frictionless schema — dùng cho parse number trong stats/histogram */
  schema?: NumberSchema;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** HF type label ngắn */
export function typeBadge(dtype: string): string {
  switch (dtype) {
    case "int":
      return "int64";
    case "float":
      return "float64";
    case "text":
      return "string";
    case "date":
      return "date";
    default:
      return dtype;
  }
}

// Hiển thị raw trực tiếp từ R2 — storage đã canonical (`.` decimal, `,` thousand).
// Không convert qua toLocaleString: interchange an toàn và nhất quán với file download.
export function formatCell(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  return String(value);
}


// ──────────────────────────────────────────────────────────────────────────────
// Column header — tên + type badge + mini chart
// ──────────────────────────────────────────────────────────────────────────────

export function ColumnHeader({
  col,
  rows,
  stats,
}: {
  col: ColumnDef;
  rows: Record<string, string | number | boolean | null | undefined>[];
  stats?: ColumnStats;
}) {
  return (
    <th
      className={`text-left px-3 pt-2.5 pb-2 bg-hf-bg-subtle border-b border-hf-border border-r last:border-r-0 font-semibold font-sans text-hf-text align-top whitespace-nowrap sticky top-0 ${
        col.isNumeric ? "text-right" : ""
      }`}
    >
      <div className={col.isNumeric ? "text-right" : ""}>{col.label}</div>

      {/* Stats line: type badge + range/count */}
      <div
        className={`mt-1.5 flex items-center gap-1 font-normal font-mono text-[11px] text-hf-text-faint ${
          col.isNumeric ? "justify-end" : ""
        }`}
      >
        <span className="bg-hf-bg-muted px-1.5 py-px rounded font-mono text-[10px] text-hf-text-muted">
          {typeBadge(col.dtype)}
        </span>
        {col.isNumeric ? (
          <NumericStats rows={rows} colName={col.name} stats={stats} schema={col.schema} />
        ) : (
          <CategoricalStats rows={rows} colName={col.name} stats={stats} />
        )}
      </div>

      {/* Mini chart — không đặt chiều cao cố định: biểu đồ số cao 30px còn danh
          sách tần suất của cột phân loại cần nhiều hơn. */}
      <div className="mt-1.5 flex items-end">
        {col.isNumeric ? (
          <Histogram rows={rows} colName={col.name} stats={stats} schema={col.schema} />
        ) : (
          <ProportionBar rows={rows} colName={col.name} stats={stats} />
        )}
      </div>
    </th>
  );
}

function NumericStats({
  rows,
  colName,
  stats,
  schema,
}: {
  rows: Record<string, string | number | boolean | null | undefined>[];
  colName: string;
  stats?: ColumnStats;
  schema?: NumberSchema;
}) {
  // Prefer precomputed stats (over full dataset); fall back to preview computation.
  // Precomputed stats đã parse đúng tại upload time (inspect.ts dùng detection).
  // Fallback numericStats cần schema để parse đúng raw cell.
  const computed =
    stats && stats.kind === "numeric"
      ? {
          min: stats.min.toLocaleString("vi-VN"),
          max: stats.max.toLocaleString("vi-VN"),
        }
      : numericStats(rows, colName, schema);
  if (!computed) return null;
  return (
    <>
      <span>{computed.min}</span>
      <span className="text-hf-text-faint">→</span>
      <span>{computed.max}</span>
    </>
  );
}

function CategoricalStats({
  rows,
  colName,
  stats,
}: {
  rows: Record<string, string | number | boolean | null | undefined>[];
  colName: string;
  stats?: ColumnStats;
}) {
  const distinct =
    stats && stats.kind === "categorical"
      ? stats.distinct
      : countDistinct(rows, colName);
  return <span>{distinct} giá trị</span>;
}

/** Histogram — inline SVG, 8 bins. Reads precomputed stats if available. */
function Histogram({
  rows,
  colName,
  stats,
  schema,
}: {
  rows: Record<string, string | number | boolean | null | undefined>[];
  colName: string;
  stats?: ColumnStats;
  schema?: NumberSchema;
}) {
  // `stats` là thống kê TOÀN BỘ dataset (metadata.yaml). Chỉ tính từ `rows`
  // (preview ≤1000 dòng) khi metadata chưa có — và lúc đó phải truyền schema, nếu
  // không thì cột số kiểu Việt parse thất bại rồi ra histogram một cột.
  const fallback =
    stats && stats.kind === "numeric" ? null : histogramBins(rows, colName, schema);
  const counts =
    stats && stats.kind === "numeric" ? stats.histogram : fallback?.counts;
  const lo = stats && stats.kind === "numeric" ? stats.min : fallback?.min;
  const hi = stats && stats.kind === "numeric" ? stats.max : fallback?.max;
  if (!counts) return null;
  // Cột chỉ có MỘT giá trị (min = max) — vẽ histogram cho nó là vô nghĩa: một
  // cột duy nhất chiếm 100%, trông y như biểu đồ bị lỗi. Phần `min → max` ở
  // header cột đã nói đủ. Đo trên kho: 17 cột như vậy (`Năm` khi dataset chỉ có
  // một năm, `Chung` = 100, `provinceCode`…).
  if (lo != null && hi != null && lo === hi) return null;

  const W = 110,
    H = 30,
    BAR_W = W / counts.length;
  const maxCount = Math.max(...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const fmt = (n: number) => formatNumberWithSchema(n, schema);
  const labels = counts.map((count, i) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `${binRangeLabel(i, counts.length, lo, hi, fmt)}: ${count.toLocaleString("vi-VN")} dòng (${pct}%)`;
  });

  return (
    <HoverLabelChart
      labels={labels}
      segmentEnds={counts.map((_, i) => (i + 1) * BAR_W)}
      viewBoxWidth={W}
    >
      {(hoverIndex) => (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
          {/*
            Vùng bắt chuột CHO TỪNG BIN, cao hết khung — lấy đúng cách Hugging
            Face làm (`<rect y="0" height="30" fill-opacity="0">` một cái mỗi
            bin). Nhờ vậy trỏ vào chỗ cột thấp hoặc rỗng vẫn ra đúng bin đó, và
            khi hover thì cả dải sáng lên chứ không chỉ riêng cái cột.
            Lần trước tôi dùng MỘT lớp phủ chung cho cả biểu đồ — nó nằm trên
            các cột và chặn hết.
          */}
          {counts.map((_, i) => (
            <rect
              key={`hit-${i}`}
              x={i * BAR_W}
              y={0}
              width={BAR_W}
              height={H}
              className="cursor-pointer fill-hf-chart"
              fillOpacity={hoverIndex === i ? 0.12 : 0}
            />
          ))}
          {counts.map((count, i) => {
            // Sàn chiều cao: bin có dữ liệu phải thấy được, xem MIN_BAR_HEIGHT.
            const raw = maxCount > 0 ? (count / maxCount) * (H - 2) : 0;
            const h = count > 0 ? Math.max(raw, MIN_BAR_HEIGHT) : 0;
            const w = Math.max(BAR_W - 2, 1);
            return (
              <path
                key={i}
                // Bo góc CHỈ Ở ĐỈNH — `<rect rx>` bo cả chân, cột trông như
                // đang nổi lên chứ không đứng trên trục.
                d={topRoundedBarPath(
                  i * BAR_W + 1,
                  H - h,
                  w,
                  h,
                  w * BAR_RADIUS_RATIO,
                )}
                className="pointer-events-none fill-hf-chart"
                fillOpacity={hoverIndex === null || hoverIndex === i ? 1 : 0.45}
              >
                {/* Giữ cho trình đọc màn hình — tooltip nhìn thấy được do
                    HoverLabelChart lo. */}
                <title>{labels[i]}</title>
              </path>
            );
          })}
        </svg>
      )}
    </HoverLabelChart>
  );
}

/** Proportion bar — stacked horizontal segments, top-12 classes. Reads precomputed if available. */
/**
 * Cột phân loại — thanh ngang xếp lớp, mỗi đoạn một giá trị.
 *
 * Theo markup Hugging Face được cung cấp 2026-09-07:
 *
 *     <rect y="0" fill-opacity="0" class="fill-white cursor-pointer"
 *           x="65" width="65" height="28">
 *
 * Đọc được ba điều: (a) MỘT thanh ngang chia đoạn, không phải danh sách nhiều
 * hàng; (b) cao **28px**, gần bằng histogram (30px) — không phải dải mảnh 10px;
 * (c) mỗi đoạn có một `<rect>` trong suốt đè lên làm vùng bắt chuột, và nó
 * `fill-white` nên hiệu ứng hover là **làm sáng** đoạn đó, không phải đổi màu.
 *
 * Bản trước của tôi dựng thành 3 hàng thanh ngang riêng vì hiểu "thanh ngang" là
 * số nhiều. Sai — nó là một thanh, còn tần suất từng giá trị hiện khi hover.
 */
const CATEGORICAL_H = 28;

function ProportionBar({
  rows,
  colName,
  stats,
}: {
  rows: Record<string, string | number | boolean | null | undefined>[];
  colName: string;
  stats?: ColumnStats;
}) {
  const result =
    stats && stats.kind === "categorical"
      ? {
          segments: stats.segments,
          total: stats.segments.reduce((s, x) => s + x.count, 0),
        }
      : categoricalSegments(rows, colName);
  if (!result || result.segments.length === 0) return null;

  const W = 110;
  const H = CATEGORICAL_H;
  // Palette nguyên bản của dự án — 12 màu khác hẳn nhau. Bản trước tôi đổi sang
  // 4 sắc indigo dẫn đầu cho khớp màu histogram, nhưng các đoạn cạnh nhau thành
  // ra khó phân biệt: với 65 tỉnh thì mỗi đoạn chỉ rộng ~1,7px, mà bốn sắc indigo
  // liền nhau ở cỡ đó nhìn như một khối liền.
  //
  // Histogram dùng một màu (indigo) vì trục x đã mang thông tin — vị trí cột nói
  // lên khoảng giá trị. Thanh xếp lớp thì không có trục, nên **màu chính là thứ
  // duy nhất tách các đoạn ra**. Hai biểu đồ khác nhu cầu nên khác cách dùng màu.
  const palette = [
    "#6B7280", "#9CA3AF", "#D1D5DB", "#A78BFA", "#60A5FA",
    "#34D399", "#F59E0B", "#EF4444", "#EC4899", "#14B8A6",
    "#8B5CF6", "#F472B6",
  ];

  const widths = result.segments.map((s) => (s.count / result.total) * W);
  const bars = widths.map((w, i) => ({
    key: i,
    x: widths.slice(0, i).reduce((sum, prev) => sum + prev, 0),
    w,
    fill: palette[i % palette.length],
    label: result.segments[i].label,
    count: result.segments[i].count,
  }));

  const truncated = stats?.kind === "categorical" && stats.complete === false;
  const labels = bars.map((b) => {
    const pct = result.total > 0 ? Math.round((b.count / result.total) * 100) : 0;
    return (
      `${b.label}: ${b.count.toLocaleString("vi-VN")} dòng (${pct}%)` +
      // Nói ra khi danh sách giá trị bị cắt lúc tính stats — không nói thì thanh
      // trông như đã phủ hết dataset.
      (truncated ? " — danh sách bị cắt, dataset còn giá trị khác" : "")
    );
  });

  return (
    <HoverLabelChart
      labels={labels}
      segmentEnds={bars.map((b) => b.x + b.w)}
      viewBoxWidth={W}
    >
      {(hoverIndex) => (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
          {bars.map((b) => (
            <rect
              key={b.key}
              x={b.x.toFixed(2)}
              y={0}
              width={Math.max(b.w, 0.5).toFixed(2)}
              height={H}
              fill={b.fill}
            />
          ))}
          {/* Vùng bắt chuột theo TỪNG ĐOẠN, phủ trắng khi hover — cùng cách HF
              làm (`fill-white` + `fill-opacity` 0). Làm sáng chứ không đổi màu,
              nên vẫn nhận ra được đoạn đó là màu gì. */}
          {bars.map((b) => (
            <rect
              key={`hit-${b.key}`}
              x={b.x.toFixed(2)}
              y={0}
              width={Math.max(b.w, 0.5).toFixed(2)}
              height={H}
              className="cursor-pointer fill-white"
              fillOpacity={hoverIndex === b.key ? 0.35 : 0}
            >
              <title>{labels[b.key]}</title>
            </rect>
          ))}
        </svg>
      )}
    </HoverLabelChart>
  );
}
