"use client";

import { Fragment, useState } from "react";
import dynamic from "next/dynamic";
import {
  Table2,
  MapPin,
  FileText,
  FileAudio,
  File,
} from "lucide-react";
import type { Resource } from "@/lib/types/dataset";
import { formatCompactNumber } from "@/lib/format";

// Lazy-load R2FileViewer — component kéo theo xlsx (~711 KB parsed) và các parser
// chỉ cần khi user click "Preview". Tách khỏi INITIAL chunk của detail page.
const R2FileViewer = dynamic(() => import("./R2FileViewer"), {
  loading: () => (
    <div className="py-4 text-[13px] text-hf-text-muted">Đang tải viewer…</div>
  ),
});

function FileIcon({ type, className }: { type?: string; className?: string }) {
  const common = { className, strokeWidth: 1.75, "aria-hidden": true as const };
  switch (type) {
    case "csv":
    case "xlsx":
      return <Table2 {...common} />;
    case "pdf":
      return <FileText {...common} />;
    case "mp3":
      return <FileAudio {...common} />;
    case "geojson":
      return <MapPin {...common} />;
    default:
      return <File {...common} />;
  }
}

interface FilesTabContentProps {
  resources: Resource[];
  slug: string;
  canDownload?: boolean;
}

/**
 * Files tab content — bảng metadata + nút "Xem trước" mở R2FileViewer inline.
 *
 * Client component vì cần state toggle cho mỗi row.
 */
export default function FilesTabContent({ resources, slug, canDownload = true }: FilesTabContentProps) {
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
                <td className="px-3 py-1.5 flex items-center gap-1.5">
                  <FileIcon type={r.file_type} className="w-3.5 h-3.5 text-hf-text-faint shrink-0" />
                  <span className="font-mono">
                    {r.title.toLowerCase().replace(/\s+/g, "_")}.{r.file_type ?? "csv"}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right">{r.file_size_mb} MB</td>
                <td className="px-3 py-1.5 text-right">
                  {r.structured_data?.length != null
                    ? `${formatCompactNumber(r.structured_data.length)} rows`
                    : "—"}
                </td>
                <td className="px-3 py-1.5">
                  {new Date(r.uploaded_at).toLocaleDateString("vi-VN", { month: "short", day: "numeric" })}
                </td>
                <td className="px-3 py-1.5 flex gap-3 items-center">
                  <button
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="text-hf-link hover:underline text-[13px] font-sans"
                  >
                    {expandedId === r.id ? "Collapse" : "Preview"}
                  </button>
                  <a
                    href={
                      canDownload
                        ? `/api/dataset/download?slug=${encodeURIComponent(slug)}&resourceId=${r.id}`
                        : `/login?next=${encodeURIComponent(`/datasets/${slug}`)}`
                    }
                    className="text-hf-link hover:underline"
                  >
                    Download
                  </a>
                </td>
              </tr>
              {expandedId === r.id && (
                <tr className="border-b border-hf-border">
                  <td colSpan={5} className="px-3 py-2 bg-hf-bg">
                    <R2FileViewer resource={r} canDownload={canDownload} slug={slug} />
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
