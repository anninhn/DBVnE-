/**
 * ThumbsFeedback — 👍/👎 buttons + optional feedback text khi 👎.
 *
 * Submit qua POST /api/chat/feedback với chat_id (từ response header).
 * Disable sau khi submit — 1 feedback/entry.
 *
 * Spec 2026-07-24-discovery-chat.
 */

"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";

export interface ThumbsFeedbackProps {
  chatId: string;
}

type SubmitState = "idle" | "submitting" | "done";

export default function ThumbsFeedback({ chatId }: ThumbsFeedbackProps) {
  const [state, setState] = useState<SubmitState>("idle");
  const [submittedThumb, setSubmittedThumb] = useState<"up" | "down" | null>(
    null,
  );
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  async function submit(thumb: "up" | "down") {
    if (state === "submitting" || state === "done") return;

    if (thumb === "down") {
      // Mở text feedback trước khi submit — user có thể skip
      setSubmittedThumb("down");
      setShowFeedback(true);
      return;
    }

    // 👍 → submit ngay
    setState("submitting");
    setSubmittedThumb("up");
    try {
      await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, thumbs: "up" }),
      });
    } catch {
      // Silent fail — feedback là best-effort
    } finally {
      setState("done");
    }
  }

  async function submitDownWithFeedback() {
    setState("submitting");
    try {
      await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          thumbs: "down",
          feedback_text: feedbackText.trim() || undefined,
        }),
      });
    } catch {
      // Silent fail
    } finally {
      setState("done");
      setShowFeedback(false);
    }
  }

  if (state === "submitting") {
    return (
      <div className="flex items-center gap-2 text-hf-text-faint text-xs mt-2">
        <Loader2 className="w-3 h-3 animate-spin" />
        Đang lưu...
      </div>
    );
  }

  if (state === "done") {
    return (
      <p className="text-xs text-hf-text-faint mt-2">
        {submittedThumb === "up" ? "Cảm ơn phản hồi 👍" : "Cảm ơn đã báo lỗi — team sẽ cải thiện"}
      </p>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 text-hf-text-muted">
        <span className="text-[11px] uppercase tracking-wide text-hf-text-faint mr-1">
          Câu trả lời này hữu ích?
        </span>
        <button
          type="button"
          onClick={() => submit("up")}
          className="p-1 rounded hover:bg-hf-bg-muted hover:text-green-700 transition"
          aria-label="Hữu ích"
          title="Hữu ích"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => submit("down")}
          className="p-1 rounded hover:bg-hf-bg-muted hover:text-red-700 transition"
          aria-label="Không hữu ích"
          title="Không hữu ích — báo lỗi"
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {showFeedback && submittedThumb === "down" && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Câu trả lời sai ở đâu? (không bắt buộc)"
            rows={2}
            className="w-full text-sm border border-hf-border rounded px-2 py-1 bg-hf-bg resize-none focus:outline-none focus:border-hf-yellow"
            maxLength={1000}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitDownWithFeedback}
              className="text-[12px] px-2.5 py-1 rounded bg-hf-yellow text-hf-text font-medium hover:bg-hf-yellow/80 transition"
            >
              Gửi báo lỗi
            </button>
            <button
              type="button"
              onClick={() => {
                setShowFeedback(false);
                setSubmittedThumb(null);
              }}
              className="text-[12px] px-2.5 py-1 text-hf-text-muted hover:text-hf-text transition"
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
