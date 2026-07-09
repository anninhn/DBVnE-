/**
 * SimpleFilterAdapter — Phase 1 adapter, filter + score mảng dataset trong memory.
 *
 * Không dùng external search engine. Match text trên metadata fields với scoring:
 * title 10 / slug 5 / tags 3 (per tag) / description 2 / category 2.
 *
 * Phase sau: swap sang FlexsearchAdapter (cùng interface, không đổi UI code).
 */

import type { Dataset } from "@/lib/types/dataset";
import type { SearchAdapter, SearchCapabilities, SearchQuery, SearchResult } from "./types";

/**
 * Nhóm quy mô dataset theo số dòng — dùng cho filter facet "Quy mô".
 * Phải khớp với sizeBucket() trong DatasetExplorer (sẽ refactor共用).
 */
function sizeBucket(rowCount: number): string {
  if (rowCount < 1000) return "< 1K";
  if (rowCount < 10000) return "1K–10K";
  return "10K–100K";
}

/** Điểm weight cho mỗi field khi match query text */
const SCORE_WEIGHTS = {
  title: 10,
  slug: 5,
  tag: 3,
  description: 2,
  category: 2,
} as const;

export class SimpleFilterAdapter implements SearchAdapter {
  /** Datasets đã index — lưu reference trực tiếp (không clone) */
  private datasets: Dataset[] = [];

  readonly capabilities: SearchCapabilities = {
    fullText: true,
    dictionary: false,
    fuzzy: false,
  };

  index(datasets: Dataset[]): void {
    this.datasets = datasets;
  }

  search(query: SearchQuery): SearchResult[] {
    const q = query.text.trim().toLowerCase();

    // Bước 1: Lọc theo facet filters (category/tags/sizes) — AND logic
    let candidates = this.datasets;
    if (query.filters) {
      candidates = candidates.filter((d) => this.matchesFilters(d, query.filters!));
    }

    // Bước 2: Nếu có query text → score + filter, ngược lại trả tất cả (score 0)
    if (!q) {
      return candidates.map((dataset) => ({
        dataset,
        score: 0,
        matchedFields: [],
      }));
    }

    const scored: SearchResult[] = [];
    for (const d of candidates) {
      const score = this.scoreMatch(d, q);
      if (score > 0) {
        scored.push({
          dataset: d,
          score,
          matchedFields: this.findMatchedFields(d, q),
        });
      }
    }

    // Sắp xếp theo score giảm dần
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  /**
   * Tính điểm match — tổng điểm từ tất cả fields.
   * Title match (10) > slug (5) > tag (3/tag) > description (2) > category (2).
   */
  private scoreMatch(d: Dataset, q: string): number {
    let score = 0;

    if (d.title.toLowerCase().includes(q)) score += SCORE_WEIGHTS.title;
    if (d.slug.toLowerCase().includes(q)) score += SCORE_WEIGHTS.slug;
    if (d.description.toLowerCase().includes(q)) score += SCORE_WEIGHTS.description;
    if (d.category.toLowerCase().includes(q)) score += SCORE_WEIGHTS.category;

    // Mỗi tag match cộng điểm riêng
    for (const tag of d.tags) {
      if (tag.toLowerCase().includes(q)) score += SCORE_WEIGHTS.tag;
    }

    return score;
  }

  /** Trả về danh sách field names match query — dùng cho debug/future highlight */
  private findMatchedFields(d: Dataset, q: string): string[] {
    const fields: string[] = [];
    if (d.title.toLowerCase().includes(q)) fields.push("title");
    if (d.slug.toLowerCase().includes(q)) fields.push("slug");
    if (d.description.toLowerCase().includes(q)) fields.push("description");
    if (d.category.toLowerCase().includes(q)) fields.push("category");
    if (d.tags.some((t) => t.toLowerCase().includes(q))) fields.push("tags");
    return fields;
  }

  /** AND logic — dataset phải match tất cả facet filters đang active */
  private matchesFilters(
    d: Dataset,
    filters: NonNullable<SearchQuery["filters"]>
  ): boolean {
    if (filters.categories && filters.categories.length > 0) {
      if (!filters.categories.includes(d.category)) return false;
    }
    if (filters.tags && filters.tags.length > 0) {
      if (!d.tags.some((t) => filters.tags!.includes(t))) return false;
    }
    if (filters.sizes && filters.sizes.length > 0) {
      if (!filters.sizes.includes(sizeBucket(d.row_count))) return false;
    }
    return true;
  }
}
