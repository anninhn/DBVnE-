/**
 * GeoJSON inspection — flatten features.properties thành rows.
 *
 * Map features[].properties → rows[] (cho column inference + stats).
 * Cap stats ở STATS_FEATURE_CAP (10000) features; featureCount = full count.
 * Bbox + geometryType cũng cap ở STATS_FEATURE_CAP.
 */

import type { NumberSchema } from "@/lib/parse/number";
import {
  parseGeoJson,
  computeBbox,
  majorityGeometryType,
  extractCrs,
} from "@/lib/parse/geojson";
import type { FileInspection } from "./column";
import {
  MAX_SAMPLE_ROWS_FOR_AI,
  inspectColumn,
  computeStatsFromRows,
} from "./column";

const STATS_FEATURE_CAP = 10000;

/**
 * Inspect GeoJSON buffer → FileInspection.
 */
export function inspectGeoJson(
  buffer: Buffer,
  filename: string,
): FileInspection {
  const fc = parseGeoJson(buffer);
  const features = fc.features;
  const featureCount = features.length;

  // Stats chỉ trên first N features (cap), full count cho featureCount
  const statsFeatures = features.slice(0, STATS_FEATURE_CAP);

  const geometryType = majorityGeometryType(statsFeatures);
  const bbox = computeBbox(statsFeatures);
  const crs = extractCrs(fc);

  // Build rows from features.properties — reuse inspectColumn + computeStatsFromRows
  const allRows: Record<string, string | number | boolean | null>[] = [];
  const columnSet = new Set<string>();
  for (const f of statsFeatures) {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const row: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(props)) {
      columnSet.add(k);
      if (v === null || v === undefined) row[k] = null;
      else if (typeof v === "number" || typeof v === "boolean") row[k] = v;
      else row[k] = String(v);
    }
    allRows.push(row);
  }
  const columns = Array.from(columnSet);

  const columnInspections = columns.map((col) => inspectColumn(col, allRows));

  const typeMap = new Map<string, string>();
  const schemaMap = new Map<string, NumberSchema | undefined>();
  columnInspections.forEach((c) => {
    typeMap.set(c.name, c.inferredType);
    schemaMap.set(c.name, c.decimalSchema);
  });
  const columnStats = computeStatsFromRows(
    allRows as Record<string, unknown>[],
    columns,
    typeMap,
    schemaMap,
  );

  // Sample rows: first 5 features.properties (cho AI context)
  const sampleRows: Record<string, string | number | boolean | null>[] = [];
  for (let i = 0; i < Math.min(MAX_SAMPLE_ROWS_FOR_AI, featureCount); i++) {
    const props = (features[i].properties ?? {}) as Record<string, unknown>;
    const row: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined) row[k] = null;
      else if (typeof v === "number" || typeof v === "boolean") row[k] = v;
      else row[k] = String(v);
    }
    sampleRows.push(row);
  }

  return {
    format: "geojson",
    filename,
    rowCount: featureCount, // rowCount = featureCount cho GeoJSON (consistent field)
    columnCount: columns.length,
    columns: columnInspections,
    sampleRows,
    columnStats,
    featureCount,
    geometryType: geometryType ?? undefined,
    bbox: bbox ?? undefined,
    crs,
  };
}
