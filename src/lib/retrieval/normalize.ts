/**
 * Chuẩn hoá text dùng chung cho mọi việc tra cứu.
 *
 * Tách ra khỏi `src/lib/search/simple-filter.ts` để ô search trên trang danh mục,
 * nhánh khớp từ khoá, và chỉ mục giá trị **dùng chung một hàm**. Ba chỗ chuẩn hoá
 * khác nhau một chút là ba chỗ cho ra kết quả khác nhau với cùng đầu vào — đúng loại
 * lệch mà FR-057 nhắm tới, và là loại lệch không có triệu chứng.
 *
 * Nhận `unknown` chứ không phải `string`: dữ liệu đến từ YAML do người/AI ghi, kiểu
 * không đảm bảo. Tag toàn chữ số (`- 2024`) parse ra number, gọi thẳng `.toLowerCase()`
 * là TypeError — mà lỗi này ném trong render nên sập cả trang chủ, không chỉ hỏng một
 * kết quả. Đã xảy ra thật 2026-09-03.
 */
export function normalize(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/** Từ quá ngắn hoặc quá phổ biến — bỏ khi tách token cho việc khớp từ khoá. */
const STOP_WORDS = new Set([
  "cua", "va", "theo", "tai", "cac", "mot", "so", "cho", "trong", "tu", "den",
  "co", "khong", "nao", "gi", "the", "nhu", "voi", "la", "duoc", "bi", "ve",
  "hay", "hoac", "nhung", "ma", "thi", "se", "da", "dang", "cung", "cho",
]);

/**
 * Tách câu hỏi thành token đã chuẩn hoá, bỏ từ dừng.
 *
 * Dùng cho nhánh khớp từ khoá. KHÔNG dùng cho ô search trên trang danh mục — chỗ đó
 * giữ nguyên hành vi AND trên toàn bộ token người dùng gõ, vì gõ từ khoá thì mong
 * mọi từ đều khớp.
 */
export function tokenize(s: unknown): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}
