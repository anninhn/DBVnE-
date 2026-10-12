/**
 * Trộn kết quả hai nhánh tìm kiếm thành một danh sách có thứ tự (R6).
 *
 * Hai nhánh cho điểm ở hai thang khác nhau: cosine nằm trong [0,1] còn điểm từ khoá
 * là tổng log không có trần. Cộng thẳng thì nhánh từ khoá lấn hoàn toàn — nên phải
 * chuẩn hoá mỗi nhánh về [0,1] trước.
 *
 * SỬA 2026-10-08 — THỨ TỰ xếp bằng thứ hạng (Reciprocal Rank Fusion), không bằng
 * tổng điểm. Chuẩn hoá về [0,1] vẫn chưa đủ: cosine của MỌI dataset dồn trong một
 * dải hẹp (~0,5–0,72), còn điểm từ khoá đã chuẩn hoá trải đều 0–1, nên nhánh từ khoá
 * vẫn quyết định thứ tự. Đo trên kho 498 dataset: "Thu nhập và mức sinh có liên quan
 * gì nhau giữa các tỉnh?" — dataset "Tổng tỷ suất sinh" hạng 2 theo ngữ nghĩa nhưng
 * hạng 55 sau khi trộn (chữ "mức sinh" không khớp từ khoá "tỷ suất sinh"; "sinh" lại
 * khớp "giá sinh hoạt"), rơi khỏi top-20 gửi cho model → hệ thống trả lời "kho chưa
 * có dataset về mức sinh". RRF chỉ dùng THỨ HẠNG trong mỗi nhánh nên lệch thang điểm
 * không còn tác dụng.
 *
 * Tổng điểm tuyến tính (`score`) VẪN được tính và VẪN là thứ lọc rác qua `MIN_SCORE`
 * — ngưỡng đó đã được đo trên thang này (xem dưới), đổi sang RRF thì con số mất nghĩa.
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

/**
 * Hằng số K của RRF: điểm thứ tự = Σ 1 / (K + hạng). K = 60 là giá trị chuẩn trong
 * tài liệu gốc của RRF (Cormack và cộng sự, 2009); K lớn làm chênh lệch giữa các hạng
 * đầu bớt gắt để một nhánh không áp đảo chỉ vì một hạng 1.
 */
const RRF_K = 60;

/**
 * Trọng số nhánh từ khoá TRONG RRF (nhánh ngữ nghĩa = 1). Đo 2026-10-08 trên 12 câu
 * có đáp án biết trước + 6 câu dựa vào tên riêng/viết tắt (GINI, TFR, lúa hè thu…):
 *
 *   cách trộn                 | "thu nhập và mức sinh" | "hộ nghèo và thu nhập" | câu tên riêng
 *   cộng điểm cũ (50/50)      | hạng 55                | hạng 5                | như nhau
 *   RRF, từ khoá = 1          | hạng 20                | hạng 16               | như nhau
 *   RRF, từ khoá = 0,3        | hạng 9                 | hạng 4                | như nhau
 *
 * Câu diễn đạt tự nhiên thì nhánh từ khoá nhiễu ("sinh" khớp "giá sinh hoạt", "mức"
 * khớp "mức thay đổi lượng mưa"); câu tên riêng thì cả hai nhánh đã đồng thuận nên
 * hạ trọng số không làm mất gì. Câu hỏi theo giá trị (tên tỉnh) đi đường riêng
 * `findValuesInQuery`, không phụ thuộc trọng số này.
 */
const RRF_KEYWORD_WEIGHT = 0.3;

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

  // Thứ tự theo RRF trên hạng của từng nhánh (hạng tính trên TOÀN BỘ nhánh, trước lọc).
  const semRank = new Map([...semantic].sort((a, b) => b.score - a.score).map((h, i) => [h.slug, i + 1]));
  const kwRank = new Map([...keyword].sort((a, b) => b.score - a.score).map((h, i) => [h.slug, i + 1]));
  const rrf = (slug: string) => {
    const r1 = semRank.get(slug);
    const r2 = kwRank.get(slug);
    return (r1 ? 1 / (RRF_K + r1) : 0) + (r2 ? RRF_KEYWORD_WEIGHT / (RRF_K + r2) : 0);
  };
  const order = new Map(merged.map((h) => [h.slug, rrf(h.slug)]));
  return merged
    .sort((a, b) => order.get(b.slug)! - order.get(a.slug)! || b.score - a.score)
    .slice(0, limit);
}

/*
 * ĐÃ BỎ: `WEAK_RELEVANCE_CEILING = 0.65`.
 *
 * Nó từng được gửi cho model như tín hiệu "cả danh sách này liên quan thấp, hãy
 * nói là chưa có". Đó là chính cái ngưỡng cắt mà chú thích của `MIN_SCORE` bên
 * trên giải thích là KHÔNG dùng được — chỉ khác là nó đi qua model nên trông như
 * model tự kết luận.
 *
 * Hậu quả đo được: câu "có dữ liệu gì về Đà Nẵng" cho cosine cao nhất 0,613 <
 * 0,65 → hệ thống trả lời "kho dữ liệu chưa có dataset về Đà Nẵng", trong khi
 * `Đà Nẵng` có thật ở 176 dataset. Sai theo chiều tệ nhất, và phóng viên không
 * có cách nào tự phát hiện.
 *
 * Thay bằng: `findValuesInQuery` tra chỉ mục nghịch đảo và đưa dữ kiện thật vào
 * ngữ cảnh. Câu hỏi theo giá trị được trả lời bằng dữ liệu, không bằng một
 * ngưỡng cosine.
 */

export { MIN_SCORE, SEMANTIC_WEIGHT, KEYWORD_WEIGHT, RRF_K, RRF_KEYWORD_WEIGHT };
