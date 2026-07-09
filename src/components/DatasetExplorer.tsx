"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Category, Dataset } from "@/lib/types/dataset";
import { CATEGORY_LABELS } from "@/lib/types/dataset";
import { createSearchAdapter } from "@/lib/search";
import type { SearchAdapter } from "@/lib/search";
import CatalogNav from "@/components/CatalogNav";

type SortKey = "trending" | "recent" | "downloaded" | "liked";

const SORT_LABELS: Record<SortKey, string> = {
  trending: "Trending",
  recent: "Recently updated",
  downloaded: "Most downloaded",
  liked: "Most liked",
};

const ALL_CATEGORIES: Category[] = ["kinh-te", "xa-hoi", "chinh-tri", "khi-hau", "ha-tang"];

/** Số dataset hiển thị mỗi trang — HF standard */
const PAGE_SIZE = 20;

interface DatasetExplorerProps {
  datasets: Dataset[];
}

/** Quy mô → nhóm size (HF style) — khớp với sizeBucket trong SimpleFilterAdapter */
function sizeBucket(rowCount: number): string {
  if (rowCount < 1000) return "< 1K";
  if (rowCount < 10000) return "1K–10K";
  return "10K–100K";
}

export default function DatasetExplorer({ datasets }: DatasetExplorerProps) {
  const [query, setQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(new Set());
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [activeSizes, setActiveSizes] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("trending");
  const [page, setPage] = useState(0);

  // Search adapter — tạo 1 lần. Index ngay trong results useMemo (O(1) assignment,
  // idempotent) thay vì useEffect — effect chạy sau render + không trigger re-render
  // nên SSR/first-render listing bị rỗng (adapter chưa index kịp).
  const adapter: SearchAdapter = useMemo(() => createSearchAdapter(), []);

  // Vocab từ dữ liệu
  const allTags = useMemo(() => {
    const set = new Set<string>();
    datasets.forEach((d) => d.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [datasets]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    datasets.forEach((d) => {
      counts[d.category] = (counts[d.category] ?? 0) + 1;
    });
    return counts;
  }, [datasets]);

  // Search qua adapter — index trước khi search để results đúng ở first render.
  const results = useMemo(() => {
    adapter.index(datasets);
    const searchResults = adapter.search({
      text: query,
      filters: {
        categories: Array.from(activeCategories),
        tags: Array.from(activeTags),
        sizes: Array.from(activeSizes),
      },
    });
    return searchResults.map((r) => r.dataset);
  }, [adapter, datasets, query, activeCategories, activeTags, activeSizes]);

  // Sort kết quả search — tách riêng khỏi adapter (sort không phải search concern)
  const sorted = useMemo(() => {
    const arr = [...results];
    switch (sort) {
      case "recent":
        arr.sort((a, b) => +new Date(b.uploaded_at) - +new Date(a.uploaded_at));
        break;
      case "downloaded":
        arr.sort((a, b) => b.downloads - a.downloads);
        break;
      case "liked":
        arr.sort((a, b) => b.likes - a.likes);
        break;
      case "trending":
      default:
        // Trending = blend downloads + likes
        arr.sort((a, b) => b.downloads + b.likes * 2 - (a.downloads + a.likes * 2));
        break;
    }
    return arr;
  }, [results, sort]);

  // Pre-fill query từ URL param (khi navigate từ detail page search).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) setQuery(q);
  }, []);

  // Reset page về 1 khi search/filter/sort thay đổi
  useEffect(() => {
    setPage(0);
  }, [query, activeCategories, activeTags, activeSizes, sort]);

  // Pagination — slice kết quả đã sort
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paginatedResults = sorted.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );
  const rangeStart = sorted.length > 0 ? currentPage * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min((currentPage + 1) * PAGE_SIZE, sorted.length);

  const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>) => (value: T) => {
    setter((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  };

  const toggleCategory = toggle(setActiveCategories);
  const toggleTag = toggle(setActiveTags);
  const toggleSize = toggle(setActiveSizes);

  const clearFilters = () => {
    setActiveCategories(new Set());
    setActiveTags(new Set());
    setActiveSizes(new Set());
    setQuery("");
  };

  const hasActiveFilter =
    query !== "" || activeCategories.size > 0 || activeTags.size > 0 || activeSizes.size > 0;

  return (
    <div className="min-h-screen flex flex-col">
      {/* ─── Top nav — CatalogNav client component (D7) ─── */}
      <CatalogNav query={query} onQueryChange={setQuery} />

      <div className="flex-1 max-w-[1280px] w-full mx-auto bg-hf-bg grid grid-cols-[256px_1fr]">
        {/* ─── Sidebar filters ─── */}
        <aside className="border-r border-hf-border p-4">
          <FilterGroup title="Lĩnh vực">
            {ALL_CATEGORIES.map((c) => (
              <FilterCheckbox
                key={c}
                label={CATEGORY_LABELS[c]}
                count={categoryCounts[c] ?? 0}
                checked={activeCategories.has(c)}
                onChange={() => toggleCategory(c)}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Quy mô (dòng)">
            {["< 1K", "1K–10K", "10K–100K"].map((s) => (
              <FilterCheckbox
                key={s}
                label={s}
                checked={activeSizes.has(s)}
                onChange={() => toggleSize(s)}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Định dạng">
            {["csv", "xlsx", "parquet", "pdf"].map((f) => (
              <FilterCheckbox key={f} label={f} checked={false} onChange={() => {}} />
            ))}
          </FilterGroup>

          <FilterGroup title="Tags">
            {allTags.map((t) => (
              <FilterCheckbox
                key={t}
                label={t}
                checked={activeTags.has(t)}
                onChange={() => toggleTag(t)}
              />
            ))}
          </FilterGroup>

          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="text-xs text-hf-red hover:underline mt-2"
            >
              Xóa bộ lọc
            </button>
          )}
        </aside>

        {/* ─── Main listing ─── */}
        <main className="p-4 px-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-lg font-semibold text-hf-text">
              Datasets{" "}
              <span className="text-hf-text-faint font-normal text-sm">
                {sorted.length} results
              </span>
            </h1>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="px-3 py-2 text-sm border border-hf-border rounded-md bg-hf-bg focus:outline-none focus:border-hf-yellow focus:ring-2 focus:ring-hf-yellow-50"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABELS[k]}</option>
              ))}
            </select>
          </div>

          {/* Metadata line — HF style "Hiển thị X–Y trong Z datasets" */}
          {sorted.length > 0 && (
            <div className="text-[13px] text-hf-text-muted mb-3">
              Hiển thị {rangeStart}–{rangeEnd} trong {sorted.length} datasets
            </div>
          )}

          {/* Dataset rows — compact, HF style */}
          {paginatedResults.length > 0 ? (
            <div className="border-t border-hf-border">
              {paginatedResults.map((d) => {
                const hasData = d.resources.some(
                  (r) => r.structured_data && r.structured_data.length > 0
                );
                return (
                  <Link
                    key={d.slug}
                    href={`/datasets/${d.slug}`}
                    className="flex items-center gap-2 px-2 py-2.5 border-b border-hf-border text-[13px] hover:bg-hf-bg-subtle transition-colors"
                  >
                    <span className="font-medium text-hf-text">
                      <span className="text-hf-text-muted">{d.uploaded_by.toLowerCase()}/</span>
                      {d.slug}
                    </span>
                    <span
                      className={`inline-block px-2 py-px rounded-full text-[11px] font-medium ${
                        hasData
                          ? "bg-blue-100 text-blue-800"
                          : "bg-hf-bg-muted text-hf-text-muted"
                      }`}
                    >
                      {hasData ? "Viewer" : "Preview"}
                    </span>
                    <span className="text-hf-text-muted">
                      Updated {new Date(d.uploaded_at).toLocaleDateString("vi-VN", { month: "short", day: "numeric" })}
                      <span className="text-hf-text-faint mx-1">•</span>
                      {d.row_count > 0 ? `${d.row_count.toLocaleString("vi-VN")} rows` : "—"}
                      <span className="text-hf-text-faint mx-1">•</span>
                      {d.file_count} file{d.file_count !== 1 ? "s" : ""}
                      <span className="text-hf-text-faint mx-1">•</span>
                      {d.total_size_mb} MB
                    </span>
                    <span className="ml-auto text-hf-text-muted flex items-center gap-1">
                      ★ {d.likes}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20 text-hf-text-faint">
              <p className="text-sm">Không tìm thấy dataset phù hợp.</p>
              {hasActiveFilter && (
                <button
                  onClick={clearFilters}
                  className="mt-2 text-sm text-hf-red hover:underline"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          )}

          {/* Pagination — reuse pattern từ DatasetViewer.tsx */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-1 py-4">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="px-2.5 py-1 text-[13px] text-hf-text-muted rounded hover:bg-hf-bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ‹ Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`min-w-[32px] px-2 py-1 text-[13px] rounded ${
                    i === currentPage
                      ? "bg-hf-text text-white font-medium"
                      : "text-hf-text-muted hover:bg-hf-bg-muted"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="px-2.5 py-1 text-[13px] text-hf-text-muted rounded hover:bg-hf-bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next ›
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold text-hf-text mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FilterCheckbox({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 py-1 text-[13px] text-hf-text cursor-pointer hover:text-hf-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-3.5 h-3.5 accent-[var(--color-hf-yellow)]"
      />
      {label}
      {count !== undefined && (
        <span className="ml-auto text-xs text-hf-text-faint">{count}</span>
      )}
    </label>
  );
}
