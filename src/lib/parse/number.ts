/**
 * Locale-aware number parser theo Frictionless Data Table Schema.
 *
 * Raw cell string + decimal_char/group_char → number.
 * Dùng cho stats compute, sort, filter khi storage giữ raw (không normalize).
 *
 * Spec: https://frictionlessdata.io/specs/table-schema/
 */

export interface NumberSchema {
  /** Ký tự thập phân. Mặc định `.` (canonical). */
  decimal_char?: "." | ",";
  /** Ký tự nhóm hàng nghìn. Mặc định undefined = không có group sep. */
  group_char?: "." | "," | " ";
}

/**
 * Parse số từ raw cell string theo schema.
 *
 * Ví dụ:
 *   parseNumberWithSchema("1.234.567,89", { decimal_char: ",", group_char: "." }) → 1234567.89
 *   parseNumberWithSchema("1,234,567.89", { decimal_char: ".", group_char: "," }) → 1234567.89
 *   parseNumberWithSchema("1234.56") → 1234.56  (default `.` decimal)
 *   parseNumberWithSchema("1234,56", { decimal_char: "," }) → 1234.56
 *   parseNumberWithSchema("abc") → null
 *   parseNumberWithSchema("") → null
 *
 * @returns number nếu parse thành công, null nếu không phải số.
 */
export function parseNumberWithSchema(
  raw: string,
  schema?: NumberSchema
): number | null {
  if (!raw || typeof raw !== "string") return null;

  let s = raw.trim();
  if (!s) return null;

  // Bỏ ký tự nhóm hàng nghìn (group separator) toàn bộ
  if (schema?.group_char) {
    // Escape regex special chars (space không cần escape, `.` cần)
    const escaped = schema.group_char === "." ? "\\." : schema.group_char;
    s = s.replace(new RegExp(escaped, "g"), "");
  }

  // Nếu decimal_char = "," → đổi thành "." để parseFloat
  if (schema?.decimal_char === ",") {
    s = s.replace(/,/g, ".");
  }

  // parseInt/parseFloat thông thường → trả về number
  // Accept cả scientific notation (1.5e3), negative (-1.5)
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format number về chuỗi hiển thị theo schema.
 *
 * Dùng cho stats header (min/max), tooltip — KHÔNG dùng cho cell value
 * (cell hiển thị raw từ file theo convention publishing platform).
 *
 * @param n số cần format
 * @param schema schema của field
 * @param maxFractionDigits giữ tối đa bao nhiêu chữ số thập phân (default 20 = no precision loss)
 */
export function formatNumberWithSchema(
  n: number,
  schema?: NumberSchema,
  maxFractionDigits = 20
): string {
  if (!Number.isFinite(n)) return String(n);

  const decimalChar = schema?.decimal_char ?? ".";
  const groupChar = schema?.group_char;

  // Dùng Intl.NumberFormat để format với group + fraction digits
  // Sau đó swap sang decimal_char/group_char mong muốn
  const formatted = new Intl.NumberFormat("en-US", {
    useGrouping: !!groupChar,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(n);

  if (decimalChar === "." && (!groupChar || groupChar === ",")) {
    // Đúng format en-US mặc định — trả nguyên
    return formatted;
  }

  // Swap: tạm thời đổi sang ký tự trung gian để không conflict
  return formatted
    .replace(/,/g, "\u0000")  // group → null char tạm
    .replace(/\./g, decimalChar)  // decimal → mong muốn
    .replace(/\u0000/g, groupChar ?? ",");  // group → mong muốn
}
