import type { Dataset } from "@/lib/types/dataset";
import { formatCompactNumber } from "@/lib/format";

interface MetadataSidebarProps {
  dataset: Dataset;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-hf-bg-subtle border border-hf-border rounded-lg p-3 mb-3">
      <h4 className="text-xs font-semibold text-hf-text-faint mb-2">{title}</h4>
      <div className="text-[13px] text-hf-text">{children}</div>
    </div>
  );
}

export default function MetadataSidebar({ dataset }: MetadataSidebarProps) {
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

      {/* Source */}
      <Card title="Source">
        <dl className="text-[13px]">
          <div className="flex justify-between py-0.5">
            <dt className="text-hf-text-muted">Source</dt>
            <dd className="font-medium text-right max-w-[60%]">{dataset.source}</dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt className="text-hf-text-muted">Uploader</dt>
            <dd className="font-medium">{dataset.uploaded_by}</dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt className="text-hf-text-muted">Uploaded</dt>
            <dd className="font-medium">
              {new Date(dataset.uploaded_at).toLocaleDateString("vi-VN")}
            </dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt className="text-hf-text-muted">License</dt>
            <dd className="font-medium capitalize">{dataset.license}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
