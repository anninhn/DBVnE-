"use client";

import { Fragment, useState } from "react";
import type { Resource } from "@/lib/types/dataset";
import R2FileViewer from "./R2FileViewer";

interface FilesTabContentProps {
  resources: Resource[];
}

function fileIcon(type?: string): string {
  switch (type) {
    case "csv":
    case "xlsx":
      return "📊";
    case "pdf":
      return "📄";
    case "mp3":
      return "🎵";
    case "geojson":
      return "🗺️";
    case "json":
      return "🧩";
    default:
      return "📁";
  }
}

/**
 * Files tab content — bảng metadata + nút "Xem trước" mở R2FileViewer inline.
 *
 * Client component vì cần state toggle cho mỗi row.
 */
export default function FilesTabContent({ resources }: FilesTabContentProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (resources.length === 0) {
    return (
      <div className="p-6 text-center text-hf-text-muted text-[13px]">
        Dataset này chưa có file.
      </div>
    );
  }

  return (
    <div className="p-6">
      <table className="w-full border-collapse text-[13px] font-mono border-t border-hf-border">
        <thead>
          <tr>
            {["filename", "size", "rows", "updated", ""].map((h) => (
              <th
                key={h}
                className="text-left px-3 pt-2.5 pb-2 bg-hf-bg-subtle border-b border-hf-border font-semibold font-sans text-hf-text"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resources.map((r) => (
            <Fragment key={r.id}>
              <tr className="border-b border-hf-border last:border-0">
                <td className="px-3 py-1.5">
                  {fileIcon(r.file_type)} {r.title.toLowerCase().replace(/\s+/g, "_")}.{r.file_type ?? "csv"}
                </td>
                <td className="px-3 py-1.5 text-right">{r.file_size_mb} MB</td>
                <td className="px-3 py-1.5 text-right">
                  {r.structured_data?.length.toLocaleString("vi-VN") ?? "—"}
                </td>
                <td className="px-3 py-1.5">
                  {new Date(r.uploaded_at).toLocaleDateString("vi-VN", { month: "short", day: "numeric" })}
                </td>
                <td className="px-3 py-1.5 flex gap-3 items-center">
                  <button
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="text-hf-link hover:underline text-[13px] font-sans"
                  >
                    {expandedId === r.id ? "Thu gọn" : "Xem trước"}
                  </button>
                  <a href={r.file_url ?? "#"} className="text-hf-link hover:underline">
                    download
                  </a>
                </td>
              </tr>
              {expandedId === r.id && (
                <tr className="border-b border-hf-border">
                  <td colSpan={5} className="px-3 py-2 bg-hf-bg">
                    <R2FileViewer resource={r} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
