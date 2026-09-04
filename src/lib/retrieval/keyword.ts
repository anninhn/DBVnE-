/**
 * Nhánh khớp từ khoá — bắt tên riêng chính xác, thứ mà vector không bắt được.
 *
 * Vì sao không dùng lại `SimpleFilterAdapter` (R5): nó dùng **AND**, mọi token phải
 * khớp. Đúng cho ô search trên trang danh mục — người gõ từ khoá thì mong tất cả từ
 * đều khớp — nhưng sai hoàn toàn cho câu hỏi tự nhiên: "có dữ liệu nào về lạm phát
 * không" tách thành 8 token gồm `co`, `nao`, `khong` → không dataset nào khớp đủ →
 * trả rỗng. Nên viết mới, và **dùng lại đúng hàm chuẩn hoá** của nó qua
 * `normalize.ts` để hai chỗ không lệch nhau.
 *
 * Vì sao vẫn cần nhánh này khi đã có vector: hỏi "Đà Nẵng" mà vector trả về dataset
 * "gần nghĩa" (Quảng Nam, Huế) thì sai hẳn. Tên riêng và mã ngành là khớp đúng/sai,
 * không phải chuyện tương đồng (FR-031).
 */

import { tokenize } from "./normalize";
import type { RetrievalIndex } from "./types";

export interface KeywordHit {
  slug: string;
  /** Số token của câu hỏi khớp được, có cân theo độ hiếm của token */
  score: number;
}

/**
 * Tính điểm theo tần suất token, cân theo độ hiếm của token trong cả kho.
 *
 * Không đếm trần số token khớp: token phổ biến như `viet` hay `nam` xuất hiện ở gần
 * như mọi dataset, đếm ngang với `lam phat` thì thứ tự bị quyết định bởi những từ
 * không mang thông tin. Cân theo độ hiếm (nghịch đảo số dataset chứa token) là cách
 * rẻ nhất để token đặc trưng thắng — cùng nguyên lý IDF nhưng không cần thư viện.
 */
export function rankByKeyword(
  index: RetrievalIndex,
  query: string,
): KeywordHit[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // Số dataset chứa mỗi token — tính từ chính chỉ mục, không cần lưu sẵn.
  const docFreq = new Map<string, number>();
  const entryTokens = index.entries.map((e) => {
    const set = new Set(e.keywords);
    for (const t of set) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
    return set;
  });

  const total = Math.max(1, index.entries.length);
  const hits: KeywordHit[] = [];

  for (let i = 0; i < index.entries.length; i++) {
    let score = 0;
    for (const t of queryTokens) {
      if (!entryTokens[i].has(t)) continue;
      const df = docFreq.get(t) ?? total;
      score += Math.log(1 + total / df);
    }
    if (score > 0) hits.push({ slug: index.entries[i].slug, score });
  }

  return hits.sort((a, b) => b.score - a.score);
}

/** Token đưa vào chỉ mục cho một dataset — tên + mô tả + tên cột. */
export function buildKeywords(input: {
  title: string;
  description?: string;
  columns?: string[];
}): string[] {
  const source = [input.title, input.description ?? "", ...(input.columns ?? [])]
    .join(" ");
  return [...new Set(tokenize(source))];
}
