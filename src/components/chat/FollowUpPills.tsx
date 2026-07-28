/**
 * FollowUpPills — render follow_ups[] từ Discovery response thành pill buttons.
 *
 * Click → call onPrefill(followUp) → ChatBox fill input, KHÔNG auto-submit
 * (user có agency edit/enter — consistent với EmptyState + ?prefill URL).
 *
 * Spec 2026-07-24-discovery-chat.
 */

import { memo } from "react";

export interface FollowUpPillsProps {
  followUps: string[];
  onPrefill: (query: string) => void;
  /** Disable khi đang loading/streaming — tránh spam submit. */
  disabled?: boolean;
}

function FollowUpPillsImpl({
  followUps,
  onPrefill,
  disabled,
}: FollowUpPillsProps) {
  if (followUps.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-hf-border">
      <p className="text-[11px] uppercase tracking-wide text-hf-text-faint mb-2">
        Gợi ý câu hỏi tiếp
      </p>
      <div className="flex flex-wrap gap-2">
        {followUps.map((q, i) => (
          <button
            key={`${q}-${i}`}
            type="button"
            disabled={disabled}
            onClick={() => onPrefill(q)}
            className="text-[13px] px-2.5 py-1 rounded-full border border-hf-border bg-hf-bg hover:bg-hf-yellow/20 hover:border-hf-yellow/50 text-hf-text-muted hover:text-hf-text transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

const FollowUpPills = memo(FollowUpPillsImpl);
export default FollowUpPills;
