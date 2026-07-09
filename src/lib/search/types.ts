/**
 * Search adapter types — forward-compatible interface cho catalog search.
 *
 * Phase 1 dùng SimpleFilterAdapter (filter mảng dataset đã load, metadata-only).
 * Phase sau swap sang FlexsearchAdapter / PagefindAdapter — chỉ cần implement
 * cùng interface này, đổi 1 dòng trong createSearchAdapter().
 *
 * Xem specs/2026-07-09-phase-1-completion/requirements.md decision D1.
 */

import type { Dataset } from "@/lib/types/dataset";

/** Query text + bộ lọc facet (category/tags/sizes) — AND logic */
export interface SearchQuery {
  text: string;
  filters?: {
    categories?: string[];
    tags?: string[];
    sizes?: string[];
  };
}

/** Kết quả search 1 dataset — kèm score và fields match để highlight/debug */
export interface SearchResult {
  dataset: Dataset;
  score: number;
  matchedFields: string[];
}

/** Khai báo năng lực adapter — UI có thể render hint phù hợp */
export type SearchCapabilities = {
  /** Full-text search trên metadata fields (title, description, tags...) */
  fullText: boolean;
  /** Search trong data_dictionary (column names, labels) */
  dictionary: boolean;
  /** Fuzzy matching (typo tolerance) */
  fuzzy: boolean;
};

/**
 * Adapter interface — mọi search engine implement 3 method này.
 *
 * Lifecycle: index(datasets) gọi 1 lần khi data load → search(query) gọi mỗi keystroke.
 */
export interface SearchAdapter {
  /** Index mảng dataset — gọi khi data thay đổi */
  index(datasets: Dataset[]): void;
  /** Search theo query — return sorted results (score desc) */
  search(query: SearchQuery): SearchResult[];
  /** Khai báo năng lực adapter */
  capabilities: SearchCapabilities;
}
