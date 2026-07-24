/**
 * Root loading.tsx — app shell fallback cho mọi route transition.
 *
 * Pattern: navbar mock (CSS-only, KHÔNG import Navbar client component)
 * + content-area spinner. Lý do:
 *   - User giữ context (nav active state, không "flash" disappear)
 *   - Tránh Suspense recursion (loading.tsx là fallback — import client
 *     component có hooks useSession/useRouter → loop). Memory feedback_loading_tsx_pure.
 *   - Navbar thật height 52px → mock match height tránh layout shift.
 *
 * Layout: sticky nav 52px + main flex-center calc(100vh - 52px).
 */
import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-screen">
      {/* Navbar mock — CSS-only, match CatalogNav layout */}
      <nav className="bg-hf-bg border-b border-hf-border h-[52px] px-4 flex items-center gap-6 sticky top-0 z-50">
        <div className="flex items-center gap-2 font-bold text-[15px] text-hf-text shrink-0">
          <span className="text-hf-yellow">●</span>
          VnExpress Data
        </div>
        {/* Nav links placeholder — gray bars */}
        <div className="flex gap-5 shrink-0 items-center">
          {[48, 64, 72].map((w, i) => (
            <div
              key={i}
              className="h-3 bg-hf-bg-muted rounded-sm"
              style={{ width: `${w}px` }}
            />
          ))}
        </div>
        {/* Right side placeholder */}
        <div className="flex-1 flex justify-end">
          <div className="h-7 w-24 bg-hf-bg-muted rounded-md" />
        </div>
      </nav>

      {/* Content area spinner */}
      <main
        className="flex items-center justify-center text-hf-text-muted text-sm gap-2"
        style={{ minHeight: "calc(100vh - 52px)" }}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        Đang tải...
      </main>
    </div>
  );
}
