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
 * Tần suất từng giá trị của cột phân loại — thanh ngang, có số đếm.
 *
 * Trước đây là MỘT thanh xếp lớp 110×10px chia theo tỉ lệ. Thanh xếp lớp cho
 * thấy cơ cấu nhưng không đọc được **giá trị nào** và **bao nhiêu dòng** — muốn
 * biết phải trỏ chuột từng đoạn, mà đoạn nhỏ thì rộng 1–2px.
 *
 * Cách này theo mẫu Hugging Face: mỗi giá trị một hàng, tên bên trái, thanh ở
 * giữa, số đếm bên phải. Đọc được ngay mà không cần hover. API `/statistics` của
 * họ trả `frequencies: {label: count}` cho `class_label` và `string_label` —
 * đúng dữ liệu mình đã có trong `column_stats.segments`.
 *
 * Chỉ hiện 3 hàng: header cột cao ~99px và đã chia cho tên cột + badge kiểu +
 * dòng đếm. Phần còn lại ghi "… và N giá trị khác" để không giả vờ đã liệt kê
 * hết.
 */
const CATEGORICAL_ROWS = 3;

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

  const shown = result.segments.slice(0, CATEGORICAL_ROWS);
  const rest = result.segments.length - shown.length;
  const maxCount = Math.max(...result.segments.map((s) => s.count));
  // `complete === false` = danh sách giá trị bị cắt lúc tính stats. Phải nói ra,
  // nếu không "N giá trị khác" trông như đã đếm hết.
  const truncated = stats?.kind === "categorical" && stats.complete === false;
  const distinct =
    stats?.kind === "categorical" ? stats.distinct : result.segments.length;

  return (
    <div className="w-full space-y-[3px] py-0.5">
      {shown.map((seg) => {
        const pct = result.total > 0 ? (seg.count / result.total) * 100 : 0;
        return (
          <div
            key={seg.label}
            className="flex items-center gap-1.5 text-[10px] leading-none"
            title={`${seg.label}: ${seg.count.toLocaleString("vi-VN")} dòng (${Math.round(pct)}%)`}
          >
            <span className="min-w-0 flex-[0_0_44%] truncate font-normal text-hf-text-muted">
              {seg.label}
            </span>
            <span className="h-[5px] flex-1 overflow-hidden rounded-sm bg-hf-bg-muted">
              <span
                className="block h-full rounded-sm bg-hf-chart"
                style={{ width: `${(seg.count / maxCount) * 100}%` }}
              />
            </span>
            <span className="shrink-0 tabular-nums text-hf-text-faint">
              {seg.count.toLocaleString("vi-VN")}
            </span>
          </div>
        );
      })}
      {(rest > 0 || truncated) && (
        <div className="text-[10px] leading-none text-hf-text-faint">
          {truncated
            ? `… còn nữa (danh sách bị cắt)`
            : `… và ${(distinct - shown.length).toLocaleString("vi-VN")} giá trị khác`}
        </div>
      )}
    </div>
  );
}
