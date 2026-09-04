/**
 * Ý định của câu hỏi: tìm dataset, hay đòi một con số tính ra từ dữ liệu.
 *
 * Việc **phân loại** do chính model làm trong cùng lượt trả lời, dẫn bằng quy tắc
 * trong `tools/prompts/discovery-chat.md` (R8) — không thêm một lượt gọi riêng chỉ
 * để phân loại, và cố tình KHÔNG khớp từ khoá: "có dữ liệu nào về tăng trưởng
 * không" là câu tìm kiếm, còn "tăng trưởng Đà Nẵng nhanh hơn Hà Nội bao nhiêu" là
 * câu tính toán, mà cả hai đều chứa chữ "tăng trưởng".
 *
 * File này chỉ giữ phần **không được phép sai**: đọc nhãn model trả về, và bảo
 * đảm câu trả lời cho câu hỏi tính toán luôn nói rõ giới hạn. Model quên nói thì
 * chỗ này nói thay — đây là lưới cuối, vì một con số bịa lọt vào bài báo là lỗi
 * người đọc không có cách nào tự phát hiện.
 *
 * Hàm ở đây thuần tuý, không import gì của server → client component dùng được.
 */

export type QuestionIntent = "search" | "compute" | "both";

/**
 * Đọc nhãn ý định từ output của model.
 *
 * Thiếu hoặc sai giá trị → `"search"`. Đây là mặc định an toàn: nhận nhầm câu
 * tính toán thành câu tìm kiếm chỉ làm mất một dòng nhắc, còn nhận nhầm chiều
 * ngược lại thì mọi câu hỏi đều bị dán thêm cảnh báo thừa và người đọc sẽ học
 * cách lờ nó đi — lúc cần thật thì nó không còn tác dụng.
 */
export function normalizeIntent(raw: unknown): QuestionIntent {
  return raw === "compute" || raw === "both" ? raw : "search";
}

/**
 * Câu nói rõ giới hạn, thêm vào cuối câu trả lời cho câu hỏi tính toán.
 *
 * Cố ý KHÔNG hứa hẹn ("sẽ sớm có", "đang phát triển") — FR-063. Hứa một tính năng
 * chưa có làm phóng viên chờ một thứ không tới, và đó là cách nhanh nhất để họ
 * ngừng tin những gì hệ thống nói.
 */
export const COMPUTE_NOTICE =
  "Hệ thống chỉ tìm và mô tả dataset, không tự tính toán trên dữ liệu — " +
  "con số cụ thể cần mở dataset ra tính, để mỗi số trong bài đều truy được nguồn.";

/** Câu trả lời đã nói rõ giới hạn chưa — so bằng một mảnh đủ đặc trưng. */
function hasNotice(answer: string): boolean {
  return answer.includes("không tự tính toán");
}

/**
 * Bảo đảm câu trả lời cho câu hỏi tính toán có nói rõ giới hạn.
 *
 * Với ý định `both`, phần tìm kiếm vẫn được trả lời đầy đủ và chỉ thêm một dòng
 * ở cuối (FR-043) — không cắt bỏ phần model đã trả lời đúng.
 */
export function ensureComputeNotice(
  answer: string,
  intent: QuestionIntent,
): string {
  if (intent === "search") return answer;
  if (hasNotice(answer)) return answer;
  return `${answer.trimEnd()}\n\n${COMPUTE_NOTICE}`;
}
