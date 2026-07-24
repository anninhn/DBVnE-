"use client";

import type { ColumnStats } from "@/lib/types/dataset";
import type { NumberSchema } from "@/lib/parse/number";
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

/**
 * Windowed pagination — trả danh sách page index (0-based) + "…" cho ellipsis.
 * Luôn show first + last, window current±2 ở giữa. Tránh render 100 button → tràn ngang.
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
  const counts =
    stats && stats.kind === "numeric"
      ? stats.histogram
      : histogramBins(rows, colName, schema)?.counts;
  if (!counts) return null;

  const W = 110,
    H = 30,
    BAR_W = W / counts.length;
  const maxCount = Math.max(...counts);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
      {counts.map((count, i) => {
        const h = maxCount > 0 ? (count / maxCount) * (H - 2) : 0;
        const x = i * BAR_W + 1;
        const y = H - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={Math.max(BAR_W - 2, 1)}
            height={h}
            fill="#9CA3AF"
            rx={1}
          />
        );
      })}
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

  let x = 0;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
      {result.segments.map((seg, i) => {
        const w = (seg.count / result.total) * W;
        const el = (
          <rect
            key={i}
            x={x.toFixed(1)}
            y={0}
            width={w.toFixed(1)}
            height={H}
            fill={palette[i % palette.length]}
          />
        );
        x += w;
        return el;
      })}
    </svg>
  );
}
