"use client";

import { useMemo, useState } from "react";
import type { DataDictionaryEntry, Dataset, Resource } from "@/lib/mock/datasets";

const ROWS_PER_PAGE = 10;

interface DatasetViewerProps {
  dataset: Dataset;
}

/** HF type label ngắn */
function typeBadge(dtype: string): string {
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

interface ColumnDef {
  name: string;
  label: string;
  dtype: string;
  unit?: string;
  isNumeric: boolean;
}

export default function DatasetViewer({ dataset }: DatasetViewerProps) {
  // Chỉ những resource có structured_data mới viewer được
  const viewableResources = useMemo(
    () => dataset.resources.filter((r) => r.structured_data && r.structured_data.length > 0),
    [dataset.resources]
  );

  const [resourceIdx, setResourceIdx] = useState(0);
  const [page, setPage] = useState(0);

  const resource = viewableResources[resourceIdx] ?? viewableResources[0];

  if (!resource) {
    return (
      <div className="text-center py-16 text-hf-text-faint text-sm">
        Chưa có dữ liệu cấu trúc cho dataset này.
      </div>
    );
  }

  const rows = resource.structured_data ?? [];

  // Định nghĩa cột + thống kê
  const columns: ColumnDef[] = useMemo(() => {
    const order = resource.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
    return order.map((name) => {
      const meta = dataset.data_dictionary.find((d) => d.column_name === name);
      const dtype = meta?.data_type ?? "text";
      return {
        name,
        label: meta?.label_vi ?? name,
        unit: meta?.unit,
        dtype,
        isNumeric: dtype === "int" || dtype === "float",
      };
    });
  }, [resource, rows, dataset.data_dictionary]);

  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const pageRows = rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  return (
    <div>
      {/* Controls: resource selector + search */}
      <div className="flex gap-2 mb-3 items-center text-[13px]">
        <span className="text-hf-text-muted">Resource:</span>
        <select
          value={resourceIdx}
          onChange={(e) => {
            setResourceIdx(Number(e.target.value));
            setPage(0);
          }}
          className="px-2.5 py-1 border border-hf-border rounded-md bg-hf-bg text-hf-text focus:outline-none focus:border-hf-yellow"
        >
          {viewableResources.map((r, i) => (
            <option key={r.id} value={i}>
              {r.title} · {r.structured_data?.length ?? 0} rows
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search rows…"
          className="ml-auto px-2.5 py-1 border border-hf-border rounded-md w-[180px] focus:outline-none focus:border-hf-yellow"
        />
      </div>

      {/* THE table — HF dataset viewer */}
      <div className="overflow-x-auto border-t border-hf-border">
        <table className="w-full border-collapse text-[13px] font-mono">
          <thead>
            <tr>
              {columns.map((col) => (
                <ColumnHeader key={col.name} col={col} rows={rows} />
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={i} className="border-b border-hf-border last:border-0 hover:bg-hf-bg-subtle">
                {columns.map((col) => (
                  <td
                    key={col.name}
                    className={`px-3 py-1.5 border-r border-hf-border last:border-r-0 whitespace-nowrap font-mono text-[12.5px] text-hf-text ${
                      col.isNumeric ? "text-right tabular-nums" : ""
                    }`}
                  >
                    {formatCell(row[col.name], col.isNumeric)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-center gap-1 py-4 border-b border-hf-border">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-2.5 py-1 text-[13px] text-hf-text-muted rounded hover:bg-hf-bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ‹ Previous
        </button>
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            onClick={() => setPage(i)}
            className={`min-w-[32px] px-2 py-1 text-[13px] rounded ${
              i === page
                ? "bg-hf-text text-white font-medium"
                : "text-hf-text-muted hover:bg-hf-bg-muted"
            }`}
          >
            {i + 1}
          </button>
        ))}
        <button
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1}
          className="px-2.5 py-1 text-[13px] text-hf-text-muted rounded hover:bg-hf-bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next ›
        </button>
      </div>
      <div className="text-center text-[13px] text-hf-text-muted py-4">
        End of preview.{" "}
        <a href="#" className="font-medium text-hf-link hover:underline">
          Expand in Data Studio
        </a>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Column header — tên + type badge + mini chart
// ──────────────────────────────────────────────────────────────────────────────

function ColumnHeader({
  col,
  rows,
}: {
  col: ColumnDef;
  rows: Record<string, string | number | null | undefined>[];
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
          <NumericStats rows={rows} colName={col.name} />
        ) : (
          <CategoricalStats rows={rows} colName={col.name} />
        )}
      </div>

      {/* Mini chart */}
      <div className="mt-1.5 h-8 flex items-end">
        {col.isNumeric ? (
          <Histogram rows={rows} colName={col.name} />
        ) : (
          <ProportionBar rows={rows} colName={col.name} />
        )}
      </div>
    </th>
  );
}

function NumericStats({
  rows,
  colName,
}: {
  rows: Record<string, string | number | null | undefined>[];
  colName: string;
}) {
  const stats = numericStats(rows, colName);
  if (!stats) return null;
  return (
    <>
      <span>{stats.min}</span>
      <span className="text-hf-text-faint">→</span>
      <span>{stats.max}</span>
    </>
  );
}

function CategoricalStats({
  rows,
  colName,
}: {
  rows: Record<string, string | number | null | undefined>[];
  colName: string;
}) {
  const distinct = countDistinct(rows, colName);
  return <span>{distinct} giá trị</span>;
}

/** Histogram — inline SVG, 8 bins */
function Histogram({
  rows,
  colName,
}: {
  rows: Record<string, string | number | null | undefined>[];
  colName: string;
}) {
  const bins = histogramBins(rows, colName);
  if (!bins) return null;

  const W = 110,
    H = 30,
    BAR_W = W / bins.counts.length;
  const maxCount = Math.max(...bins.counts);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
      {bins.counts.map((count, i) => {
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

/** Proportion bar — stacked horizontal segments, top-12 classes */
function ProportionBar({
  rows,
  colName,
}: {
  rows: Record<string, string | number | null | undefined>[];
  colName: string;
}) {
  const result = categoricalSegments(rows, colName);
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

// ──────────────────────────────────────────────────────────────────────────────
// Pure stats helpers
// ──────────────────────────────────────────────────────────────────────────────

function formatCell(value: string | number | null | undefined, numeric: boolean): string {
  if (value === null || value === undefined || value === "") return "";
  if (numeric) {
    const n = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(n)) return String(value);
    return n.toLocaleString("vi-VN");
  }
  return String(value);
}

function numericStats(
  rows: Record<string, string | number | null | undefined>[],
  colName: string
): { min: string; max: string } | null {
  const values = rows
    .map((r) => r[colName])
    .filter((v) => v != null && v !== "")
    .map((v) => (typeof v === "string" ? parseFloat(v) : (v as number)))
    .filter((n) => !Number.isNaN(n));
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min: min.toLocaleString("vi-VN"), max: max.toLocaleString("vi-VN") };
}

function histogramBins(
  rows: Record<string, string | number | null | undefined>[],
  colName: string
): { counts: number[] } | null {
  const values = rows
    .map((r) => r[colName])
    .filter((v) => v != null && v !== "")
    .map((v) => (typeof v === "string" ? parseFloat(v) : (v as number)))
    .filter((n) => !Number.isNaN(n));
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const BINS = 8;
  const step = (max - min) / BINS || 1;
  const counts = new Array(BINS).fill(0);
  values.forEach((v) => {
    let idx = Math.floor((v - min) / step);
    if (idx >= BINS) idx = BINS - 1;
    counts[idx]++;
  });
  return { counts };
}

function countDistinct(
  rows: Record<string, string | number | null | undefined>[],
  colName: string
): number {
  const set = new Set(
    rows
      .map((r) => r[colName])
      .filter((v) => v != null && v !== "")
      .map((v) => String(v))
  );
  return set.size;
}

function categoricalSegments(
  rows: Record<string, string | number | null | undefined>[],
  colName: string
): { segments: { label: string; count: number }[]; total: number } | null {
  const counts: Record<string, number> = {};
  let total = 0;
  rows.forEach((r) => {
    const v = r[colName];
    if (v == null || v === "") return;
    const key = String(v);
    counts[key] = (counts[key] ?? 0) + 1;
    total++;
  });
  const entries = Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  if (entries.length === 0) return null;
  return { segments: entries, total };
}
