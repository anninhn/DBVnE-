/**
 * CitationCard — mini DatasetCard hiển thị trong Discovery Chat response.
 *
 * Render: title (link → detail page), confidence badge, reason 1 câu.
 * Pattern: compact variant của DatasetCard listing (hf-* color scheme).
 *
 * Spec 2026-07-24-discovery-chat.
 */

import Link from "next/link";
import { memo } from "react";

export interface CitationCardProps {
  slug: string;
  title?: string; // optional — fallback sang slug nếu LLM không trả
  reason: string;
  confidence: "high" | "medium" | "low";
}

const CONFIDENCE_STYLES: Record<
  CitationCardProps["confidence"],
  { label: string; className: string }
> = {
  high: {
    label: "Phù hợp cao",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  medium: {
    label: "Phù hợp vừa",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
  low: {
    label: "Có thể liên quan",
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
};

function CitationCardImpl({
  slug,
  title,
  reason,
  confidence,
}: CitationCardProps) {
  const conf = CONFIDENCE_STYLES[confidence];
  return (
    <Link
      href={`/datasets/${slug}`}
      className="block border border-hf-border rounded-md p-3 hover:border-hf-yellow hover:bg-hf-bg-subtle transition group"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-medium text-hf-text group-hover:text-hf-text">
          {title ?? slug}
        </span>
        <span
          className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border font-medium ${conf.className}`}
        >
          {conf.label}
        </span>
      </div>
      <p className="text-sm text-hf-text-muted">{reason}</p>
      <p className="text-[11px] text-hf-text-faint mt-1.5 inline-flex items-center gap-0.5">
        Xem chi tiết →
      </p>
    </Link>
  );
}

const CitationCard = memo(CitationCardImpl);
export default CitationCard;
