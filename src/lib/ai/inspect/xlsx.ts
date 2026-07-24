/**
 * XLSX inspection — đọc sheet đầu tiên qua SheetJS.
 *
 * XLSX files trong app đều nhỏ (< 1MB) → safe parse full vào memory.
 */

import * as XLSX from "xlsx";
import type { FileInspection } from "./column";
import {
  MAX_SAMPLE_ROWS_FOR_AI,
  MAX_ROWS_FOR_INSPECTION,
  inspectColumn,
  computeStatsFromRows,
} from "./column";

/** Inspect XLSX buffer → FileInspection. Đọc sheet đầu tiên. */
export function inspectXlsx(buffer: Buffer, filename: string): FileInspection {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("XLSX không có sheet nào");
  }
  const sheet = workbook.Sheets[sheetName];
  const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });
  const sliced = allRows.slice(0, MAX_ROWS_FOR_INSPECTION);

  // Column order từ keys của row đầu (giữ thứ tự xuất hiện)
  const columnSet = new Set<string>();
  sliced.forEach((r) => Object.keys(r).forEach((k) => columnSet.add(k)));
  const columns = Array.from(columnSet);

  const columnInspections = columns.map((col) =>
    inspectColumn(
      col,
      sliced as Record<string, string | number | boolean | null>[],
    ),
  );

  // Full-dataset stats (XLSX nhỏ → safe compute từ allRows)
  const typeMap = new Map<string, string>();
  columnInspections.forEach((c) => typeMap.set(c.name, c.inferredType));
  const columnStats = computeStatsFromRows(allRows, columns, typeMap);

  return {
    format: "xlsx",
    filename,
    rowCount: allRows.length,
    columnCount: columns.length,
    columns: columnInspections,
    sampleRows: sliced.slice(0, MAX_SAMPLE_ROWS_FOR_AI) as Record<
      string,
      string | number | boolean | null
    >[],
    columnStats,
    sheetName,
  };
}
