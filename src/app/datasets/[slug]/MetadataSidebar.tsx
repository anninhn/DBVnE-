import type { Dataset } from "@/lib/types/dataset";
import { formatCompactNumber } from "@/lib/format";
import { lookupDisplayName } from "@/lib/auth";

interface MetadataSidebarProps {
  dataset: Dataset;
}

/**
 * Format ISO date → relative time tiếng Việt (vd: "2 ngày trước").
 * Fallback: absolute date nếu > 30 ngày.
 */
function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay < 30) return `${diffDay} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

async function ActorRow({
  label,
  username,
  isoTime,
}: {
  label: string;
  username?: string;
  isoTime?: string;
}) {
  if (!username || !isoTime) return null;
  const displayName = await lookupDisplayName(username);
  return (
    <div className="flex justify-between py-0.5">
      <dt className="text-hf-text-muted">{label}</dt>
      <dd className="font-medium text-right max-w-[60%]">
        <span className="font-medium">{displayName}</span>
        <span className="text-hf-text-faint ml-1">• {relativeTime(isoTime)}</span>
      </dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-hf-bg-subtle border border-hf-border rounded-lg p-3 mb-3">
      <h4 className="text-xs font-semibold text-hf-text-faint mb-2">{title}</h4>
      <div className="text-[13px] text-hf-text">{children}</div>
    </div>
  );
}

export default async function MetadataSidebar({ dataset }: MetadataSidebarProps) {
  return (
    <div>
      {/* Downloads */}
      <Card title="Downloads">
        <div className="text-2xl font-bold text-hf-text">{dataset.downloads}</div>
        <div className="text-xs text-hf-text-muted">last 30 days</div>
      </Card>

      {/* Size */}
      <Card title="Size">
        <dl className="text-[13px]">
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
          <div className="flex justify-between py-0.5">
            <dt className="text-hf-text-muted">Year</dt>
            <dd className="font-medium">
              {dataset.year_range.length > 1
                ? `${Math.min(...dataset.year_range)}–${Math.max(...dataset.year_range)}`
                : dataset.year_range[0]}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Source + Actor (spec D2 — display uploaded_by/last_edited_by từ top-level metadata) */}
      <Card title="Source">
        <dl className="text-[13px]">
          <div className="flex justify-between py-0.5">
            <dt className="text-hf-text-muted">Source</dt>
            <dd className="font-medium text-right max-w-[60%]">
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
          <ActorRow
            label="Người đăng"
            username={dataset.uploaded_by}
            isoTime={dataset.uploaded_at}
          />
          <ActorRow
            label="Chỉnh sửa cuối"
            username={dataset.last_edited_by}
            isoTime={dataset.last_edited_at}
          />
          <div className="flex justify-between py-0.5">
            <dt className="text-hf-text-muted">License</dt>
            <dd className="font-medium capitalize">{dataset.license}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
