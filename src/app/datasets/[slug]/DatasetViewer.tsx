"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnStats, DataDictionaryEntry, Dataset, Resource } from "@/lib/types/dataset";
import type { NumberSchema } from "@/lib/parse/number";
import {
  numericStats,
  histogramBins,
  countDistinct,
  categoricalSegments,
} from "@/lib/viz/column-stats";
import { formatCompactNumber } from "@/lib/format";

const ROWS_PER_PAGE = 10;
const PREVIEW_ROW_LIMIT = 1000;

type Row = Record<string, string | number | boolean | null>;

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
  /** Frictionless schema — dùng cho parse number trong stats/histogram */
  schema?: NumberSchema;
}

export default function DatasetViewer({ dataset }: DatasetViewerProps) {
  // Chỉ những resource có structured_data mới viewer được (SSR path)
  const ssrViewableResources = useMemo(
    () => dataset.resources.filter((r) => r.structured_data && r.structured_data.length > 0),
    [dataset.resources]
  );

  // GeoJSON resource cần client-side fetch khi SSR skip (file >10MB → withPreviewData
  // early-return, không set structured_data). DatasetViewer tự fetch trong browser
  // (không block Vercel), populate local state → render với đầy đủ features (search,
  // pagination, resource selector, histograms) thay vì fallback table đơn giản.
  const geoResourceForFetch = useMemo(
    () =>
      ssrViewableResources.length > 0
        ? null
        : dataset.resources.find((r) => r.file_type === "geojson" && r.file_url) ?? null,
    [ssrViewableResources.length, dataset.resources],
  );

  const [clientFetch, setClientFetch] = useState<{
    state: "idle" | "loading" | "ready" | "error";
    data?: { structuredData: Row[]; columns: string[] };
    errorMsg?: string;
  }>({ state: "idle" });

  useEffect(() => {
    if (!geoResourceForFetch?.file_url) {
      // Render-time check; không setState ở đây để tránh cascading render warning.
      return;
    }
    const fileUrl = geoResourceForFetch.file_url;
    let cancelled = false;
    setClientFetch({ state: "loading" });

    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as GeoJSON.FeatureCollection;
        const features = Array.isArray(json?.features) ? json.features : [];
        if (features.length === 0) throw new Error("GeoJSON không có features");

        // Collect headers từ tất cả features (mỗi feature có thể có props khác nhau)
        const headerSet = new Set<string>();
        for (const f of features) {
          for (const k of Object.keys(f?.properties ?? {})) headerSet.add(k);
        }
        const columns = Array.from(headerSet);

        const structuredData: Row[] = features.slice(0, PREVIEW_ROW_LIMIT).map((f) => {
          const props = (f?.properties ?? {}) as Record<string, unknown>;
          const obj: Row = {};
          for (const h of columns) {
            const v = props[h];
            if (v == null) obj[h] = null;
            else if (typeof v === "number" || typeof v === "boolean") obj[h] = v;
            else if (typeof v === "string") obj[h] = v;
            else obj[h] = JSON.stringify(v);
          }
          return obj;
        });

        if (!cancelled) {
          setClientFetch({ state: "ready", data: { structuredData, columns } });
        }
      } catch (err) {
        if (!cancelled) {
          setClientFetch({
            state: "error",
            errorMsg: err instanceof Error ? err.message : "Không xác định",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [geoResourceForFetch?.file_url]);

  // Effective viewable resources = SSR resources, hoặc synthetic resource từ client fetch.
  const viewableResources = useMemo<Resource[]>(() => {
    if (ssrViewableResources.length > 0) return ssrViewableResources;
    if (clientFetch.state === "ready" && clientFetch.data && geoResourceForFetch) {
      return [
        {
          ...geoResourceForFetch,
          structured_data: clientFetch.data.structuredData,
          columns: clientFetch.data.columns,
        },
      ];
    }
    return [];
  }, [ssrViewableResources, clientFetch, geoResourceForFetch]);

  const [resourceIdx, setResourceIdx] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  const resource = viewableResources[resourceIdx] ?? viewableResources[0];
  const rows = resource?.structured_data ?? [];

  // Định nghĩa cột + thống kê — phải gọi unconditional (rules-of-hooks).
  // Khi resource null → columns rỗng, render empty state bên dưới.
  const columns: ColumnDef[] = useMemo(() => {
    if (!resource) return [];
    const order = resource.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
    return order.map((name) => {
      const meta = dataset.data_dictionary.find((d) => d.column_name === name);
      const dtype = meta?.data_type ?? "text";
      // Build Frictionless schema từ dictionary (decimal_char/group_char)
      const schema: NumberSchema | undefined =
        meta?.decimal_char || meta?.group_char
          ? {
              decimal_char: meta?.decimal_char,
              group_char: meta?.group_char,
            }
          : undefined;
      return {
        name,
        label: meta?.label_vi ?? name,
        unit: meta?.unit,
        dtype,
        isNumeric: dtype === "int" || dtype === "float",
        schema,
      };
    });
  }, [resource, rows, dataset.data_dictionary]);

  // Filter rows theo search query (client-side, chỉ trong preview rows ≤1000).
  const filteredRows = useMemo(() => {
    if (!resource || !search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => {
        const v = row[col.name];
        if (v == null) return false;
        return String(v).toLowerCase().includes(q);
      }),
    );
  }, [resource, rows, search, columns]);

  // Empty / loading / error state — đặt SAU tất cả các hooks (rules-of-hooks).
  if (!resource) {
    // GeoJSON đang fetch client-side
    if (geoResourceForFetch) {
      if (clientFetch.state === "loading") {
        return (
          <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-hf-text-muted">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Đang tải {formatCompactNumber(geoResourceForFetch.file_size_mb ?? 0)}MB GeoJSON…
          </div>
        );
      }
      if (clientFetch.state === "error") {
        return (
          <div className="py-10 text-center text-[13px] text-hf-text-muted">
            Không tải được dữ liệu.{" "}
            {clientFetch.errorMsg && (
              <span className="text-hf-text-faint">({clientFetch.errorMsg})</span>
            )}{" "}
            {geoResourceForFetch.file_url && (
              <a href={geoResourceForFetch.file_url} className="text-hf-link hover:underline">
                Tải về trực tiếp
              </a>
            )}
          </div>
        );
      }
    }
    return (
      <div className="text-center py-16 text-hf-text-faint text-sm">
        Chưa có dữ liệu cấu trúc cho dataset này.
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const pageRows = filteredRows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  return (
    <div>
      {/* Controls: resource selector + search */}
      <div className="flex gap-2 mb-3 items-center text-[13px] px-3 pt-3">
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
              {r.title} · {formatCompactNumber(r.structured_data?.length ?? 0)} rows
            </option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
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
                <ColumnHeader
                  key={col.name}
                  col={col}
                  rows={rows}
                  stats={resource.column_stats?.[col.name]}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-hf-text-faint text-sm">
                  No rows match "{search}".
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={i} className="border-b border-hf-border last:border-0 hover:bg-hf-bg-subtle">
                  {columns.map((col) => (
                    <td
                      key={col.name}
                      className={`px-3 py-1.5 border-r border-hf-border last:border-r-0 whitespace-nowrap font-mono text-[12.5px] text-hf-text ${
                        col.isNumeric ? "text-right tabular-nums" : ""
                      }`}
                    >
                      {formatCell(row[col.name])}
                    </td>
                  ))}
                </tr>
              ))
            )}
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
        {pageWindow(page, totalPages).map((item, idx) =>
          item === "…" ? (
            <span key={`e${idx}`} className="px-1 py-1 text-[13px] text-hf-text-muted">
              …
            </span>
          ) : (
            <button
              key={item}
              onClick={() => setPage(item)}
              className={`min-w-[32px] px-2 py-1 text-[13px] rounded ${
                item === page
                  ? "bg-hf-text text-white font-medium"
                  : "text-hf-text-muted hover:bg-hf-bg-muted"
              }`}
            >
              {item + 1}
            </button>
          )
        )}
        <button
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1}
          className="px-2.5 py-1 text-[13px] text-hf-text-muted rounded hover:bg-hf-bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next ›
        </button>
      </div>
      <div className="text-center text-[13px] text-hf-text-muted py-4">
        {search.trim() && (
          <span>
            {formatCompactNumber(filteredRows.length)} / {formatCompactNumber(rows.length)} rows match "{search}".{" "}
          </span>
        )}
        End of preview.{" "}
        <a href="#" className="font-medium text-hf-link hover:underline">
          Expand
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
  const computed = stats && stats.kind === "numeric"
    ? { min: stats.min.toLocaleString("vi-VN"), max: stats.max.toLocaleString("vi-VN") }
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
    stats && stats.kind === "categorical" ? stats.distinct : countDistinct(rows, colName);
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
    stats && stats.kind === "numeric" ? stats.histogram : histogramBins(rows, colName, schema)?.counts;
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
      ? { segments: stats.segments, total: stats.segments.reduce((s, x) => s + x.count, 0) }
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

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

// Hiển thị raw trực tiếp từ R2 — storage đã canonical (`.` decimal, `,` thousand).
// Không convert qua toLocaleString: interchange an toàn và nhất quán với file download.
function formatCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  return String(value);
}

/**
 * Windowed pagination — trả danh sách page index (0-based) + "…" cho ellipsis.
 * Luôn show first + last, window current±2 ở giữa. Tránh render 100 button → tràn ngang.
 */
function pageWindow(current: number, total: number): (number | "…")[] {
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
