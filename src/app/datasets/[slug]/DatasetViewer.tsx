"use client";

import { useMemo, useState } from "react";
import type { Dataset } from "@/lib/types/dataset";
import { formatCompactNumber } from "@/lib/format";
import { schemaForColumn } from "@/lib/datasets/number-schema";
import Pagination from "@/components/ui/Pagination";
import { useDatasetPreview } from "./useDatasetPreview";
import {
  ColumnHeader,
  formatCell,
  type ColumnDef,
} from "./DatasetViewerParts";

const ROWS_PER_PAGE = 10;

interface DatasetViewerProps {
  dataset: Dataset;
  /** Khi false, link "Tải về trực tiếp" → /login thay vì R2 public URL. */
  canDownload?: boolean;
  /** Slug — dùng build /login?next khi !canDownload. */
  slug?: string;
}

export default function DatasetViewer({ dataset, canDownload = true, slug }: DatasetViewerProps) {
  const { geoResourceForFetch, clientFetch, viewableResources } =
    useDatasetPreview(dataset);

  const [resourceIdx, setResourceIdx] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  const resource = viewableResources[resourceIdx] ?? viewableResources[0];
  // Wrap rows trong useMemo — tránh tạo array literal mới mỗi render,
  // làm dependencies của columns/filteredRows useMemo thay đổi liên tục.
  const rows = useMemo(
    () => resource?.structured_data ?? [],
    [resource]
  );

  // Định nghĩa cột + thống kê — phải gọi unconditional (rules-of-hooks).
  // Khi resource null → columns rỗng, render empty state bên dưới.
  const columns: ColumnDef[] = useMemo(() => {
    if (!resource) return [];
    const order = resource.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
    return order.map((name) => {
      const meta = dataset.data_dictionary.find((d) => d.column_name === name);
      const dtype = meta?.data_type ?? "text";
      // Dùng hàm chung với R2FileViewer — hai bản sao là lý do hai tab từng cho
      // hai con số khác nhau.
      const schema = schemaForColumn(dataset.data_dictionary, name);
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

  // Preview có bị cắt không — `row_count` trong metadata là tổng thật, `rows` là
  // phần SSR nạp được (trần 1.000 dòng, xem PREVIEW_ROW_LIMIT ở enrichment.ts).
  const trueRowCount = dataset.row_count ?? rows.length;
  const isTruncated = trueRowCount > rows.length;

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
        const href = !canDownload && slug
          ? `/login?next=${encodeURIComponent(`/datasets/${slug}`)}`
          : geoResourceForFetch.file_url;
        return (
          <div className="py-10 text-center text-[13px] text-hf-text-muted">
            Không tải được dữ liệu.{" "}
            {clientFetch.errorMsg && (
              <span className="text-hf-text-faint">({clientFetch.errorMsg})</span>
            )}{" "}
            {href && (
              <a href={href} className="text-hf-link hover:underline">
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
                  No rows match &quot;{search}&quot;.
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

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={setPage}
        className="border-b border-hf-border"
      />
      <div className="text-center text-[13px] text-hf-text-muted py-4">
        {search.trim() && (
          <span>
            {formatCompactNumber(filteredRows.length)} / {formatCompactNumber(rows.length)} rows match &quot;{search}&quot;.{" "}
          </span>
        )}
        {/*
          Nói rõ preview bị cắt. Trước đây chỉ có "End of preview" — đúng nghĩa
          nhưng người đọc không biết còn bao nhiêu ở phía sau, mà kho này có 78
          dataset vượt trần (cao nhất 5.520 dòng). Con số tổng đứng ở sidebar,
          con số preview đứng trong ô chọn file: hai chỗ rời nhau, dễ đọc lẫn.
          Lưu ý: thống kê và histogram VẪN tính trên toàn bộ dataset (đọc từ
          `column_stats`), chỉ bảng này là phần đầu.
        */}
        {isTruncated ? (
          <>
            {/* Số CHÍNH XÁC, không `formatCompactNumber`: câu này tồn tại để nói
                còn thiếu bao nhiêu, mà "1K trong 4.1K" thì vẫn không biết. */}
            Đang xem {rows.length.toLocaleString("vi-VN")} dòng đầu trong{" "}
            {trueRowCount.toLocaleString("vi-VN")} dòng. Thống kê và biểu đồ ở đầu
            mỗi cột tính trên toàn bộ dataset — tải file về để xem hết dữ liệu.
          </>
        ) : (
          <>Hết dữ liệu — {rows.length.toLocaleString("vi-VN")} dòng.</>
        )}
      </div>
    </div>
  );
}
