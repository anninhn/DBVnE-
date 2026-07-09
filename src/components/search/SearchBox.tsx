/**
 * SearchBox — presentational search input component.
 *
 * Pure UI, không có state riêng. Nhận query + onQueryChange qua props
 * từ DatasetExplorer (lifted state, prop drilling — không dùng Context).
 *
 * Dùng ở 2 nơi: top-nav (CatalogNav) + sidebar (DatasetExplorer).
 * Cùng state vì cùng prop source.
 */

interface SearchBoxProps {
  /** Giá trị input hiện tại */
  query: string;
  /** Callback khi user type — update state ở parent */
  onQueryChange: (q: string) => void;
  /** Placeholder text — khác nhau giữa top-nav và sidebar */
  placeholder?: string;
}

export default function SearchBox({
  query,
  onQueryChange,
  placeholder = "Search datasets…",
}: SearchBoxProps) {
  return (
    <div className="relative">
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
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 text-sm border border-hf-border rounded-md bg-hf-bg focus:outline-none focus:border-hf-yellow focus:ring-2 focus:ring-hf-yellow-50 text-hf-text"
      />
    </div>
  );
}
