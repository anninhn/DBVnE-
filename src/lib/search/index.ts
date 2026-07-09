/**
 * Search adapter factory — điểm duy nhất để swap adapter implementation.
 *
 * Phase 1: SimpleFilterAdapter (in-memory filter + scoring)
 * Phase sau: đổi return new FlexsearchAdapter() — UI code không đổi.
 *
 * Xem specs/2026-07-09-phase-1-completion/requirements.md decision D1.
 */

import { SimpleFilterAdapter } from "./simple-filter";
import type { SearchAdapter } from "./types";

/**
 * Tạo search adapter instance.
 * Phase sau đổi 1 dòng: return new FlexsearchAdapter();
 */
export function createSearchAdapter(): SearchAdapter {
  return new SimpleFilterAdapter();
}

export type { SearchAdapter, SearchQuery, SearchResult, SearchCapabilities } from "./types";
