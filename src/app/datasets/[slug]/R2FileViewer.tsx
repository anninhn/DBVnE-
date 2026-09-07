"use client";

import { useEffect, useState } from "react";
import { Map as MapIcon, Table as TableIcon } from "lucide-react";
import type { DataDictionaryEntry, Resource } from "@/lib/types/dataset";
import type * as XLSXTypes from "xlsx";
import { parseCSV } from "@/lib/parse/csv";
import { formatCompactNumber } from "@/lib/format";
import { numericStats, histogramBins, countDistinct } from "@/lib/viz/column-stats";
import {
  binRangeLabel,
  formatNumberWithSchema,
  schemaForColumn,
} from "@/lib/datasets/number-schema";
import GeoJsonMapLazy from "@/components/geo/GeoJsonMapLazy";
import HoverLabelChart, {
  BAR_RADIUS_RATIO,
  topRoundedBarPath,
} from "@/components/ui/HoverLabelChart";

const PREVIEW_ROW_LIMIT = 100;

interface R2FileViewerProps {
  resource: Resource;
  /** Khi false, link download fallback → /login?next thay vì R2 public URL. */
  canDownload?: boolean;
  /** Slug dataset — dùng build /login?next khi !canDownload. */
  slug?: string;
  /**
   * Data dictionary của dataset — cần để đọc `decimal_char`/`group_char`.
   *
   * Thiếu nó thì mọi cột số kiểu Việt (`"144,8"`) parse thất bại và thống kê ra
   * `min 0 / max 0` kèm histogram một cột — sai mà không có dấu hiệu gì.
   */
  dictionary?: DataDictionaryEntry[];
}

type LoadState = "loading" | "error" | "ready";

interface TableData {
  headers: string[];
  rows: Record<string, string | number | boolean | null>[];
}

/**
 * R2 File Viewer — xem trước nội dung file trực tiếp từ R2 public URL (D2).
 *
 * Hỗ trợ: CSV (native parser), XLSX (xlsx package), GeoJSON (features[].properties
 * thành table + histogram), PDF (iframe), MP3 (audio).
 */
