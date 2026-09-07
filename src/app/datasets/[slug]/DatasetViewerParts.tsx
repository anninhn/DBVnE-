"use client";

import type { ColumnStats } from "@/lib/types/dataset";
import type { NumberSchema } from "@/lib/parse/number";
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

      {/* Mini chart */}
      <div className="mt-1.5 h-8 flex items-end">
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

  const W = 110,
    H = 30,
    BAR_W = W / counts.length;
  const maxCount = Math.max(...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const fmt = (n: number) => formatNumberWithSchema(n, schema);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
      {counts.map((count, i) => {
        const h = maxCount > 0 ? (count / maxCount) * (H - 2) : 0;
        const x = i * BAR_W + 1;
        const y = H - h;
        // Nhãn hover: khoảng giá trị của cột + số dòng. Trước đây SVG không có
        // `<title>` nào nên trỏ chuột vào không ra gì, và trình đọc màn hình cũng
        // không đọc được — tám cái cột xám không mang thông tin nào ra ngoài.
        const range = binRangeLabel(i, counts.length, lo, hi, fmt);
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={Math.max(BAR_W - 2, 1)}
            height={h}
            fill="#9CA3AF"
            rx={1}
          >
            <title>{`${range}: ${count.toLocaleString("vi-VN")} dòng (${pct}%)`}</title>
          </rect>
        );
      })}
      {/* Vùng phủ toàn biểu đồ để hover vào chỗ cột thấp/rỗng vẫn có nhãn. */}
      <rect x={0} y={0} width={W} height={H} fill="transparent">
        <title>
          {lo != null && hi != null
            ? `${colName}: ${fmt(lo)} – ${fmt(hi)} · ${total.toLocaleString("vi-VN")} dòng`
            : colName}
        </title>
      </rect>
    </svg>
  );
}

/** Proportion bar — stacked horizontal segments, top-12 classes. Reads precomputed if available. */
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
  if (!result) return null;

  const W = 110,
    H = 10;
  const palette = [
    "#6B7280", "#9CA3AF", "#D1D5DB", "#A78BFA", "#60A5FA",
    "#34D399", "#F59E0B", "#EF4444", "#EC4899", "#14B8A6",
    "#8B5CF6", "#F472B6",
  ];

  // Precompute width + position của mỗi segment — functional (không mutation)
  // để tránh react-hooks/immutability rule. n ≤ 12 (palette size) nên O(n²) OK.
  const widths = result.segments.map((s) => (s.count / result.total) * W);
  const bars = widths.map((w, i) => ({
    key: i,
    x: widths.slice(0, i).reduce((sum, prev) => sum + prev, 0),
    w,
    fill: palette[i % palette.length],
    label: result.segments[i].label,
    count: result.segments[i].count,
  }));

  // `complete === false` = danh sách giá trị BỊ CẮT. Phải nói ra ở nhãn hover:
  // không nói thì thanh tỉ lệ trông như đã phủ hết dataset, và người đọc kết luận
  // sai về những giá trị không xuất hiện.
  const truncated = stats?.kind === "categorical" && stats.complete === false;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
      {bars.map((b) => {
        const pct = result.total > 0 ? Math.round((b.count / result.total) * 100) : 0;
        return (
          <rect
            key={b.key}
            x={b.x.toFixed(1)}
            y={0}
            width={b.w.toFixed(1)}
            height={H}
            fill={b.fill}
          >
            <title>{`${b.label}: ${b.count.toLocaleString("vi-VN")} dòng (${pct}%)`}</title>
          </rect>
        );
      })}
      {/* Vùng phủ: hover vào segment quá mảnh vẫn ra được nhãn tổng quan. */}
      <rect x={0} y={0} width={W} height={H} fill="transparent">
        <title>
          {`${colName}: ${bars.length} giá trị hiện ra` +
            (truncated ? " (danh sách bị cắt — dataset còn giá trị khác)" : "")}
        </title>
      </rect>
    </svg>
  );
}
