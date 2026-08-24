"use client";

/**
 * ArticlesTab — hiển thị + thêm bài báo VNExpress liên kết với dataset.
 *
 * Spec: specs/2026-07-24-article-linking/
 *
 * UX chat-like (refactor 2026-07-24):
 *  - Empty state: prompt "Dán URL bài báo vnexpress.net..." + nút toggle
 *  - Paste URL → auto-fire onPaste → fetch OG → auto-save → card render
 *  - Enter cũng submit được
 *  - OG fail → fallback title-only input (URL đã có, chỉ cần title)
 *
 * Auth: tab luôn render read-only. Nút add chỉ hiện nếu user đã login.
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { FileText, Loader2, Plus, X } from "lucide-react";
import type { ArticleEntry } from "@/lib/types/dataset";

interface Props {
  slug: string;
  initialArticles: ArticleEntry[];
}

export default function ArticlesTab({ slug, initialArticles }: Props) {
  const { status } = useSession();
  const [articles, setArticles] = useState<ArticleEntry[]>(initialArticles);
  const [showAdd, setShowAdd] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  function handleArticleAdded(article: ArticleEntry) {
    setArticles((prev) => [...prev, article]);
    setShowAdd(false);
  }

  const isLoggedIn = status === "authenticated";

  /**
   * Gỡ liên kết bài báo (spec 003 FR-032).
   * Optimistic: bỏ khỏi danh sách ngay, khôi phục nếu server từ chối — cùng
   * pattern với thao tác thêm, để người dùng không phải chờ round-trip git.
   */
  async function handleRemove(url: string) {
    const snapshot = articles;
    setArticles((prev) => prev.filter((a) => a.url !== url));
    setRemoveError(null);
    try {
      const res = await fetch("/api/dataset/articles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Không gỡ được liên kết bài báo.");
      }
    } catch (err) {
      setArticles(snapshot);
      setRemoveError(
        err instanceof Error ? err.message : "Không gỡ được liên kết bài báo."
      );
    }
  }

  return (
    <div className="p-6">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-hf-text">
          Article Linking
          {articles.length > 0 && (
            <span className="ml-2 text-sm font-normal text-hf-text-muted">
              ({articles.length})
            </span>
          )}
        </h2>
        {isLoggedIn && !showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 rounded-md border border-hf-border-strong bg-hf-bg text-[13px] font-medium text-hf-text hover:bg-hf-bg-muted transition inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
            Liên kết bài báo
          </button>
        )}
      </div>

      {/* Mô tả — giải thích mục đích tab + cách dùng */}
      <p className="mb-4 text-xs text-hf-text-muted leading-relaxed">
        Danh sách bài viết VnExpress đã publish có sử dụng dữ liệu từ dataset này.
        Dán URL bài báo (vd: <code className="px-1 py-0.5 bg-hf-bg-muted rounded text-[11px]">vnexpress.net/...</code>) rồi nhấn Enter — tiêu đề, tác giả, chuyên mục và thumbnail được tự động lấy từ trang. Số lượng bài báo phản ánh mức độ lan tỏa thực tế của dataset trong các bài đã xuất bản.
      </p>

      {/* Empty state */}
      {articles.length === 0 && !showAdd && (
        <div className="text-center py-16 text-hf-text-muted">
          {isLoggedIn ? (
            <>
              <FileText
                className="w-10 h-10 mx-auto mb-3 text-hf-text-faint"
                strokeWidth={1.5}
                aria-hidden
              />
              <p className="text-sm mb-1">Chưa có bài báo liên kết.</p>
              <p className="text-xs text-hf-text-faint">
                Dán URL bài viết VNExpress đã publish dùng dataset này.
              </p>
            </>
          ) : (
            <p className="text-sm">Chưa có bài báo liên kết.</p>
          )}
        </div>
      )}

      {/* Lỗi khi gỡ liên kết — dùng lại pattern khối đỏ của các form khác */}
      {removeError && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-hf-red/30 bg-red-50 px-3 py-2 text-[13px] text-hf-red">
          <span className="flex-1">
            <strong>Lỗi:</strong> {removeError}
          </span>
          <button
            type="button"
            onClick={() => setRemoveError(null)}
            className="shrink-0 underline hover:no-underline"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Quick add (URL paste → auto-save) */}
      {showAdd && isLoggedIn && (
        <QuickAddArticle
          slug={slug}
          onAdded={handleArticleAdded}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* List — VnExpress-style vertical list with horizontal thumb */}
      {articles.length > 0 && (
        <div className="flex flex-col">
          {articles.map((article) => (
            <ArticleCard
              key={article.url}
              article={article}
              onRemove={isLoggedIn ? handleRemove : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ArticleCard
// ──────────────────────────────────────────────────────────────────────────────

function ArticleCard({
  article,
  onRemove,
}: {
  article: ArticleEntry;
  /** Chỉ truyền khi user đã đăng nhập — không có thì card không hiện nút gỡ. */
  onRemove?: (url: string) => void;
}) {
  const [removing, setRemoving] = useState(false);
  const published = article.published_at
    ? new Date(article.published_at).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  const added = new Date(article.added_at).toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="group relative flex gap-4 py-4 border-b border-hf-border last:border-b-0 transition">
      {onRemove && (
        <button
          type="button"
          disabled={removing}
          onClick={() => {
            setRemoving(true);
            onRemove(article.url);
          }}
          title="Gỡ liên kết bài báo này"
          aria-label="Gỡ liên kết bài báo này"
          className="absolute top-3 right-0 z-10 p-1 rounded text-hf-text-faint opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-hf-red hover:bg-red-50 transition disabled:opacity-50"
        >
          {removing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <X className="w-3.5 h-3.5" aria-hidden />
          )}
        </button>
      )}
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="contents"
    >
      {/* Thumbnail — VnExpress small-thumb style: 5:3 aspect ratio.
          Bulletproof: relative container + absolute img → không bao giờ tràn. */}
      {article.thumbnail && (
        <div className="relative w-[120px] h-[72px] shrink-0 overflow-hidden bg-hf-bg-muted rounded-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.thumbnail}
            alt=""
            width={120}
            height={72}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              // Ẩn thumbnail nếu load fail — card vẫn render bình thường chỉ với text
              (e.currentTarget.parentElement as HTMLElement).style.display = "none";
            }}
          />
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* Section tag — VnExpress red brand, uppercase small */}
        {article.section && (
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#A9324E] mb-1">
            {article.section}
          </div>
        )}

        {/* Title — Merriweather-style serif, dark, hover VnExpress blue */}
        <h3 className="font-serif font-bold text-[15px] leading-snug text-[#3D3D3D] line-clamp-2 group-hover:text-[#087cce] transition-colors">
          {article.title}
        </h3>

        {/* Meta line — author • date, VnExpress gray */}
        {(article.author || published) && (
          <div className="mt-1.5 text-[12px] text-[#7A7A7B] flex flex-wrap gap-x-2 items-center">
            {article.author && <span>{article.author}</span>}
            {article.author && published && (
              <span className="text-[#B7B7B7]">•</span>
            )}
            {published && <span>{published}</span>}
          </div>
        )}

        {/* Added by — subtle provenance */}
        <div className="mt-1 text-[11px] text-[#B7B7B7]">
          Added by {article.added_by} • {added}
        </div>
      </div>
    </a>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// QuickAddArticle — paste URL → auto-fetch OG → auto-save
// ──────────────────────────────────────────────────────────────────────────────

type AddPhase = "idle" | "fetching" | "fallback" | "submitting";

interface QuickAddArticleProps {
  slug: string;
  onAdded: (article: ArticleEntry) => void;
  onCancel: () => void;
}

function QuickAddArticle({ slug, onAdded, onCancel }: QuickAddArticleProps) {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<AddPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  // Fallback state — chỉ dùng khi OG fetch fail (title phải nhập tay)
  const [fallbackTitle, setFallbackTitle] = useState("");
  // Cached OG data nếu fetch OK nhưng user muốn edit title trước save (rare)
  const [cachedOg, setCachedOg] = useState<{
    title: string;
    author?: string;
    published_at?: string;
    section?: string;
    thumbnail?: string;
  } | null>(null);

  function resetToIdle() {
    setPhase("idle");
    setError(null);
    setFallbackTitle("");
    setCachedOg(null);
  }

  async function tryFetchAndSave(rawUrl: string) {
    const trimmed = rawUrl.trim();
    if (!trimmed) return;

    setError(null);
    setPhase("fetching");

    // Step 1: Fetch OG
    let ogData: {
      url: string;
      title: string;
      author?: string;
      published_at?: string;
      section?: string;
      thumbnail?: string;
    };

    try {
      const res = await fetch(
        `/api/dataset/articles/og?url=${encodeURIComponent(trimmed)}`
      );
      const data = await res.json();
      if (!res.ok) {
        // OG fail → fallback form để user nhập title tay
        setUrl(trimmed);
        setCachedOg(null);
        setFallbackTitle("");
        setPhase("fallback");
        setError(
          data.error
            ? `Không đọc được metadata: ${data.error}`
            : "Không đọc được metadata từ URL."
        );
        return;
      }
      ogData = data;
    } catch {
      setUrl(trimmed);
      setCachedOg(null);
      setFallbackTitle("");
      setPhase("fallback");
      setError("Không kết nối được tới server.");
      return;
    }

    // Step 2: Auto-save với OG data
    setCachedOg(ogData);
    await commitArticle({
      url: ogData.url,
      title: ogData.title,
      author: ogData.author,
      published_at: ogData.published_at?.slice(0, 10),
      section: ogData.section,
      thumbnail: ogData.thumbnail,
    });
  }

  async function commitArticle(article: {
    url: string;
    title: string;
    author?: string;
    published_at?: string;
    section?: string;
    thumbnail?: string;
  }) {
    setPhase("submitting");
    setError(null);

    try {
      const res = await fetch("/api/dataset/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, article }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không lưu được.");
        // Giữ nguyên phase fallback (nếu đang ở fallback) hoặc trở về fallback
        setPhase("fallback");
        if (!fallbackTitle && cachedOg?.title) {
          setFallbackTitle(cachedOg.title);
        }
        return;
      }

      // Success — notify parent + reset form
      if (data.article) {
        onAdded(data.article as ArticleEntry);
      }
      resetToIdle();
      setUrl("");
    } catch {
      setError("Không kết nối được tới server.");
      setPhase("fallback");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (phase === "fallback") {
        // Submit fallback với title user nhập
        if (fallbackTitle.trim()) {
          void commitArticle({
            url: url.trim(),
            title: fallbackTitle.trim(),
            author: cachedOg?.author,
            published_at: cachedOg?.published_at?.slice(0, 10),
            section: cachedOg?.section,
            thumbnail: cachedOg?.thumbnail,
          });
        }
      } else if (phase === "idle" && url.trim()) {
        void tryFetchAndSave(url.trim());
      }
    }
  }

  const isBusy = phase === "fetching" || phase === "submitting";

  return (
    <div className="mb-4 p-4 border border-hf-border-strong rounded-md bg-hf-bg-subtle">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-hf-text text-sm">Liên kết bài báo</h3>
        <button
          type="button"
          onClick={() => {
            resetToIdle();
            setUrl("");
            onCancel();
          }}
          className="text-hf-text-faint hover:text-hf-text"
          aria-label="Đóng"
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>

      {error && (
        <div className="mb-3 border border-hf-red/30 bg-red-50 text-hf-red px-3 py-2 rounded-md text-xs flex items-start justify-between">
          <div>
            <strong>Lỗi:</strong> {error}
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-hf-red hover:text-red-700 ml-3 text-xs"
          >
            Đóng
          </button>
        </div>
      )}

      {/* URL input — primary action */}
      <label className="block text-xs font-medium text-hf-text-muted mb-1">
        URL bài báo (vnexpress.net)
      </label>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Dán URL bài báo vnexpress.net..."
          disabled={isBusy}
          className="flex-1 px-3 py-1.5 text-sm border border-hf-border-strong rounded bg-hf-bg text-hf-text placeholder:text-hf-text-faint focus:outline-none focus:border-hf-link disabled:opacity-60"
        />
        {phase === "idle" && (
          <button
            type="button"
            onClick={() => url.trim() && void tryFetchAndSave(url.trim())}
            disabled={!url.trim()}
            className="px-3 py-1.5 text-xs font-medium bg-hf-text text-hf-bg rounded hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
          >
            Thêm
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-hf-text-faint">
        {phase === "fetching" && "Đang đọc metadata bài báo..."}
        {phase === "submitting" && "Đang lưu..."}
        {(phase === "idle" || phase === "fallback") &&
          "Dán URL vào ô trên rồi nhấn Enter. Metadata tự lấy từ bài báo."}
      </p>

      {/* Fallback title-only input khi OG fail */}
      {phase === "fallback" && (
        <div className="mt-3 pt-3 border-t border-hf-border">
          <label className="block text-xs font-medium text-hf-text-muted mb-1">
            Tiêu đề bài báo <span className="text-hf-red">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={fallbackTitle}
              onChange={(e) => setFallbackTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập tiêu đề bài báo..."
              autoFocus
              className="flex-1 px-3 py-1.5 text-sm border border-hf-border-strong rounded bg-hf-bg text-hf-text placeholder:text-hf-text-faint focus:outline-none focus:border-hf-link"
            />
            <button
              type="button"
              onClick={() =>
                fallbackTitle.trim() &&
                void commitArticle({
                  url: url.trim(),
                  title: fallbackTitle.trim(),
                  author: cachedOg?.author,
                  published_at: cachedOg?.published_at?.slice(0, 10),
                  section: cachedOg?.section,
                  thumbnail: cachedOg?.thumbnail,
                })
              }
              disabled={!fallbackTitle.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-hf-text text-hf-bg rounded hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
            >
              Lưu
            </button>
          </div>
          <p className="mt-1 text-[11px] text-hf-text-faint">
            Chỉ tiêu đề là bắt buộc. Author/ngày/chuyên mục sẽ trống nếu không đọc được.
          </p>
        </div>
      )}
    </div>
  );
}
