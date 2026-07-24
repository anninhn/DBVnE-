import type { Dataset } from "@/lib/types/dataset";
import { formatCompactNumber } from "@/lib/format";
import { lookupDisplayName } from "@/lib/auth";

interface MetadataSidebarProps {
  dataset: Dataset;
}

/**
 * Format ISO datetime → absolute "dd/mm/yyyy, hh:mm" (giờ VN).
 *
 * Provenance journalism cần timestamp chính xác, không dùng relative time
 * ("2 ngày trước") vì mơ hồ khi trích dẫn nguồn.
 */
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-hf-bg-subtle border border-hf-border rounded-lg p-3 mb-3">
      <h4 className="text-xs font-semibold text-hf-text-faint mb-2">{title}</h4>
      <div className="text-[13px] text-hf-text">{children}</div>
    </div>
  );
}

type TimelineEntry = {
  label: string; // "Uploaded by" | "Edited by"
  by: string;
  at: string;
  summary?: string;
};

/**
 * Timeline Version history — spec D2 provenance hiển thị.
 *
 * Entry đầu luôn là upload (uploaded_by + uploaded_at).
 * Các entry sau lấy từ edits[] history (mỗi lần edit append qua injectEdited).
 *
 * Lookup displayName qua React cache() (1 fetch users.json/request) — không N+1.
 */
async function ActivityTimeline({ dataset }: { dataset: Dataset }) {
  // Reverse-chrono: latest edit on top, upload (origin) at bottom.
  // Convention GitHub/HuggingFace/Kaggle — user intent là check current state trước.
  const entries: TimelineEntry[] = [
    ...(dataset.edits ?? []).slice().reverse().map((e) => ({
      label: "Edited by",
      by: e.by,
      at: e.at,
      summary: e.summary,
    })),
    {
      label: "Uploaded by",
      by: dataset.uploaded_by,
      at: dataset.uploaded_at,
    },
  ];

  // Lookup displayNames song song — cache() dedupe users.json fetch
  const displayNames = await Promise.all(
    entries.map((e) => lookupDisplayName(e.by)),
  );

  return (
    <div className="relative">
      {entries.map((entry, i) => {
        const isLatest = i === 0;            // top entry = mới nhất (highlight vàng)
        const isOldest = i === entries.length - 1;  // bottom entry = origin (không có line dưới)
        return (
          // Row: relative + pl-5 để chừa space cho dot+line bên trái
          <div key={i} className="relative pl-5 pb-4 last:pb-0">
            {/* Vertical connector — absolute, top=sau dot, bottom=trước dot kế tiếp.
                Dùng absolute thay flex-1 để độc lập với stretch behavior.
                Skip ở entry cuối (origin/oldest) vì không có entry nào bên dưới. */}
            {!isOldest && (
              <div
                className="absolute left-[5px] top-3 bottom-0 w-px bg-hf-border-strong"
                aria-hidden
              />
            )}
            {/* Dot — latest (top) highlight HF link blue (#2563eb, cùng tông URL + GeoJSON map),
                các entry cũ muted gray. Ring card color "cut" line visually. */}
            <div
              className={`absolute left-[1px] top-[5px] w-2.5 h-2.5 rounded-full ring-2 ring-hf-bg-subtle ${
                isLatest ? "bg-hf-link" : "bg-hf-text-muted"
              }`}
            />
            {/* Content */}
            <div className="text-[13px] leading-snug">
              <span className="text-hf-text-muted">{entry.label} </span>
              <span className="font-medium">{displayNames[i]}</span>
              {isLatest && entries.length > 1 && (
                <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-hf-link/10 text-hf-link align-middle">
                  Mới nhất
                </span>
              )}
            </div>
            <div className="text-xs text-hf-text-faint mt-0.5">
              {formatTimestamp(entry.at)}
            </div>
            {entry.summary && (
              <div className="text-xs text-hf-text-faint mt-0.5 italic">
                {entry.summary}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default async function MetadataSidebar({ dataset }: MetadataSidebarProps) {
  return (
    <div>
      {/* Usage — gộp Downloads + Article Linking (spec 2026-07-24).
          Cả 2 metric cùng phản ánh mức độ lan tỏa thực tế của dataset. */}
      <Card title="Usage">
        <div className="grid grid-cols-2 gap-3">
          {/* Downloads */}
          <div className="min-w-0">
            <div className="text-2xl font-bold text-hf-text">
              {dataset.downloads}
            </div>
            <div className="text-xs text-hf-text-muted">Downloads</div>
            <div className="text-[11px] text-hf-text-faint">all time</div>
          </div>

          {/* Articles — provenance ngược từ bài báo VnExpress đã publish */}
          <div className="min-w-0 border-l border-hf-border pl-3">
            <div className="text-2xl font-bold text-hf-text">
              {dataset.articles?.length ?? 0}
            </div>
            <div className="text-xs text-hf-text-muted">Articles</div>
            <div className="text-[11px] text-hf-text-faint">
              {(dataset.articles?.length ?? 0) > 0
                ? "đã dùng dataset"
                : "chưa có"}
            </div>
          </div>
        </div>
      </Card>

      {/* Details — gộp Source + Size (spec 2026-07-24).
          Cả 2 đều là metadata tĩnh của dataset, gộp để tiết kiệm vertical space. */}
      <Card title="Details">
        <dl className="text-[13px]">
          {/* Source group — provenance */}
          <div className="flex justify-between py-0.5 gap-2">
            <dt className="text-hf-text-muted shrink-0">Source</dt>
            <dd className="font-medium text-right min-w-0 truncate">
              {dataset.source_url ? (
                <a
                  href={dataset.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-hf-link hover:underline"
                >
                  {dataset.source}
                </a>
              ) : (
                dataset.source
              )}
            </dd>
          </div>

          {/* Divider nhẹ giữa 2 nhóm semantic */}
          <div className="my-1.5 border-t border-hf-border/60" />

          {/* Size group — format metadata */}
          <div className="flex justify-between py-0.5">
            <dt className="text-hf-text-muted">Rows</dt>
            <dd className="font-medium">{formatCompactNumber(dataset.row_count)}</dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt className="text-hf-text-muted">Files</dt>
            <dd className="font-medium">{dataset.file_count}</dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt className="text-hf-text-muted">Size</dt>
            <dd className="font-medium">{dataset.total_size_mb} MB</dd>
          </div>
        </dl>
      </Card>

      {/* Version history — timeline upload + edits[] (spec D2 provenance) */}
      <Card title="Version history">
        <ActivityTimeline dataset={dataset} />
      </Card>
    </div>
  );
}
