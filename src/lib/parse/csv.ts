/**
 * Native CSV parser — không dùng papaparse (D6).
 *
 * Handle: quoted fields, embedded quotes ("" escape), UTF-8 BOM, \r\n line endings.
 * Không handle: quoted newlines (rare cho statistical CSV — fail gracefully ở caller).
 *
 * ~30 dòng state machine thuần.
 */
export function parseCSV(text: string): string[][] {
  // Strip UTF-8 BOM nếu có
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Embedded quote: "" → "
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\r") {
        // Xử lý \r\n — bỏ qua \r, xử lý \n ở iteration tiếp theo
        continue;
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }
  }

  // Flush field/row cuối cùng (file không kết thúc bằng \n)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
