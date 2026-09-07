/**
 * Search adapter factory — điểm duy nhất để swap adapter implementation.
 *
 * Hiện dùng `MiniSearchAdapter` (inverted index + BM25). Trước 2026-09-04 là
 * `SimpleFilterAdapter`, thứ mà spec Phase 1 quyết định D1 gọi là chỗ giữ chân
 * cho tới "khi catalog lớn" — điều kiện đó đã tới ở 493 dataset, và adapter thật
 * chưa bao giờ được viết. Xem chú thích đầu `minisearch-adapter.ts` để biết đo
 * được gì.
 *
 * `SimpleFilterAdapter` GIỮ LẠI, không xoá: `SIZE_BUCKETS` trong đó là nguồn sự
 * thật duy nhất cho nhóm kích thước và sidebar đang import từ đấy.
 */

import { MiniSearchAdapter } from "./minisearch-adapter";
import type { SearchAdapter } from "./types";

export function createSearchAdapter(): SearchAdapter {
  return new MiniSearchAdapter();
}

export type { SearchAdapter, SearchQuery, SearchResult, SearchCapabilities } from "./types";
