"use client";

/**
 * CatalogNav — top navigation bar.
 *
 * Search box luôn hiển thị:
 * - Listing page (controlled): pass query + onQueryChange → live filter.
 * - Detail page (navigate): không pass props → Enter điều hướng về /?q=query.
 *   Listing đọc ?q từ URL để pre-fill (useEffect trong DatasetExplorer).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SearchBox from "@/components/search/SearchBox";

interface CatalogNavProps {
  /** Query text hiện tại — controlled input. Optional: omit trên detail page. */
  query?: string;
  /** Callback khi user type. Bắt buộc nếu `query` provided. */
  onQueryChange?: (q: string) => void;
}

export default function CatalogNav({ query, onQueryChange }: CatalogNavProps) {
  const isControlled = query !== undefined && onQueryChange !== undefined;
  const [localQuery, setLocalQuery] = useState("");
  const router = useRouter();

  return (
    <nav className="bg-hf-bg border-b border-hf-border h-[52px] px-4 flex items-center gap-6 sticky top-0 z-50">
      {/* Logo */}
      <Link
        href="/"
        className="flex items-center gap-2 font-bold text-[15px] text-hf-text shrink-0"
      >
        <span className="text-[22px]">🤗</span>
        <span>VnExpress Data</span>
      </Link>

      {/* Nav links */}
      <div className="flex gap-5 text-sm shrink-0">
        <Link href="/" className="font-semibold text-hf-text">
          Datasets
        </Link>
        <span className="text-hf-text-muted hover:text-hf-text cursor-pointer">Spaces</span>
        <span className="text-hf-text-muted hover:text-hf-text cursor-pointer">Tasks</span>
        <span className="text-hf-text-muted hover:text-hf-text cursor-pointer">Community</span>
      </div>

      {/* Search — luôn hiển thị. Listing: controlled (live). Detail: Enter → navigate. */}
      {isControlled ? (
        <div className="flex-1">
          <SearchBox
            query={query!}
            onQueryChange={onQueryChange!}
            placeholder="Search VnExpress data…"
          />
        </div>
      ) : (
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(
              localQuery.trim()
                ? `/?q=${encodeURIComponent(localQuery.trim())}`
                : "/",
            );
          }}
        >
          <SearchBox
            query={localQuery}
            onQueryChange={setLocalQuery}
            placeholder="Search VnExpress data…"
          />
        </form>
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
