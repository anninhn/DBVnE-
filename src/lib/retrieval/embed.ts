/**
 * Sinh vector ngữ nghĩa cho dataset và cho câu hỏi.
 *
 * Dùng chung client `openai` và `GEMINI_API_KEY` sẵn có (R1) — không thêm khoá,
 * không thêm dependency.
 *
 * Hai bên PHẢI đi qua đúng hàm này: vector của dataset và vector của câu hỏi mà
 * sinh bằng hai cấu hình khác nhau (khác model, khác số chiều, một bên chuẩn hoá
 * độ dài một bên không) thì cosine giữa chúng vô nghĩa — và nó vẫn trả về một con
 * số trông hợp lý, nên lỗi này không có triệu chứng.
 */

import { getAIClient } from "@/lib/ai/dataset-reviewer";

/** Xem R1 — rẻ hơn `gemini-embedding-2` 33% và giới hạn 2.048 token là dư sức. */
const EMBED_MODEL = "gemini-embedding-001";

/**
 * Số chiều giữ lại.
 *
 * Model trả về 3.072 chiều nếu không yêu cầu gì. Ở kích thước đó, chỉ mục cho 495
 * dataset là ~30 MB và ở 2.000 dataset là ~120 MB — phải tải lại toàn bộ mỗi lần
 * khởi động nguội, tức là phá đúng mục tiêu SC-012 (chữ đầu tiên trong 4 giây).
 *
 * 768 chiều là mức `research.md` R2 đã tính dung lượng dựa trên. Model này hỗ trợ
 * cắt chiều (Matryoshka): vector 768 chiều vẫn dùng được, chỉ mất một ít độ phân
 * giải ngữ nghĩa.
 */
const EMBED_DIMENSIONS = 768;

/**
 * Số text gửi trong một lượt gọi.
 *
 * Gửi từng cái là 495 lượt gọi cho một lần dựng chỉ mục — chậm và dễ chạm hạn mức
 * theo phút. Gộp quá nhiều thì một lỗi làm mất cả lô và phải gọi lại từ đầu.
 */
const BATCH_SIZE = 32;

/**
 * Chuẩn hoá vector về độ dài 1.
 *
 * BẮT BUỘC khi đã cắt chiều: model chỉ chuẩn hoá vector ở số chiều đầy đủ, nên bản
 * 768 chiều trả về có độ dài ~0,59 (đo thực tế). Không chuẩn hoá lại thì cosine
 * phải chia cho hai độ dài, và tệ hơn là điểm giữa các dataset lệch nhau theo độ
 * dài vector chứ không theo nội dung. Sau khi chuẩn hoá, cosine = tích vô hướng.
 */
function toUnitLength(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

/**
 * Text dùng để sinh vector cho một dataset (data-model § RetrievalIndexEntry).
 *
 * Cố ý KHÔNG đưa danh sách giá trị cột vào: đó là việc của chỉ mục giá trị (R7).
 * Nhồi 200 tên phường vào đây thì tín hiệu chủ đề của dataset bị loãng đi, và câu
 * hỏi "có dữ liệu lạm phát không" sẽ khớp với mọi dataset có cột địa bàn.
 */
export function buildIndexText(input: {
  title: string;
  description?: string;
  category?: string;
  columns?: string[];
}): string {
  const parts = [input.title];
  if (input.description) parts.push(input.description);
  if (input.category) parts.push(input.category);
  if (input.columns?.length) parts.push(input.columns.join(", "));
  return parts.join("\n");
}

/** Số chiều của vector trong chỉ mục — bên đọc dùng để bắt trường hợp đổi model. */
export function embedDimensions(): number {
  return EMBED_DIMENSIONS;
}

/**
 * Sinh vector cho một danh sách text, giữ đúng thứ tự đầu vào.
 *
 * Thứ tự là hợp đồng: caller ghép kết quả về slug theo chỉ số. Trả về sai thứ tự
 * nghĩa là gán vector của dataset này cho dataset khác — chỉ mục vẫn hoạt động và
 * vẫn trả kết quả, chỉ là trả sai dataset.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  const client = getAIClient();

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await client.embeddings.create({
      model: EMBED_MODEL,
      input: batch,
      dimensions: EMBED_DIMENSIONS,
    });

    if (res.data.length !== batch.length) {
      throw new Error(
        `Embedding trả về ${res.data.length} vector cho ${batch.length} text — ` +
          `không ghép được về đúng dataset, dừng thay vì gán sai.`,
      );
    }
    // Sắp theo `index` do API trả về, không tin thứ tự của mảng: gán lệch một chỗ
    // là mọi dataset sau đó đều mang vector của dataset khác.
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) out.push(toUnitLength(item.embedding));
  }

  return out;
}

/** Sinh vector cho một câu hỏi — cùng model, cùng số chiều, cùng chuẩn hoá. */
export async function embedQuery(query: string): Promise<number[]> {
  const [vector] = await embedTexts([query]);
  return vector;
}
