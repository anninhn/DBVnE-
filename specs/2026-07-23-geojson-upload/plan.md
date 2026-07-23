# Phase 1 — GeoJSON Upload Plan

5 groups, implement tuần tự (data → AI → wizard → preview → verify). Group 5 verify chạy sau khi 4 group merge.

**Spec reference**: requirements.md decisions D1-D7, validation.md check groups.

## Group 1 — Format detection + GeoJSON parser

1. Update `src/lib/ai/inspect.ts`:
   - Đổi type `TabularFormat = "csv" | "xlsx"` → thêm `"geojson"`. Rename thành `InspectionFormat` (hoặc giữ `TabularFormat` + comment).
   - Update `detectFormat` (line 58-62): thêm `if (lower.endsWith(".geojson")) return "geojson";`
   - Update `inspectFile` switch (line ~435-441): thêm case `"geojson" → inspectGeoJson(buffer, filename)`

2. Tạo `src/lib/parse/geojson.ts`:
   ```typescript
   export type GeoJsonGeometryType =
     | "Point" | "LineString" | "Polygon"
     | "MultiPoint" | "MultiLineString" | "MultiPolygon"
     | "GeometryCollection";

   export interface GeoJsonInspection {
     featureCount: number;
     geometryType: GeoJsonGeometryType | null;  // majority vote, null nếu rỗng
     bbox: [number, number, number, number] | null;  // [minLng, minLat, maxLng, maxLat]
     crs: string;  // "EPSG:4326" hoặc reject
     columns: { name: string; type: "string" | "number" | "boolean" | "null" }[];
     sampleRows: Record<string, unknown>[];  // first 10 features' properties
   }

   export function parseGeoJson(buffer: Buffer): GeoJSON.FeatureCollection
   // JSON.parse + validate type==="FeatureCollection" + features[]

   export function inspectGeoJson(buffer: Buffer): GeoJsonInspection
   // featureCount, geometryType (majority vote, cap 10000 features),
   // bbox (min/max lng/lat traverse all coords), crs (reject nếu khác 4326),
   // columns (union properties.keys, infer type), sampleRows (first 10)

   // Helper: computeBbox(features), majorityGeometryType(features), inferPropertyColumns(features)
   // Cap stats iterate ở 10000 features (STATS_FEATURE_CAP), full count cho featureCount
   ```

3. Update `src/lib/ai/inspect.ts`:
   - Import `inspectGeoJson` từ `parse/geojson.ts`
   - Thêm function `inspectGeoJsonFile(buffer, filename)` wrap → return `FileInspection` (reuse type hiện tại, thêm optional fields `feature_count`/`geometry_type`/`bbox`/`crs`)
   - Map GeoJson properties sample → `sampleRows` (convert objects sang row format nếu cần)

4. Update `src/lib/types/dataset.ts`:
   - Thêm optional fields vào `FileInspection` (hoặc type tương đương):
     - `feature_count?: number`
     - `geometry_type?: string`
     - `bbox?: [number, number, number, number]`
     - `crs?: string`

## Group 2 — Metadata schema + commit

5. Update `src/lib/types/dataset.ts`:
   - Thêm optional fields vào `MetadataYaml` (hoặc tương đương — check existing type):
     - `feature_count?: number`
     - `geometry_type?: string`
     - `bbox?: [number, number, number, number]`
     - `crs?: string`

6. Update `src/app/api/upload/analyze/route.ts` (hoặc tương đương):
   - Branch theo `format` từ inspection: nếu `"geojson"` → populate `feature_count`, `geometry_type`, `bbox`, `crs` vào response
   - Include inspection JSON trong AI prompt payload

7. Update `src/app/api/upload/commit/route.ts`:
   - Khi serialize metadata.yaml, include `feature_count`/`geometry_type`/`bbox`/`crs` nếu format geojson
   - Dictionary.md format giữ nguyên (6 cột Frictionless) — columns từ properties.keys()

## Group 3 — AI prompt + reviewer branch

8. Tạo `tools/prompts/dataset-reviewer-geojson.md`:
   - Structure giống `dataset-reviewer-tabular.md` (Vietnamese-first, metadata + dictionary + questions output)
   - Section "QUAN TRỌNG — GeoJSON context":
     - Properties = attributes của geometry objects (vd: province name, population, area)
     - `feature_count` + `geometry_type` quan trọng cho description (vd: "34 tỉnh thành" thay vì "34 rows")
     - `bbox` cho coverage geographic
   - Source hints: OpenStreetMap, Mã VLUT, official portal (vd: open.gso.gov.vn, open.tphcm.gov.vn)
   - Dictionary: type per property (string/number/boolean), decimal_char/group_char cho numeric, unit (vd: "người", "km²", "VND")
   - Output JSON schema giống tabular (metadata + dictionary + questions)

