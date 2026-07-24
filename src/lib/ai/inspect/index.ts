/**
 * File inspection entry — detect format + delegate tới per-format inspector.
 *
 * Tách từ src/lib/ai/inspect.ts (refactor 2026-07-24-pre-launch-refactor).
 * Mỗi format (csv/xlsx/geojson) có module riêng. Module này chỉ dispatcher.
 *
 * Public API (re-export): InspectionFormat, ColumnInspection, FileInspection.
 * Caller dùng `@/lib/ai/inspect` — resolver tìm `inspect/index.ts` tự động.
 */

import type { FileInspection, InspectionFormat } from "./column";
import { inspectCsv } from "./csv";
import { inspectXlsx } from "./xlsx";
import { inspectGeoJson } from "./geojson";

export type {
  InspectionFormat,
  ColumnInspection,
  FileInspection,
} from "./column";

/**
 * Detect format từ filename.
 */
export function detectFormat(filename: string): InspectionFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".geojson")) return "geojson";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  return null;
}

/**
 * Inspect file buffer → FileInspection. Throw nếu format không support.
 */
export function inspectFile(
  buffer: Buffer,
  filename: string,
): FileInspection {
  const format = detectFormat(filename);
  if (!format) {
    throw new Error(`Unsupported file format: ${filename}`);
  }
  if (format === "csv") return inspectCsv(buffer, filename);
  if (format === "geojson") return inspectGeoJson(buffer, filename);
  return inspectXlsx(buffer, filename);
}
