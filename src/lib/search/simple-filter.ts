/**
 * SimpleFilterAdapter — Phase 1 adapter, filter + score mảng dataset trong memory.
 *
 * Không dùng external search engine. Match text trên metadata fields với scoring:
 * title 10 / slug 5 / tags 3 (per tag) / description 2 / category 2.
 *
 * Token-based AND match: query "thu tuc" → tokens ["thu","tuc"] — cả 2 phải match
 * somewhere (bất kể field nào). Chấp nhận space, hyphen, diacritics mismatch.
 *
 * Phase sau: swap sang FlexsearchAdapter (cùng interface, không đổi UI code).
 */

import type { Dataset } from "@/lib/types/dataset";
import type { SearchAdapter, SearchCapabilities, SearchQuery, SearchResult } from "./types";

/**
 * Nhóm quy mô dataset theo số dòng — dùng cho filter facet "Quy mô".
 * NGUỒN SỰ THẬT DUY NHẤT cho nhóm kích thước — sidebar import `SIZE_BUCKETS`
 * thay vì hardcode nhãn riêng.
 *
 * Trước 2026-08-24 chỉ có 3 bậc, bậc cuối ghi nhãn "10K–100K" nhưng nhận MỌI
 * dataset ≥10.000 dòng — `diem-thi-tot-nghiep` 6.443.905 dòng vẫn mang nhãn đó.
 * Spec 001 FR-026 chốt tách thành 5 bậc để nhãn nói đúng nội dung.
 */
export const SIZE_BUCKETS = [
  "< 1K",
  "1K–10K",
  "10K–100K",
  "100K–1M",
  "> 1M",
] as const;

function sizeBucket(rowCount: number): string {
  if (rowCount < 1_000) return "< 1K";
  if (rowCount < 10_000) return "1K–10K";
  if (rowCount < 100_000) return "10K–100K";
  if (rowCount < 1_000_000) return "100K–1M";
  return "> 1M";
}

/**
 * Normalize text cho search: lowercase + strip diacritics + đ→d.
 * "Thủ tục" → "thu tuc". Slug đã normalize sẵn nhưng gọi lại cho safe.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
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
    const tokens = this.tokenize(query.text);

    // Bước 1: Lọc theo facet filters (category/tags/sizes) — AND logic
    let candidates = this.datasets;
    if (query.filters) {
      candidates = candidates.filter((d) => this.matchesFilters(d, query.filters!));
    }

    // Bước 2: Không có query text → trả tất cả candidates (score 0)
    if (tokens.length === 0) {
      return candidates.map((dataset) => ({
        dataset,
        score: 0,
        matchedFields: [],
      }));
    }

    // Bước 3: Score + filter — ALL tokens phải match (AND semantics)
    const scored: SearchResult[] = [];
    for (const d of candidates) {
      const fields = this.findMatchedFields(d, tokens);
      if (fields.size === 0) continue;

      // AND: mỗi token phải match ít nhất 1 field
      const allTokensMatch = tokens.every((tok) => this.tokenMatchesSomeField(d, tok));
      if (!allTokensMatch) continue;

      scored.push({
        dataset: d,
        score: this.scoreMatch(d, tokens),
        matchedFields: Array.from(fields),
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  /** Split query thành tokens — lowercase, strip diacritics, split theo space/hyphen */
  private tokenize(text: string): string[] {
    return normalize(text)
      .split(/[\s-]+/)
      .filter((t) => t.length > 0);
  }

  /**
   * Check xem 1 token có match bất kỳ field nào của dataset không.
   */
  private tokenMatchesSomeField(d: Dataset, token: string): boolean {
    if (normalize(d.title).includes(token)) return true;
    if (normalize(d.slug).includes(token)) return true;
    if (normalize(d.description).includes(token)) return true;
    if (normalize(d.category).includes(token)) return true;
    return d.tags.some((t) => normalize(t).includes(token));
  }

  /**
   * Tính tổng điểm — cộng điểm từ mỗi token trên mỗi field match.
   * Title (10/token) > slug (5) > tag (3/tag) > description (2) > category (2).
   */
  private scoreMatch(d: Dataset, tokens: string[]): number {
    let score = 0;
    const title = normalize(d.title);
    const slug = normalize(d.slug);
    const desc = normalize(d.description);
    const cat = normalize(d.category);
    const tags = d.tags.map(normalize);

    for (const tok of tokens) {
      if (title.includes(tok)) score += SCORE_WEIGHTS.title;
      if (slug.includes(tok)) score += SCORE_WEIGHTS.slug;
      if (desc.includes(tok)) score += SCORE_WEIGHTS.description;
      if (cat.includes(tok)) score += SCORE_WEIGHTS.category;
      for (const t of tags) {
        if (t.includes(tok)) score += SCORE_WEIGHTS.tag;
      }
    }
    return score;
  }

  /** Tập hợp field names match ít nhất 1 token — dùng cho debug/future highlight */
  private findMatchedFields(d: Dataset, tokens: string[]): Set<string> {
    const fields = new Set<string>();
    const title = normalize(d.title);
    const slug = normalize(d.slug);
    const desc = normalize(d.description);
    const cat = normalize(d.category);

    for (const tok of tokens) {
      if (title.includes(tok)) fields.add("title");
      if (slug.includes(tok)) fields.add("slug");
      if (desc.includes(tok)) fields.add("description");
      if (cat.includes(tok)) fields.add("category");
      if (d.tags.some((t) => normalize(t).includes(tok))) fields.add("tags");
    }
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
