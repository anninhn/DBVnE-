"use client";

/**
 * CatalogNav — top navigation bar.
 *
 * Search box luôn hiển thị:
 * - Listing page (controlled): pass query + onQueryChange → live filter.
 * - Detail page (navigate): không pass props → Enter điều hướng về /?q=query.
 *   Listing đọc ?q từ URL để pre-fill (useEffect trong DatasetExplorer).
 *
 * Auth: nếu session tồn tại → hiển thị UserMenu (displayName + logout).
 * Nếu không → ẩn (browse công khai). Spec plan task 10.
 */

import { useState, memo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Upload, LogIn } from "lucide-react";
import SearchBox from "@/components/search/SearchBox";
import UserMenu from "@/components/auth/UserMenu";

interface CatalogNavProps {
  /** Query text hiện tại — controlled input. Optional: omit trên detail page. */
  query?: string;
  /** Callback khi user type. Bắt buộc nếu `query` provided. */
  onQueryChange?: (q: string) => void;
}

/**
 * CatalogNav — memoized vì parent (DatasetExplorer) re-render khi sort/filter/page
 * change, nhưng nav không phụ thuộc những state đó. Tránh re-render SearchBox +
 * useSession (đắt) mỗi lần user toggle filter.
 */
function CatalogNavImpl({ query, onQueryChange }: CatalogNavProps) {
  const isControlled = query !== undefined && onQueryChange !== undefined;
  const [localQuery, setLocalQuery] = useState("");
  const router = useRouter();
  const { data: session } = useSession();

  const user = session?.user as
    | { displayName?: string; username?: string }
    | undefined;

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

      {/* Nav links — Phase 1 chỉ có Datasets functional.
          Ask Me Anything là placeholder cho Phase 2 (Discovery Chat) + Phase 3 (Intelligence Q&A). */}
      <div className="flex gap-5 text-sm shrink-0 items-center">
        <Link href="/" className="font-semibold text-hf-text">
          Datasets
        </Link>
        <span
          className="inline-flex items-center gap-1.5 text-hf-text-faint cursor-not-allowed"
          title="Sẵn có ở Phase 2+ — Discovery Chat + Q&A"
        >
          Ask Me Anything
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-hf-bg-muted text-hf-text-faint font-medium uppercase tracking-wide">
            Coming soon
          </span>
        </span>
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
        className="bg-hf-yellow text-hf-text px-3 py-1.5 rounded-md text-[13px] font-medium hover:bg-hf-yellow/80 transition shrink-0 inline-flex items-center gap-1.5"
      >
        <Upload className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />
        Upload dataset
      </Link>

      {/* Auth: UserMenu nếu login, không thì link "Đăng nhập" subtle */}
      {user?.displayName && user?.username ? (
        <UserMenu displayName={user.displayName} username={user.username} />
      ) : (
        <Link
          href="/login"
          className="text-sm text-hf-text-muted hover:text-hf-text shrink-0 inline-flex items-center gap-1"
        >
          <LogIn className="w-3.5 h-3.5" aria-hidden />
          Đăng nhập
        </Link>
      )}
    </nav>
  );
}

const CatalogNav = memo(CatalogNavImpl);
export default CatalogNav;
