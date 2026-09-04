/**
 * Trộn kết quả hai nhánh tìm kiếm thành một danh sách có thứ tự (R6).
 *
 * Hai nhánh cho điểm ở hai thang khác nhau: cosine nằm trong [0,1] còn điểm từ khoá
 * là tổng log không có trần. Cộng thẳng thì nhánh từ khoá lấn hoàn toàn — nên phải
 * chuẩn hoá mỗi nhánh về [0,1] trước.
 */

import type { SearchHit } from "./types";

/**
 * Trọng số hai nhánh — **đặt cố định 50/50** (T053).
 *
 * Không có bộ đo để hiệu chỉnh: người quyết định đã chốt bỏ US6 (không đo, không
 * user test). Nên đây là con số không có bằng chứng, và điều trung thực nhất là nói
 * ra như vậy chứ không giả vờ nó đã được tối ưu.
 *
 * Chỉnh tay thế nào: tăng `SEMANTIC_WEIGHT` nếu thấy câu hỏi diễn đạt vòng ("dữ
 * liệu về giá cả leo thang") không tìm ra dataset đúng tên khác ("Chỉ số giá tiêu
 * dùng"); tăng `KEYWORD_WEIGHT` nếu thấy hỏi đúng tên riêng ("Đà Nẵng") lại trả về
 * dataset gần nghĩa. Hai trọng số nên cộng lại bằng 1 để điểm cuối vẫn trong [0,1].
 */
const SEMANTIC_WEIGHT = 0.5;
const KEYWORD_WEIGHT = 0.5;

/**
 * Ngưỡng điểm tối thiểu để một dataset được trả về.
 *
 * **Chỉ lọc rác, KHÔNG phải chỗ quyết định "kho có dataset về chủ đề này hay không".**
 * Đây là điều chỉnh so với R6, dựa trên số đo trên chính kho 495 dataset:
 *
 *   câu có dataset thật    — cosine cao nhất 0,66–0,77
 *   câu không có gì liên quan — cosine cao nhất 0,46–0,62
 *   câu chỉ là một tên riêng  — `Đà Nẵng` 0,54 · `Bắc Kạn` 0,52
 *
 * Hai dòng cuối chồng lên nhau, và đó không phải chuyện chỉnh ngưỡng cho khéo: một
 * tên tỉnh đứng một mình KHÔNG giống bất kỳ tiêu đề dataset nào về mặt ngữ nghĩa,
 * nên nó rơi đúng vào vùng của câu hỏi vô quan. Đặt ngưỡng đủ cao để loại "giá
 * Bitcoin" (0,62) thì cũng loại luôn "Đà Nẵng" — tức là làm hỏng đúng câu hỏi quan
 * trọng nhất của cả spec.
 *
 * Nên việc kết luận "chưa có dataset" được giao cho hai chỗ khác, chỗ nào cũng có đủ
 * thông tin hơn một con số: `lookupValue` cho câu hỏi theo giá trị (đúng/sai tuyệt
 * đối, không phải tương đồng), và model đọc danh sách ứng viên kèm điểm rồi tự nói
 * "chưa có". Ngưỡng ở đây chỉ để `total` không phải lúc nào cũng bằng cả kho.
 */
const MIN_SCORE = 0.35;

export interface BranchHit {
  slug: string;
  score: number;
}

/** Đưa điểm của một nhánh về [0,1] theo điểm cao nhất của chính nhánh đó. */
function normalizeBranch(hits: BranchHit[]): Map<string, number> {
  const out = new Map<string, number>();
  if (hits.length === 0) return out;
  const max = Math.max(...hits.map((h) => h.score));
  if (max <= 0) return out;
  for (const h of hits) out.set(h.slug, h.score / max);
  return out;
}

/**
 * Gộp hai nhánh, cắt `limit`.
 *
 * `matchedBy` được giữ lại để soi khi kết quả sai: biết một dataset vào top nhờ
 * nhánh nào là khác biệt giữa "sửa được" và "đoán".
 */
export function fuse(
  semantic: BranchHit[],
  keyword: BranchHit[],
  limit: number,
): SearchHit[] {
  // Nhánh vector giữ NGUYÊN cosine, không chuẩn hoá theo điểm cao nhất: cosine đã
  // là thang tuyệt đối, so được giữa các câu hỏi khác nhau. Chuẩn hoá theo max làm
  // kết quả đầu bảng luôn bằng 1,0 kể cả khi nó chẳng liên quan gì — đo thực tế:
  // "giá xăng dầu thế giới" (kho không có) cho ra một dataset điểm 0,99.
  const sem = new Map(semantic.map((h) => [h.slug, h.score]));
  // Nhánh từ khoá thì PHẢI chuẩn hoá: điểm của nó là tổng log không có trần, cộng
  // thẳng vào cosine thì nó lấn hết.
  const kw = normalizeBranch(keyword);

  const slugs = new Set([...sem.keys(), ...kw.keys()]);
  const merged: SearchHit[] = [];

  for (const slug of slugs) {
    const s = sem.get(slug);
    const k = kw.get(slug);
    const score = (s ?? 0) * SEMANTIC_WEIGHT + (k ?? 0) * KEYWORD_WEIGHT;
    if (score < MIN_SCORE) continue;
    merged.push({
      slug,
      // Tiêu đề do caller điền sau — nhánh trộn không đọc metadata.
      title: "",
      score,
      matchedBy:
        s !== undefined && k !== undefined
          ? "both"
          : s !== undefined
            ? "semantic"
            : "keyword",
      semanticScore: s,
      keywordScore: k,
    });
  }

  return merged.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Dưới mức này thì kết quả đầu bảng nằm trong **vùng nghi ngờ**.
 *
 * Đo trên kho 495 dataset: câu hỏi có dataset thật cho cosine cao nhất 0,66–0,77;
 * câu hỏi không có gì liên quan cho 0,46–0,62. Ranh giới 0,65 nằm giữa hai vùng đó.
 *
 * Cố ý KHÔNG dùng làm ngưỡng cắt (xem `MIN_SCORE`): một tên riêng đứng một mình
 * cũng rơi xuống dưới mức này. Đây là **tín hiệu chuyển cho model**, để nó nói
 * "chưa có dataset về chủ đề này" thay vì cố tìm lý do cho cái đầu bảng.
 */
const WEAK_RELEVANCE_CEILING = 0.65;

export { MIN_SCORE, SEMANTIC_WEIGHT, KEYWORD_WEIGHT, WEAK_RELEVANCE_CEILING };
