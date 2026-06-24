"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Category, Dataset } from "@/lib/types/dataset";
import { CATEGORY_LABELS } from "@/lib/types/dataset";

type SortKey = "trending" | "recent" | "downloaded" | "liked";

const SORT_LABELS: Record<SortKey, string> = {
  trending: "Trending",
  recent: "Recently updated",
  downloaded: "Most downloaded",
  liked: "Most liked",
};

const ALL_CATEGORIES: Category[] = ["kinh-te", "xa-hoi", "chinh-tri", "khi-hau", "ha-tang"];

interface DatasetExplorerProps {
  datasets: Dataset[];
}

/** Quy mô → nhóm size (HF style) */
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

  const filtered = useMemo(() => {
    let result = datasets;

    if (activeCategories.size > 0) {
      result = result.filter((d) => activeCategories.has(d.category));
    }
    if (activeTags.size > 0) {
      result = result.filter((d) => d.tags.some((t) => activeTags.has(t)));
    }
    if (activeSizes.size > 0) {
      result = result.filter((d) => activeSizes.has(sizeBucket(d.row_count)));
    }

    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.slug.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    const sorted = [...result];
    switch (sort) {
      case "recent":
        sorted.sort((a, b) => +new Date(b.uploaded_at) - +new Date(a.uploaded_at));
        break;
      case "downloaded":
        sorted.sort((a, b) => b.downloads - a.downloads);
        break;
      case "liked":
        sorted.sort((a, b) => b.likes - a.likes);
        break;
      case "trending":
      default:
        // Trending = blend downloads + likes
        sorted.sort((a, b) => b.downloads + b.likes * 2 - (a.downloads + a.likes * 2));
        break;
    }
    return sorted;
  }, [datasets, query, activeCategories, activeTags, activeSizes, sort]);

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
    <div className="max-w-[1280px] mx-auto bg-hf-bg min-h-[calc(100vh-52px)] grid grid-cols-[256px_1fr]">
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
              {filtered.length} results
            </span>
          </h1>
        </div>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-hf-text-faint"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search datasets…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-hf-border rounded-md focus:outline-none focus:border-hf-yellow focus:ring-2 focus:ring-hf-yellow-50"
            />
          </div>
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

        {/* Dataset rows — compact, HF style */}
        {filtered.length > 0 ? (
          <div className="border-t border-hf-border">
            {filtered.map((d) => {
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
                    {d.row_count.toLocaleString("vi-VN")} rows
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
      </main>
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
