"use client";

/**
 * CatalogNav — top navigation bar, extracted từ server component page.tsx.
 *
 * Lý do tách ra client component (D7): input search tương tác không đặt được
 * trong server component. Nav cũng duplicate ở detail page — consolidate.
 *
 * Query state sống ở DatasetExplorer (parent), pass xuống qua prop.
 * Không dùng React Context (D1 — over-engineering cho 2 input trong cùng cây).
 */

import Link from "next/link";
import SearchBox from "@/components/search/SearchBox";

interface CatalogNavProps {
  /** Query text hiện tại — controlled input. Optional: omit trên detail page (chỉ nav + upload). */
  query?: string;
  /** Callback khi user type vào search input. Bắt buộc nếu `query` provided. */
  onQueryChange?: (q: string) => void;
}

export default function CatalogNav({ query, onQueryChange }: CatalogNavProps) {
  const showSearch = query !== undefined && onQueryChange !== undefined;
  return (
    <nav className="bg-hf-bg border-b border-hf-border h-[52px] px-4 flex items-center gap-6 sticky top-0 z-50">
      {/* Logo */}
      <Link
        href="/"
        className="flex items-center gap-2 font-bold text-[15px] text-hf-text shrink-0"
      >
        <span className="text-[22px]">🤗</span>
        <span>VNExpress Data</span>
      </Link>

      {/* Nav links */}
      <div className="flex gap-5 flex-1 text-sm">
        <Link href="/" className="font-semibold text-hf-text">
          Datasets
        </Link>
        <span className="text-hf-text-muted hover:text-hf-text cursor-pointer">Spaces</span>
        <span className="text-hf-text-muted hover:text-hf-text cursor-pointer">Tasks</span>
        <span className="text-hf-text-muted hover:text-hf-text cursor-pointer">Community</span>
      </div>

      {/* Top-nav search input — cùng state với sidebar input (chỉ render khi có query prop) */}
      {showSearch && (
        <div className="w-[240px]">
          <SearchBox query={query} onQueryChange={onQueryChange} placeholder="Search VNExpress data…" />
        </div>
      )}

      {/* Upload button */}
      <Link
        href="/upload"
        className="bg-hf-yellow text-hf-text px-3 py-1.5 rounded-md text-[13px] font-medium hover:bg-hf-yellow/80 transition shrink-0"
      >
        + Upload dataset
      </Link>
    </nav>
  );
}