export default function R2FileViewer({
  resource,
  canDownload = true,
  slug,
  dictionary,
}: R2FileViewerProps) {
  // Build href cho link download fallback:
  // - Đã login → R2 public URL (download trực tiếp)
  // - Chưa login → /login?next=/datasets/<slug>
  const downloadHref = (defaultUrl: string | undefined) => {
    if (!defaultUrl) return undefined;
    if (canDownload) return defaultUrl;
    if (slug) return `/login?next=${encodeURIComponent(`/datasets/${slug}`)}`;
    return "/login";
  };
  const [state, setState] = useState<LoadState>("loading");
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [geojsonData, setGeojsonData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [geojsonView, setGeojsonView] = useState<"map" | "table">("map");
  const [errorMsg, setErrorMsg] = useState("");

  const fileUrl = resource.file_url;
  const fileType = resource.file_type;

  useEffect(() => {
    // Không có URL → không tải được
    if (!fileUrl) {
      setState("error");
      setErrorMsg("File không khả dụng để xem trước.");
      return;
    }

    // PDF/MP3 — không cần fetch text, render trực tiếp
    if (fileType === "pdf" || fileType === "mp3" || fileType === "json") {
      setState("ready");
      return;
    }

    // CSV/XLSX — fetch nội dung để parse
    let cancelled = false;
    setState("loading");

    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        if (fileType === "csv") {
          const text = await res.text();
          const parsed = parseCSV(text);
          if (parsed.length === 0) throw new Error("File CSV rỗng");
          const headers = parsed[0];
          const dataRows = parsed.slice(1).map((cells) => {
            const obj: Record<string, string | number | boolean | null> = {};
            headers.forEach((h, idx) => {
              const val = cells[idx] ?? "";
              obj[h] = val;
            });
            return obj;
          });
          if (!cancelled) {
            setTableData({ headers, rows: dataRows });
            setState("ready");
          }
        } else if (fileType === "xlsx") {
          // Lazy-load xlsx (~711 KB) chỉ khi user preview file .xlsx.
          // Tránh kéo lib này vào INITIAL chunk của detail page.
          const XLSX: typeof XLSXTypes = await import("xlsx");
          const buf = await res.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array" });
          const firstSheet = wb.Sheets[wb.SheetNames[0]];
          const jsonRows = XLSX.utils.sheet_to_json<Record<string, string | number | boolean | null>>(firstSheet, {
            defval: null,
          });
          const headers = jsonRows.length > 0 ? Object.keys(jsonRows[0]) : [];
          if (!cancelled) {
            setTableData({ headers, rows: jsonRows });
            setState("ready");
          }
        } else if (fileType === "geojson") {
          // GeoJSON: lưu raw FeatureCollection cho map + flatten properties cho table.
          // Toggle Map/Table ở header cho phép user switch view.
          const data = (await res.json()) as GeoJSON.FeatureCollection;
          const features = Array.isArray(data?.features) ? data.features : [];
          if (features.length === 0) throw new Error("GeoJSON không có features");
          const headerSet = new Set<string>();
          const dataRows: Record<string, string | number | boolean | null>[] = [];
          for (const feat of features) {
            const props = feat?.properties ?? null;
            if (!props) continue;
            const row: Record<string, string | number | boolean | null> = {};
            for (const [k, v] of Object.entries(props)) {
              headerSet.add(k);
              if (v == null) row[k] = null;
              else if (typeof v === "number" || typeof v === "boolean") row[k] = v;
              else if (typeof v === "string") row[k] = v;
              else row[k] = JSON.stringify(v);
            }
            dataRows.push(row);
          }
          const headers = Array.from(headerSet);
          if (!cancelled) {
            setGeojsonData(data);
            setTableData({ headers, rows: dataRows });
            setState("ready");
          }
        } else {
          // Format không hỗ trợ preview
          if (!cancelled) setState("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Không xác định");
          setState("error");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [fileUrl, fileType]);

  // ── Render theo format ──

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 py-6 text-[13px] text-hf-text-muted">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Đang tải file…
      </div>
    );
  }

  if (state === "error") {
    const href = downloadHref(fileUrl);
    return (
      <div className="py-4 text-[13px] text-hf-text-muted">
        Không tải được file. {errorMsg && <span className="text-hf-text-faint">({errorMsg})</span>}{" "}
        {href && (
          <a href={href} className="text-hf-link hover:underline">
            Tải về trực tiếp
          </a>
        )}
      </div>
    );
  }

  // PDF — embed iframe
  if (fileType === "pdf" && fileUrl) {
    return <iframe src={fileUrl} className="w-full h-[800px] border border-hf-border rounded-md" title={resource.title} />;
  }

  // MP3 — audio player
  if (fileType === "mp3" && fileUrl) {
    return <audio controls src={fileUrl} className="w-full" />;
  }

  // GeoJSON/unknown — không hỗ trợ preview
  if (!tableData) {
    const href = downloadHref(fileUrl);
    return (
      <div className="py-4 text-[13px] text-hf-text-muted">
        Preview không hỗ trợ định dạng này.{" "}
        {href && (
          <a href={href} className="text-hf-link hover:underline">
            Download
          </a>
        )}
      </div>
    );
  }

  // CSV/XLSX/GeoJSON — render table (GeoJSON có toggle map/table)
  const { headers, rows } = tableData;
  const previewRows = rows.slice(0, PREVIEW_ROW_LIMIT);
  const isGeojson = fileType === "geojson" && geojsonData;

  // Phát hiện cột numeric cho histogram
  const numericCols = headers.filter((h) => {
    const sample = rows.slice(0, 50).map((r) => r[h]);
    const numericCount = sample.filter((v) => {
      if (v == null || v === "") return false;
      const n = typeof v === "string" ? parseFloat(v) : v;
      return !Number.isNaN(n);
    }).length;
    return numericCount > sample.length * 0.7; // 70% giá trị là số → numeric
  });

  return (
    <div className="border border-hf-border rounded-md overflow-hidden mt-2 mb-4">
      {/* GeoJSON toggle Map/Table */}
      {isGeojson && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-hf-bg-subtle border-b border-hf-border">
          <span className="text-[11px] text-hf-text-faint">
            {geojsonData?.features.length ?? 0} features
          </span>
          <div className="flex gap-1">
            <ToggleButton
              active={geojsonView === "map"}
              onClick={() => setGeojsonView("map")}
              icon={<MapIcon className="w-3 h-3" strokeWidth={1.75} aria-hidden />}
              label="Map"
            />
            <ToggleButton
              active={geojsonView === "table"}
              onClick={() => setGeojsonView("table")}
              icon={<TableIcon className="w-3 h-3" strokeWidth={1.75} aria-hidden />}
              label="Table"
            />
          </div>
        </div>
      )}

      {/* GeoJSON map view — render map thay cho table */}
      {isGeojson && geojsonView === "map" && geojsonData ? (
        <GeoJsonMapLazy data={geojsonData} height={400} />
      ) : (
        <>
      {/* Histogram cho numeric columns */}
      {numericCols.length > 0 && (
        <div className="flex gap-4 px-3 py-2 bg-hf-bg-subtle border-b border-hf-border text-[11px] text-hf-text-muted">
          {numericCols.map((col) => {
            const schema = schemaForColumn(dictionary, col);
            // `column_stats` trong metadata được tính trên TOÀN BỘ dataset lúc
            // upload/recompute. Đọc nó thay vì tự tính lại: tự tính thì con số
            // phụ thuộc vào những gì tải được ở client, và hai tab của cùng một
            // dataset cho hai kết quả khác nhau mà không nói cái nào là gì.
            const pre = resource.column_stats?.[col];
            const stats =
              pre?.kind === "numeric"
                ? {
                    min: formatNumberWithSchema(pre.min, schema),
                    max: formatNumberWithSchema(pre.max, schema),
                  }
                : numericStats(rows, col, schema);
            const hist =
              pre?.kind === "numeric"
                ? { counts: pre.histogram, min: pre.min, max: pre.max }
                : histogramBins(rows, col, schema);
            if (!stats || !hist) return null;
            return (
              <div key={col} className="flex items-center gap-1.5">
                <span className="font-medium">{col}:</span>
                <span>{stats.min}</span>
                <span className="text-hf-text-faint">→</span>
                <span>{stats.max}</span>
                {/* Mini histogram SVG */}
                <MiniHistogram
                  counts={hist.counts}
                  min={hist.min}
                  max={hist.max}
                  format={(n) => formatNumberWithSchema(n, schema)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full border-collapse text-[12.5px] font-mono">
          <thead className="sticky top-0">
            <tr>
              {headers.map((h) => {
                const isNumeric = numericCols.includes(h);
                return (
                  <th
                    key={h}
                    className={`text-left px-3 pt-2 pb-1.5 bg-hf-bg-subtle border-b border-hf-border border-r last:border-r-0 font-semibold font-sans text-hf-text whitespace-nowrap ${
                      isNumeric ? "text-right" : ""
                    }`}
                  >
                    {h}
                    {!isNumeric && (
                      <span className="ml-1 text-[10px] text-hf-text-faint font-normal">
                        ({countDistinct(rows, h)})
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i} className="border-b border-hf-border last:border-0 hover:bg-hf-bg-subtle">
                {headers.map((h) => {
                  const isNumeric = numericCols.includes(h);
                  const val = row[h];
                  return (
                    <td
                      key={h}
                      className={`px-3 py-1.5 border-r border-hf-border last:border-r-0 whitespace-nowrap text-hf-text ${
                        isNumeric ? "text-right tabular-nums" : ""
                      }`}
                    >
                      {val === null || val === undefined ? "" : String(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-hf-bg-subtle border-t border-hf-border text-[12px] text-hf-text-muted">
        Showing {previewRows.length} / {formatCompactNumber(rows.length)} rows.{" "}
        <span className="text-hf-text-faint">Download để xem đầy đủ.</span>
      </div>
        </>
      )}
    </div>
  );
}

/** Toggle pill button — dùng cho GeoJSON Map/Table switch. */
function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition ${
        active
          ? "bg-hf-text text-hf-bg"
          : "bg-hf-bg text-hf-text-muted hover:text-hf-text border border-hf-border"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Mini histogram SVG — inline trong header bar.
 *
 * `<title>` trong từng `<rect>` là nhãn hover NATIVE của SVG: trỏ chuột vào cột
 * nào thì hiện khoảng giá trị và số dòng của cột đó, và trình đọc màn hình đọc
 * được. Trước đây không có `<title>` nào, nên tám cái cột xám không đưa được
 * thông tin gì ra ngoài.
 */
function MiniHistogram({
  counts,
  min,
  max,
  format,
}: {
  counts: number[];
  min?: number;
  max?: number;
  /** Format số theo quy ước của cột (group_char/decimal_char) */
  format?: (n: number) => string;
}) {
  const W = 60;
  const H = 12;
  const BAR_W = W / counts.length;
  const maxCount = Math.max(...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const fmt = format ?? ((n: number) => String(Number(n.toFixed(4))));
  const labels = counts.map((count, i) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `${binRangeLabel(i, counts.length, min, max, fmt)}: ${count.toLocaleString("vi-VN")} dòng (${pct}%)`;
  });

  return (
    <HoverLabelChart
      labels={labels}
      segmentEnds={counts.map((_, i) => (i + 1) * BAR_W)}
      viewBoxWidth={W}
    >
      {(hoverIndex) => (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="inline-block"
        >
          {/* Vùng bắt chuột theo từng bin — xem chú thích ở MiniHistogram của
              DatasetViewerParts. */}
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
            const h = maxCount > 0 ? (count / maxCount) * (H - 1) : 0;
            const w = Math.max(BAR_W - 1, 1);
            return (
              <path
                key={i}
                d={topRoundedBarPath(
                  i * BAR_W + 0.5,
                  H - h,
                  w,
                  h,
                  w * BAR_RADIUS_RATIO,
                )}
                className="pointer-events-none fill-hf-chart"
                fillOpacity={hoverIndex === null || hoverIndex === i ? 1 : 0.45}
              >
                <title>{labels[i]}</title>
              </path>
            );
          })}
        </svg>
      )}
    </HoverLabelChart>
  );
}