9. Update `src/lib/ai/dataset-reviewer.ts`:
   - Branch chọn prompt theo format: csv/xlsx → tabular prompt, geojson → geojson prompt
   - Send inspection JSON khác theo format:
     - tabular: columns + sampleRows + columnStats
     - geojson: feature_count + geometry_type + bbox + crs + columns (properties) + sampleRows + columnStats
   - Response schema AIProposal giữ nguyên (metadata + dictionary + questions) — dictionary entries = property columns

## Group 4 — Wizard integration

10. Update `src/components/upload/UploadDropzone.tsx`:
    - `ALLOWED_EXTS` (line 8): thêm `".geojson"`
    - `accept` attribute (line 106): thêm `.geojson`
    - UI hint (line 134): "Hỗ trợ: CSV, XLSX, XLS, GeoJSON • Tối đa 500MB"

11. Update `src/components/upload/UploadWizard.tsx`:
    - State `format` (line ~19) widen: `"csv" | "xlsx" | "geojson"`
    - Workflow 4 bước giữ nguyên — không conditional step
    - DictionaryEditor prefill hoạt động tự nhiên nếu `dictionary[]` populated từ AI proposal (properties schema)

12. Update `src/components/upload/DictionaryEditor.tsx` (nếu cần):
    - Confirm works với properties columns (semantics giống tabular)
    - Test: type "string"/"number"/"boolean" từ GeoJSON infer → dropdown type phải có các options này

## Group 5 — Detail page preview

13. Update `src/app/datasets/[slug]/R2FileViewer.tsx`:
    - Detect format từ `resource.file_type` hoặc filename extension
    - Thêm nhánh GeoJSON:
      - `fetch(resource.file_url)` → `text()` → `JSON.parse`
      - Cap first 100 features
      - Render table: rows = features, columns = union `properties.keys()`
      - Reuse `parseCSV`/coerceCell pattern cho RSC-safe (Date/object → primitive)
      - Histogram cho numeric properties (reuse `column-stats` + `Histogram`)
    - Loading/error states giống CSV/XLSX (R2 unreachable, file corrupt, 0 features)
    - Geometry coordinates **không render** — chỉ properties table (map defer D2)

14. Update `src/app/datasets/[slug]/FilesTabContent.tsx` (nếu cần):
    - Verify GeoJSON icon đã có (per memory backlog line 17-29)
    - Click "Xem trước" GeoJSON file → render R2FileViewer nhánh geojson

15. Update `src/app/datasets/[slug]/page.tsx`:
    - Render metadata line: nếu GeoJSON, hiển thị "N features • {geometry_type} • bbox: [minLng, minLat, maxLng, maxLat]"
    - Tương tự "X rows × Y cols" của tabular

## Group 6 — Verify

16. Run `npx tsc --noEmit` — exit 0. Cover tất cả files mới/sửa.

17. Run `npm run dev` — server start tại `localhost:3000` không lỗi. Navigate `/` render listing không crash.

18. Test upload GeoJSON flow end-to-end:
    - Navigate `/upload` → drop `.geojson` file (test với VN provinces file nếu có, hoặc generate test file)
    - Verify presign + R2 PUT OK (status 200)
    - Verify `/api/upload/analyze` return proposal có:
      - `metadata.title`, `metadata.description`, `metadata.tags[]`
      - `metadata.feature_count`, `metadata.geometry_type`, `metadata.bbox`, `metadata.crs`
      - `dictionary[]` với entries từ properties.keys()
    - Verify Review step render MetadataEditor + DictionaryEditor prefill
    - Edit dictionary description của 1 property → Preview commit → verify YAML có description mới
    - Submit → redirect `/datasets/<slug>` → metadata line hiển thị feature_count + geometry_type

19. Test preview GeoJSON trên detail:
    - Navigate `/datasets/<slug>` (vừa upload)
    - Files tab → click "Xem trước" → R2FileViewer render table
    - Verify columns = properties.keys() union, rows ≤ 100
    - Verify numeric properties có histogram
    - Test error state: tắt network → click "Xem trước" khác → error message + fallback download link
    - Test empty: tạo dataset mock với GeoJSON rỗng (`features: []`) → message "Dataset này chưa có feature"

20. Test format rejection:
    - Drop `.json` file (không phải `.geojson`) → reject "Unsupported format"
    - Drop `.txt` đổi tên `.geojson` chứa text không phải JSON → `/api/upload/analyze` throw error rõ "Invalid GeoJSON: missing features[]"
    - Drop GeoJSON có `crs` field khác EPSG:4326 → throw error "Unsupported CRS"

21. Test partial-failure:
    - Analyze fail: simulate AI provider error → error message hiển thị, không crash wizard
    - Commit fail: tắt network giữa commit → error message, vẫn ở step preview, không redirect

22. Verify backward compatibility:
    - Existing CSV/XLSX datasets vẫn preview OK (R2FileViewer nhánh csv/xlsx không đổi)
    - Upload CSV/XLSX vẫn hoạt động (wizard tabular path unchanged)
