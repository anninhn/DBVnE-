/**
 * ChatBox — Discovery Chat main client component.
 *
 * Render:
 *   - Input box + suggested prompts (initial state)
 *   - Streaming response: spinner "Đang trả lời..."
 *   - Final response: Markdown answer + CitationCards + FollowUpPills + ThumbsFeedback
 *   - Empty state (no match): EmptyState component
 *   - Error states: API error / rate limit
 *
 * Streaming: fetch POST /api/chat/discovery → read response.body as ReadableStream
 * → accumulate text → on done parse JSON → render structured.
 *
 * Spec 2026-07-24-discovery-chat.
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, ArrowUp, AlertCircle, Search, Compass, Lightbulb, Database, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CitationCard from "./CitationCard";
import FollowUpPills from "./FollowUpPills";
import ThumbsFeedback from "./ThumbsFeedback";
import EmptyState from "./EmptyState";
import {
  extractDiscoveryJSON,
  type DiscoveryResponse,
} from "@/lib/chat/extract-json";

// Capability hints — mô tả cho user thấy platform có thể giúp gì.
// Render bên dưới input, vertical stack, left-aligned (ChatGPT pattern).
const CAPABILITY_HINTS = [
  { icon: Search, label: "Tìm dataset phù hợp" },
  { icon: Compass, label: "Khám phá dữ liệu hiện có" },
  { icon: Lightbulb, label: "Gợi ý dữ liệu cho đề tài" },
];

// Random greeting per mount — pick 1 trong array, stable trong suốt session.
const GREETINGS = [
  "Rất vui được gặp lại",
  "Chào mừng trở lại",
  "Lâu quá không gặp",
  "Hôm nay bạn muốn tìm gì",
  "Sẵn sàng khám phá dữ liệu chưa",
  "Chào một ngày làm việc hiệu quả",
];

// Random placeholder — tone casual/gằn tiếp viên, pick 1 per mount.
const PLACEHOLDERS = [
  "Hỏi gì hỏi đi, thằng này trả lời hết...",
  "Hỏi đi chứ, tôi không cắn đâu...",
  "Hỏi nhiều vô, liên hệ chị Hằng để trả tiền API...",
  "Hỏi nhanh, token đang rẻ...",
  "Hỏi đi, để tôi còn có việc...",
  "Hỏi đại cũng được...",
  "Đừng nhìn nữa, hỏi gì đi...",
];

interface ChatEntry {
  id: string | null; // null cho user message
  role: "user" | "assistant";
  query: string;
  response?: DiscoveryResponse;
  chatId?: string; // for thumbs
  error?: string;
}

export default function ChatBox({
  displayName,
  attachedDataset: initialAttached,
}: {
  displayName: string;
  attachedDataset?: { slug: string; title: string } | null;
}) {
  const searchParams = useSearchParams();
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  // Attach dataset (ChatGPT-style chip) — từ sidebar "Hỏi về dataset này".
  // Submit gửi attachedSlug → API inject full metadata + dictionary làm FOCUS.
  const [attached, setAttached] = useState(initialAttached ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Guard chống apply prefill nhiều lần (StrictMode double-invoke + URL ref change).
  // Apply 1 lần duy nhất trên mount.
  const prefillAppliedRef = useRef(false);
  const prefillTitle = searchParams.get("prefill");

  // Random greeting + placeholder — set sau mount via useEffect để tránh
  // hydration mismatch (server vs client Math.random() khác nhau → React
  // reconciliation jank, có thể gây input/pill "nhảy" khi user type).
  const [greeting, setGreeting] = useState(GREETINGS[0]);
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0]);

  useEffect(() => {
    setGreeting(GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
    setPlaceholder(PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);
  }, []);

  // Auto-scroll khi entries thay đổi. Streaming dùng "auto" (instant) để theo dõi
  // cursor mượt — "smooth" mỗi chunk gây jump. Entry mới (non-streaming) mới smooth.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: streamingText ? "auto" : "smooth",
    });
  }, [entries, streamingText]);

  const submit = useCallback(async (queryText: string) => {
    const query = queryText.trim();
    if (!query || loading) return;

    setLoading(true);
    setStreamingText("");
    setInput("");

    // Add user entry ngay lập tức
    const userEntry: ChatEntry = {
      id: null,
      role: "user",
      query,
    };
    setEntries((prev) => [...prev, userEntry]);

    try {
      const res = await fetch("/api/chat/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, attachedSlug: attached?.slug }),
      });

      if (!res.ok) {
        let errorMsg = "Tạm không trả lời được. Thử lại sau.";
        if (res.status === 401) {
          errorMsg = "Vui lòng đăng nhập để tiếp tục.";
        } else if (res.status === 429) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          errorMsg = data.error ?? "Bạn đã hỏi quá nhiều hôm nay. Quay lại sau.";
        } else if (res.status >= 500) {
          errorMsg = "Server đang gặp vấn đề. Thử lại sau ít phút.";
        }
        setEntries((prev) => [
          ...prev,
          {
            id: null,
            role: "assistant",
            query,
            error: errorMsg,
          },
        ]);
        return;
      }

      // Stream body — accumulate text
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Không đọc được response stream");
      }

      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setStreamingText(fullText);
      }

      // Parse JSON cuối — robust extractor handle markdown fence, prefix/suffix text,
      // conversational + JSON pattern (LLM thỉnh thoảng vi phạm JSON-only rule).
      const extracted = extractDiscoveryJSON(fullText);
      const parsed: DiscoveryResponse =
        extracted ?? {
          answer: fullText || "(Phản hồi trống)",
          datasets: [],
          follow_ups: [],
        };

      // Read chatId từ header → wire cho thumbs
      const chatId = res.headers.get("X-Chat-Id") ?? undefined;

      const assistantEntry: ChatEntry = {
        id: crypto.randomUUID(),
        role: "assistant",
        query,
        response: parsed,
        chatId,
      };
      setEntries((prev) => [...prev, assistantEntry]);
    } catch (err) {
      console.error("[chat] submit failed:", err);
      setEntries((prev) => [
        ...prev,
        {
          id: null,
          role: "assistant",
          query,
          error: "Tạm không kết nối được. Thử lại sau.",
        },
      ]);
    } finally {
      setLoading(false);
      setStreamingText("");
    }
  }, [loading, attached?.slug]);

  // Pre-fill từ URL ?prefill=<title> — CTA từ dataset detail page.
  // CHỈ fill input, KHÔNG auto-submit — user có agency edit/ask câu riêng.
  // Ref guard áp dụng 1 lần duy nhất (StrictMode + URL ref change safe).
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (!prefillTitle) return;
    prefillAppliedRef.current = true;
    setInput(prefillTitle);
  }, [prefillTitle]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit(input);
  }

  const hasEntries = entries.length > 0;

  // Attach chip — ChatGPT-style, render phía trên input. Click X để clear attach.
  // (User có thể clear nếu muốn hỏi về dataset khác hoặc câu generic.)
  const renderAttachChip = () =>
    attached ? (
      <div className="flex justify-start mb-2">
        <div className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-hf-yellow/15 border border-hf-yellow/50 text-[12px] text-hf-text max-w-full">
          <Database className="w-3 h-3 shrink-0 text-hf-text-muted" aria-hidden />
          <span className="truncate max-w-[260px]" title={attached.title}>
            {attached.title}
          </span>
          <button
            type="button"
            onClick={() => setAttached(null)}
            disabled={loading}
            aria-label="Bỏ attach dataset"
            className="ml-0.5 p-0.5 rounded-full hover:bg-hf-yellow/30 text-hf-text-muted hover:text-hf-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <X className="w-3 h-3" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    ) : null;

  // Input form reused ở 2 nơi: greeting state (centered) + conversation state (bottom).
  // Function tạo element mới mỗi call → tránh shared-ref issue khi render 2 nơi.
  const renderInput = () => (
    <form onSubmit={handleSubmit}>
      {renderAttachChip()}
      <div className="relative flex items-center rounded-full border border-hf-border bg-hf-bg shadow-sm transition-colors focus-within:border-hf-border-strong">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          disabled={loading}
          maxLength={1000}
          className="flex-1 bg-transparent pl-6 pr-16 py-4 text-base text-hf-text placeholder:text-hf-text-faint focus:outline-none disabled:cursor-not-allowed"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Gửi câu hỏi"
          className="absolute right-2.5 p-2.5 rounded-full bg-hf-text text-hf-bg hover:bg-hf-text/80 transition-colors transition-opacity disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
          )}
        </button>
      </div>
    </form>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-52px)] max-w-3xl mx-auto w-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* GREETING STATE — input centered + suggestions dưới (left-align) */}
        {!hasEntries && !loading && (
          <div className="flex flex-col items-center justify-center min-h-full px-4 pt-16 pb-10 text-center">
            <div className="inline-flex items-center gap-1.5 mb-2 text-xs uppercase tracking-wider text-hf-text-faint">
              <span>Ask Me Anything</span>
              <span className="text-[10px] font-bold leading-none px-1.5 py-0.5 rounded bg-hf-yellow text-hf-text normal-case tracking-normal">
                beta
              </span>
            </div>
            <h1 className="text-[28px] leading-tight text-hf-text mb-2.5">
              {greeting},{" "}
              <span className="font-bold">{displayName}</span>
            </h1>
            {/* Input centered cùng greeting */}
            <div className="mt-8 w-full max-w-2xl">{renderInput()}</div>
            {/* Suggestions — dưới input, left-aligned. Ẩn khi user type để clear clutter. */}
            <div
              className={`mt-6 w-full max-w-2xl flex flex-col items-start gap-4 text-left transition-opacity duration-200 ${
                input.trim() ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
            >
              {CAPABILITY_HINTS.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="inline-flex items-center gap-3 text-sm text-hf-text-muted"
                >
                  <Icon className="w-4 h-4 text-hf-text-faint" aria-hidden />
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CONVERSATION STATE — entries */}
        {hasEntries && (
          <div className="px-4 py-6 space-y-6">
            {entries.map((entry, idx) => (
              <div
                key={entry.id ?? `entry-${idx}`}
                className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {entry.role === "user" ? (
                  <div className="max-w-[75%] rounded-2xl rounded-br-md px-4 py-2.5 bg-hf-yellow/30 text-hf-text">
                    <p className="text-sm whitespace-pre-wrap break-words">{entry.query}</p>
                  </div>
                ) : (
                  <div className="w-full max-w-[92%]">
                    {entry.error ? (
                      <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <p>{entry.error}</p>
                      </div>
                    ) : entry.response ? (
                      <ResponseView
                        response={entry.response}
                        disabled={loading}
                        onSelectFollowUp={submit}
                        chatId={entry.chatId}
                      />
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Streaming indicator — chỉ khi đã trong conversation */}
        {loading && hasEntries && (
          <div className="px-4 pb-6">
            <div className="flex justify-start">
              <div className="w-full max-w-[92%]">
                {streamingText ? (
                  <p className="text-sm text-hf-text-muted whitespace-pre-wrap font-mono">
                    {streamingText.slice(-200)}
                    <span className="inline-block w-1.5 h-3.5 bg-hf-text-muted ml-0.5 animate-pulse" />
                  </p>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-hf-text-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang tìm dataset phù hợp...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* INPUT — anchored bottom, chỉ conversation state. Greeting state render input centered. */}
      {hasEntries && (
        <div className="px-4 pb-5 pt-2 max-w-2xl mx-auto w-full">{renderInput()}</div>
      )}
    </div>
  );
}

/**
 * ResponseView — render 1 assistant response (answer + citations + follow-ups + thumbs).
 */
function ResponseView({
  response,
  disabled,
  onSelectFollowUp,
  chatId,
}: {
  response: DiscoveryResponse;
  disabled?: boolean;
  onSelectFollowUp: (q: string) => void;
  chatId?: string;
}) {
  const hasDatasets = response.datasets.length > 0;

  return (
    <div className="space-y-3 min-w-[280px]">
      {/* Answer */}
      <div className="prose prose-sm max-w-none text-hf-text">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {response.answer}
        </ReactMarkdown>
      </div>

      {/* Citations */}
      {hasDatasets && (
        <div className="space-y-2">
          {response.datasets.map((d, i) => (
            <CitationCard
              key={`${d.slug}-${i}`}
              slug={d.slug}
              title={d.title}
              reason={d.reason}
              confidence={d.confidence}
            />
          ))}
        </div>
      )}

      {/* Empty state khi không có dataset match */}
      {!hasDatasets && <EmptyState onSelect={onSelectFollowUp} disabled={disabled} />}

      {/* Follow-ups */}
      {hasDatasets && response.follow_ups.length > 0 && (
        <FollowUpPills
          followUps={response.follow_ups}
          onSelect={onSelectFollowUp}
          disabled={disabled}
        />
      )}

      {/* Thumbs — chỉ render khi có chatId */}
      {chatId && <ThumbsFeedback chatId={chatId} />}
    </div>
  );
}
