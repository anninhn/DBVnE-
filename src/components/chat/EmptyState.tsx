/**
 * EmptyState — render khi Discovery response không có dataset match.
 *
 * Show message rõ ràng + suggest 3-4 topics phổ biến để user refine query.
 * Click topic → onSelect(query) → ChatBox pre-fill + submit.
 *
 * Spec 2026-07-24-discovery-chat — hard empty pattern (KHÔNG fake match).
 */

import { memo } from "react";

export interface EmptyStateProps {
  onSelect: (query: string) => void;
  disabled?: boolean;
}

const TOPIC_SUGGESTIONS = [
  { label: "Kinh tế", query: "Có data gì về kinh tế Việt Nam?" },
  { label: "Dân số", query: "Dân số các tỉnh năm 2024?" },
  { label: "Bầu cử", query: "Dữ liệu bầu cử quốc hội?" },
  { label: "Khí hậu", query: "Có dữ liệu về khí hậu miền Trung không?" },
];

function EmptyStateImpl({ onSelect, disabled }: EmptyStateProps) {
  return (
    <div className="border border-dashed border-hf-border rounded-md p-6 bg-hf-bg-subtle">
      <p className="text-hf-text font-medium mb-1">Không tìm thấy dataset phù hợp</p>
      <p className="text-sm text-hf-text-muted mb-4">
        Thử câu hỏi khác — hoặc dùng gợi ý dưới đây.
      </p>
      <div className="flex flex-wrap gap-2">
        {TOPIC_SUGGESTIONS.map((t) => (
          <button
            key={t.label}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(t.query)}
            className="text-[13px] px-3 py-1.5 rounded-md border border-hf-border bg-hf-bg hover:bg-hf-yellow/20 hover:border-hf-yellow/50 text-hf-text-muted hover:text-hf-text transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const EmptyState = memo(EmptyStateImpl);
export default EmptyState;
