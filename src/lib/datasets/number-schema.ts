/**
 * Lấy Frictionless number schema của một cột từ data dictionary.
 *
 * Vì sao tách ra: `DatasetViewer` (tab Dataset card) dựng schema này rồi truyền
 * vào `numericStats`/`histogramBins`, còn `R2FileViewer` (tab Files and versions)
 * không — nên cùng một cột, hai tab cho hai con số khác nhau. Kho này lưu số kiểu
 * Việt (`"144,8"`), và không có schema thì `parseNumberWithSchema` trả `null`:
 *
 *     không schema:  min "0"  max "0"      hist [1,0,0,0,0,0,0,0]
 *     có schema   :  min "0"  max "319,9"  hist [1,0,0,1,1,1,0,1]
 *
 * Tức nó không để trống mà hiện min 0 / max 0 — sai một cách tự tin, người đọc
 * không có dấu hiệu nào để nghi. Một hàm dùng chung thì không lệch được nữa.
 */

import type { DataDictionaryEntry } from "@/lib/types/dataset";
import type { NumberSchema } from "@/lib/parse/number";

export function schemaForColumn(
  dictionary: DataDictionaryEntry[] | undefined,
  columnName: string,
): NumberSchema | undefined {
  const meta = dictionary?.find((d) => d.column_name === columnName);
  if (!meta?.decimal_char && !meta?.group_char) return undefined;
  return { decimal_char: meta.decimal_char, group_char: meta.group_char };
}

/**
 * Format số để hiển thị, theo đúng quy ước của CHÍNH cột đó.
 *
 * Trước đây dùng `toLocaleString("vi-VN")` cố định, nên cột `Năm` hiện năm 2019
 * thành **`2.019`** — dấu nhóm hàng nghìn trên một con số năm làm người đọc tưởng
 * là 2,019. Dictionary đã khai `group_char` cho từng cột: cột `Năm` không khai gì
 * (không nhóm), cột `Số giờ nắng` khai `.`/`,`. Dùng đúng khai báo đó thì con số
 * hiện ra giống cách nguồn viết, và cột năm không bị nhóm.
 */
export function formatNumberWithSchema(
  n: number,
  schema?: NumberSchema,
): string {
  const dec = schema?.decimal_char ?? ".";
  const grp = schema?.group_char;
  const [intPart, fracPart] = String(n).split(".");
  const grouped = grp
    ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, grp)
    : intPart;
  return fracPart ? grouped + dec + fracPart : grouped;
}

/**
 * Nhãn khoảng cho một cột histogram.
 *
 * Làm tròn mốc về số nguyên khi cả min và max đều nguyên: cột `Năm` chia 8 bin
 * cho ra mốc `2004.75`, và "2002 – 2004.75" là một khoảng năm không tồn tại.
 */
export function binRangeLabel(
  index: number,
  binCount: number,
  min: number | undefined,
  max: number | undefined,
  format: (n: number) => string,
  /**
   * Giá trị của từng cột, khi histogram đếm theo GIÁ TRỊ chứ không theo khoảng.
   *
   * Có nó thì nhãn là một con số (`2019`), không phải một khoảng (`2002 – 2005`).
   * Thiếu nó mà cột đang đếm theo giá trị thì nhãn nói sai hẳn nội dung.
   */
  values?: number[],
): string {
  if (values && values[index] != null) return format(values[index]);
  if (min == null || max == null) return `khoảng ${index + 1}/${binCount}`;
  const step = (max - min) / binCount;
  const lo = min + index * step;
  const hi = min + (index + 1) * step;
  // Làm tròn mốc theo độ chính xác của CHÍNH dữ liệu, không theo độ chính xác của
  // phép chia. Cột `Số giờ nắng` có min 0 / max 319,9 (một chữ số thập phân) mà
  // chia 8 cho ra mốc 39,9875 — bốn chữ số thập phân đó là của phép chia, không
  // phải của dữ liệu, và đọc lên chỉ thêm nhiễu.
  const dec = (n: number) => {
    const s = String(n);
    const i = s.indexOf(".");
    return i < 0 ? 0 : s.length - i - 1;
  };
  const places = Math.min(2, Math.max(dec(min), dec(max)));
  const r = (n: number) => Number(n.toFixed(places));
  return `${format(r(lo))} – ${format(r(hi))}`;
}
