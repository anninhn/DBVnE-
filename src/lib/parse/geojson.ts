/**
 * Native GeoJSON parser — không dùng library ngoài (per CLAUDE.md).
 *
 * Validate RFC 7946 structure: type === "FeatureCollection" + features[].
 * Reject CRS khác WGS84 (EPSG:4326) — reproject là scope sau.
 *
 * Helpers:
 *  - parseGeoJson(buffer): validate + return FeatureCollection
 *  - computeBbox(features): [minLng, minLat, maxLng, maxLat]
 *  - majorityGeometryType(features): vote type có count cao nhất
 */

// Minimal GeoJSON types (tránh thêm @types/geojson dependency)
export type GeoJsonGeometryType =
  | "Point"
  | "LineString"
  | "Polygon"
  | "MultiPoint"
  | "MultiLineString"
  | "MultiPolygon"
  | "GeometryCollection";

export interface GeoJsonGeometry {
  type: GeoJsonGeometryType;
  coordinates: unknown;
  geometries?: GeoJsonGeometry[];
}

export interface GeoJsonFeature {
  type: "Feature";
  geometry: GeoJsonGeometry | null;
  properties: Record<string, unknown> | null;
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
  bbox?: [number, number, number, number];
  crs?: { type: string; properties: { name: string } };
}

/**
 * Parse GeoJSON buffer → FeatureCollection.
 *
 * Throw error rõ ràng nếu:
 *  - JSON parse fail
 *  - Root không phải object / không có type=FeatureCollection
 *  - Missing features[] array
 *  - CRS khác WGS84 (EPSG:4326) — reproject là scope sau (D6)
 */
export function parseGeoJson(buffer: Buffer): GeoJsonFeatureCollection {
  const text = buffer.toString("utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Invalid GeoJSON: không parse được JSON — ${
        err instanceof Error ? err.message : "unknown"
      }`
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid GeoJSON: root không phải object");
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.type !== "FeatureCollection") {
    throw new Error(
      `Invalid GeoJSON: type !== "FeatureCollection" (got ${String(
        obj.type
      )})`
    );
  }

  if (!Array.isArray(obj.features)) {
    throw new Error("Invalid GeoJSON: missing features[] array");
  }

  // CRS check — chỉ accept WGS84 (D6)
  if (obj.crs && typeof obj.crs === "object") {
    const crs = obj.crs as { properties?: { name?: string } };
    const name = crs.properties?.name ?? "";
    // Accept các alias WGS84: "EPSG:4326", "urn:ogc:def:crs:EPSG::4326", "WGS84"
    const isWgs84 = /4326|wgs.?84/i.test(name);
    if (!isWgs84) {
      throw new Error(
        `Unsupported CRS: chỉ accept EPSG:4326 (WGS84). File declare "${name}". ` +
          `Vui lòng reproject trước khi upload.`
      );
    }
  }

  return obj as unknown as GeoJsonFeatureCollection;
}

/**
 * Majority vote geometry type — count type per feature, return type có count cao nhất.
 *
 * Null nếu features rỗng hoặc tất cả feature không có geometry.
 */
export function majorityGeometryType(
  features: GeoJsonFeature[]
): GeoJsonGeometryType | null {
  const counts = new Map<GeoJsonGeometryType, number>();
  for (const f of features) {
    const geom = f.geometry;
    if (!geom || typeof geom.type !== "string") continue;
    // Trust type field, không validate structure sâu
    const t = geom.type as GeoJsonGeometryType;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let best: GeoJsonGeometryType | null = null;
  let bestCount = 0;
  for (const [t, c] of counts) {
    if (c > bestCount) {
      best = t;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Compute bbox [minLng, minLat, maxLng, maxLat] từ features.
 *
 * Traverse coordinates array recursively — handle Polygon, Multi*,
 * GeometryCollection nested coords.
 */
export function computeBbox(
  features: GeoJsonFeature[]
): [number, number, number, number] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let hasCoord = false;

  const visitCoords = (coords: unknown) => {
    if (typeof coords !== "object" || coords === null) return;
    if (!Array.isArray(coords)) return;

    // Position: [number, number] (hoặc [lng, lat, alt])
    if (
      coords.length >= 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      const lng = coords[0];
      const lat = coords[1];
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
      hasCoord = true;
      return;
    }

    // Nested — recurse
    for (const c of coords) visitCoords(c);
  };

  for (const f of features) {
    const geom = f.geometry;
    if (!geom) continue;

    if (geom.type === "GeometryCollection" && Array.isArray(geom.geometries)) {
      for (const g of geom.geometries) {
        visitCoords(g.coordinates);
      }
    } else {
      visitCoords(geom.coordinates);
    }
  }

  if (!hasCoord) return null;
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Trích CRS string từ FeatureCollection — normalize về "EPSG:4326" nếu missing.
 */
export function extractCrs(fc: GeoJsonFeatureCollection): string {
  const name = fc.crs?.properties?.name;
  if (!name) return "EPSG:4326";
  // Normalize "urn:ogc:def:crs:EPSG::4326" → "EPSG:4326"
  const match = /EPSG[:]?(\d+)/i.exec(name);
  if (match) return `EPSG:${match[1]}`;
  if (/wgs.?84/i.test(name)) return "EPSG:4326";
  return name;
}
