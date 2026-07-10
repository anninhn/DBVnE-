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

/**
 * Parse CSV với row limit — chỉ giữ first `maxRows` rows, đếm total.
 *
 * Tránh OOM với file lớn (hàng triệu rows): sau khi đủ maxRows,
 * chỉ đếm row count mà không tạo string/array object.
 *
 * @returns { rows: first maxRows rows, totalRowCount: tổng số rows (all) }
 */
export function parseCSVHead(
  text: string,
  maxRows: number
): { rows: string[][]; totalRowCount: number } {
  // Strip UTF-8 BOM nếu có
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let totalRowCount = 0;
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const canStore = rows.length < maxRows;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          if (canStore) field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (canStore) field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        if (canStore) row.push(field);
        field = "";
      } else if (ch === "\r") {
        continue;
      } else if (ch === "\n") {
        if (canStore) {
          row.push(field);
          rows.push(row);
        }
        totalRowCount++;
        row = [];
        field = "";
      } else {
        if (canStore) field += ch;
      }
    }
  }

  // Flush row cuối cùng (file không kết thúc bằng \n)
  if (field.length > 0 || row.length > 0) {
    if (rows.length < maxRows) {
      row.push(field);
      rows.push(row);
    }
    totalRowCount++;
  }

  return { rows, totalRowCount };
}

/**
 * Streaming CSV iterator — gọi `onRow(fields, rowIndex)` cho mỗi row,
 * KHÔNG lưu trữ rows. Trả về total row count.
 *
 * Dùng cho full-dataset stats computation: iterate hàng triệu rows
 * mà không blow up memory (chỉ 1 row trong memory tại lúc nào).
 *
 * @param onRow callback. Return `false` để early-exit.
 * @returns total row count (bao gồm cả rows bị skip khi early-exit)
 */
export function forEachCSVRow(
  text: string,
  onRow: (fields: string[], rowIndex: number) => boolean | void
): number {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  let rowIndex = 0;
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
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
        continue;
      } else if (ch === "\n") {
        row.push(field);
        if (onRow(row, rowIndex) === false) return rowIndex + 1;
        rowIndex++;
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }
  }

  // Flush row cuối cùng (file không kết thúc bằng \n)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    onRow(row, rowIndex);
    rowIndex++;
  }

  return rowIndex;
}
