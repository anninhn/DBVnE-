# Phase 1 — GeoJSON Upload Validation

## Definition of Done

All must be true before spec này coi như xong (commit lên `main`).

### 1. Type check pass

`npx tsc --noEmit` — exit 0, không error. Cover:
- `src/lib/parse/geojson.ts` (file mới)
- `src/lib/ai/inspect.ts` (sửa)
- `src/lib/ai/dataset-reviewer.ts` (sửa)
- `src/lib/types/dataset.ts` (sửa)
- `src/components/upload/UploadDropzone.tsx` (sửa)
- `src/components/upload/UploadWizard.tsx` (sửa)
- `src/app/datasets/[slug]/R2FileViewer.tsx` (sửa)
- `src/app/api/upload/{analyze,commit}/route.ts` (sửa)

### 2. Dev server start

`npm run dev` — server start tại `localhost:3000` không crash. Navigate `/` render listing không error. Navigate `/upload` render wizard với dropzone hint mới ("CSV, XLSX, XLS, GeoJSON").

### 3. Upload GeoJSON end-to-end

Test với file GeoJSON thật (VN provinces/districts hoặc generated test file với ~10 features Polygon):

- `/upload` drop `.geojson` file → presign OK → R2 PUT HTTP 200
- `/api/upload/analyze` return JSON proposal có:
  - `proposal.metadata.title` (non-empty string)
  - `proposal.metadata.description` (non-empty, mention `feature_count` hoặc phạm vi geographic)
  - `proposal.metadata.tags[]` (≥1 tag)
  - `proposal.metadata.feature_count` (number > 0)
  - `proposal.metadata.geometry_type` (string, 1 trong 7 type)
  - `proposal.metadata.bbox` (array 4 numbers)
  - `proposal.metadata.crs` (string, "EPSG:4326")
  - `proposal.dictionary[]` với mỗi entry có `name` (property key), `type` (string/number/boolean), `description`
  - `proposal.questions[]` (có thể empty)
- Review step render MetadataEditor (prefill) + DictionaryEditor (prefill từ properties)
- User edit 1 dictionary entry description → Preview commit → YAML render có description mới
- Submit → HTTP 200 từ `/api/upload/commit` → redirect `/datasets/<slug>`
- Detail page metadata line: "N features • {geometry_type} • bbox: [...]"

### 4. Git state sau commit

- Repo có folder mới `datasets/<slug>/` với:
  - `metadata.yaml` — có fields `feature_count`, `geometry_type`, `bbox`, `crs` + `files[].r2_key`
  - `dictionary.md` — table 6 cột (Column|Type|Dec|Group|Unit|Description), rows = properties keys
- R2 bucket có object tại key `<fileId>/<filename>`
- Commit message "Upload dataset <slug>"

### 5. Preview GeoJSON trên detail

- Navigate `/datasets/<slug>` → Files tab
- Click "Xem trước" GeoJSON → R2FileViewer render table
- Columns = union `properties.keys()` từ features
- Rows ≤ 100 (preview cap)
- Numeric property có histogram trong column header
- Loading state "Đang tải file từ R2…" → 1-3s
- Error state: stop network giữa fetch → error message + "Tải về trực tiếp" link

### 6. Backward compatibility

- Existing CSV datasets (`/datasets/<existing-csv-slug>`) vẫn preview OK
- Upload CSV file qua wizard vẫn hoạt động đúng (tabular path unchanged)
- Upload XLSX file qua wizard vẫn hoạt động đúng

### 7. Format rejection (D3)

- Drop `.json` file (không phải `.geojson`) → dropzone reject với message "Chỉ hỗ trợ .geojson"
- Drop file `.txt` rename `.geojson` chứa "not a json" → `/api/upload/analyze` return error JSON có message "Invalid GeoJSON: ..."
- Drop GeoJSON có `"crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:EPSG::9393"}}` (VN-2000) → return error "Unsupported CRS: chỉ accept EPSG:4326"

### 8. Decision verification

- **D1**: Wizard 4 bước giữ nguyên (không skip DictionaryEditor cho GeoJSON)
- **D2**: Không có map render trên detail (chỉ table). Search "Leaflet" trong diff → không có import Leaflet
- **D3**: `UploadDropzone.tsx` `accept` không có `.json`, chỉ `.geojson`
- **D4**: `src/lib/parse/geojson.ts` dùng `JSON.parse`, không import library ngoài
- **D5**: `inspectGeoJson` có `STATS_FEATURE_CAP = 10000` const, iterate cap ở đó cho stats nhưng full count cho `featureCount`
- **D6**: `parseGeoJson` throw error nếu `crs` field khác EPSG:4326
- **D7**: File `tools/prompts/dataset-reviewer-geojson.md` tồn tại, có section "GeoJSON context"

## Not Required

- Không cần automated tests (spec manual verify đủ)
- Không cần browser screenshot — curl/log/visual check OK
- Không cần test file > 100MB (edge case, không phải Phase 1 scope)
- Không cần test 500MB file (limit check bằng `MAX_SIZE_BYTES` enough)
- Không cần perf benchmark — existing CSV preview pattern reuse
- Không cần test Phase 2 DuckDB query GeoJSON — Phase 2 scope
