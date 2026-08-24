# Phase 1 — GeoJSON Upload Requirements

## Scope

Mở rộng upload wizard để accept **GeoJSON single-file** (.geojson, max 500MB) — đóng gap Phase 1 backlog #1A. Tabular (CSV/XLSX/XLS) đã ship; GeoJSON là format geospatial duy nhất Phase 1.

**Deliverables**:

### Wizard flow (4 bước, reuse pattern tabular)

1. **Drop** — `.geojson` file, max 500MB, presigned URL upload thẳng R2 (giống tabular)
2. **AI analyze** — server fetch file → `JSON.parse` → inspect (feature_count, geometry_type, bbox, crs, properties sample) → AI propose metadata + dictionary (columns = `feature.properties.keys()` union)
3. **Review** — `MetadataEditor` + `DictionaryEditor` prefill từ AI proposal. Dictionary entries = property columns, editable description/unit/type. User confirm.
4. **Preview commit** — show YAML + markdown preview, commit metadata.yaml + dictionary.md qua git

### Inspect layer (server-side, native JSON.parse)

- `detectFormat` nhận `.geojson` extension
- `inspectGeoJson(buffer, filename)` → `FileInspection` với fields:
  - `featureCount`: số features (cap compute stats ở 10000 features để tránh OOM)
  - `geometryType`: majority vote (Point | LineString | Polygon | MultiPoint | MultiLineString | MultiPolygon | GeometryCollection)
  - `bbox`: `[minLng, minLat, maxLng, maxLat]` compute từ tất cả features
  - `crs`: đọc từ `crs` field, default `EPSG:4326`
  - `columns`: union `properties.keys()` across features (sample first 1000 features), inferred type (string/number/boolean/null)
  - `sampleRows`: first 10 features' properties (cho AI context)
  - `columnStats`: per-property stats (distinct values, min/max/segments) — reuse `column-stats.ts` với rows = `features.map(f => f.properties)`

### Dictionary handling

- `DictionaryEditor` reuse 100% — prefill entries từ `columns[]` (property keys)
- 6 cột Frictionless schema giữ nguyên (Column|Type|Dec|Group|Unit|Description)
- `decimal_char`/`group_char` auto-detect apply cho numeric properties (reuse `detectDecimalFormat`)
- Save `dictionary.md` cùng format tabular

### Metadata fields auto-computed (per `tech-stack.md` lines 366-372)

```yaml
feature_count: 34
geometry_type: "Polygon"     # majority vote
bbox: [102.1, 8.2, 109.5, 23.4]
crs: "EPSG:4326"
```

Lưu trong `metadata.yaml` top-level (không trong `files[]`).

### AI prompt — GeoJSON variant

- File mới: `tools/prompts/dataset-reviewer-geojson.md`
- Structure giống tabular prompt: Vietnamese-first, metadata + dictionary + questions output
- Context sent: filename, feature_count, geometry_type, bbox, crs, properties sample + columnStats
- Hint cho AI: "feature properties là attributes của geometry objects (vd: province name, population, area)"

### Preview trên detail page

- `R2FileViewer` thêm nhánh GeoJSON: fetch `.geojson` từ R2 public URL → `JSON.parse` → render table từ `features[].properties` (cap 100 rows preview)
- Histogram cho numeric properties (reuse `column-stats` + `Histogram` component)
- Map render **defer** (cần Leaflet/MapLibre library + UX decision cho lần sau)
- Loading/error/empty states giống CSV/XLSX

## Out of Scope

- **Map render** (Leaflet/MapLibre) — defer. Preview chỉ table.
- **Multi-file upload** (wizard nhận nhiều file cùng lúc) — defer phase sau. Wizard vẫn single-file.
- **Add-file-to-existing-dataset** (1B) — defer. Mỗi GeoJSON upload = dataset mới.
- **Companion formats** (SHP ZIP bundle, KML, GPKG) — defer phase sau.
- **`.json` generic structure-check** — chỉ accept `.geojson` extension strict.
- **GeoJSON with embedded CRS khác WGS84** — auto-reproject defer. Hiện chỉ accept WGS84, reject với error rõ nếu CRS khác (rare).
- **Topology validation** (self-intersecting polygons, etc.) — defer. Chỉ parse structure.
- **GeometryCollection nesting** — accept như 1 feature type, không decompose.
- **Vector tiles / GeoJSON streaming** cho file rất lớn — defer. 500MB GeoJSON ~5M points là edge case hiếm.

## Decisions

### D1 — Wizard 4 bước, reuse DictionaryEditor

**Quyết định**: GeoJSON wizard giữ 4 bước như tabular. DictionaryEditor prefill từ `feature.properties.keys()` union, user edit được.

**Why**:
- UX nhất quán — user đã quen workflow tabular
- Properties GeoJSON thực chất là "tabular data embedded in geometry" — reuse dictionary logic tự nhiên
- Save code — không maintain 2 wizard variants

**Trade-off**: User có thể thấy "dictionary" hơi kỳ cho GeoJSON (thường gọi là "attribute table"). Acceptable — terminology alignment dễ hơn duplicate UI.

### D2 — Map render defer, chỉ table preview

**Quyết định**: Detail page preview GeoJSON = table từ `features[].properties`. Map render defer.

**Why**:
- Map cần Leaflet (~40KB) + tile provider decision (OSM/CartoVN?) + popup UX — scope lớn
- Table preview đủ cho "xem nhanh nội dung" use case Phase 1
- Khi user complaint hoặc có use case thật → build map với context thực tế

**Trade-off**: GeoJSON không "trực quan" như tên gọi. User phải download + mở QGIS/Leaflet riêng để xem map.

### D3 — Strict .geojson extension, 500MB max

**Quyết định**: Chỉ accept `.geojson`. Không nhận `.json` generic. Size limit 500MB giữ nguyên.

**Why**:
- `.json` generic có thể là gì cũng được — structure-check phức tạp, dễ confuse user
- Đa số tool export GeoJSON dùng extension `.geojson`
- 500MB đủ cho boundary data VN toàn quốc (provinces/districts/wards)

**Trade-off**: User có file `.json` thực chất là GeoJSON → phải rename. Minor friction.

### D4 — Native JSON.parse, validate FeatureCollection

**Quyết định**: Parse bằng `JSON.parse(buffer.toString('utf-8'))`. Validate `type === "FeatureCollection"` và có `features[]` array. Throw error rõ nếu structure sai.

**Why**:
- `JSON.parse` native, fast, không dependency
- GeoJSON là JSON — không cần library ngoài
- Validate structure để catch file hỏng sớm (vd: user đổi tên .txt thành .geojson)

**Trade-off**: Không có streaming parser — 500MB GeoJSON sẽ load full vào memory (~1-2GB heap khi parse). Acceptable cho Phase 1 server-only inspect. Nếu sau này gặp OOM → streaming parser (JSONStream/oboe).

### D5 — Bbox + geometry_type computed bằng iteration

**Quyết định**: Compute `bbox` và `geometry_type` bằng iterate tất cả features. `bbox` từ min/max coordinates, `geometry_type` majority vote.

**Why**:
- GeoJSON spec không yêu cầu `bbox` top-level — phải compute
- Majority vote cho `geometry_type` đúng với mixed-geometry files (vd: MultiPolygon dominant + vài Polygon)
- Cap iterate ở 10000 features cho stats (full iterate cho feature_count)

**Trade-off**: File rất lớn (1M+ features) inspect chậm hơn. Cap 10000 giữ dưới 5s.

### D6 — CRS default WGS84, reject nếu khác

**Quyết định**: Default `EPSG:4326` (WGS84). Nếu file có `crs` field declare CRS khác → throw error "Unsupported CRS — chỉ accept WGS84 (EPSG:4326). Vui lòng reproject trước khi upload."

**Why**:
- WGS84 là web standard (Leaflet/MapLibre/D3) — default GeoJSON per RFC 7946
- Reproject trong app cần `proj4js` dependency — defer
- Đa số GeoJSON export tool default WGS84

**Trade-off**: User có GeoJSON VN-2000 (EPSG:9393) phải reproject ngoài. Rare trong newsroom use case.

### D7 — AI prompt GeoJSON variant riêng

**Quyết định**: Tạo `tools/prompts/dataset-reviewer-geojson.md` riêng, không reuse tabular prompt.

**Why**:
- GeoJSON context khác tabular — properties = attributes của geometry, không phải standalone columns
- AI cần hint "feature_count + geometry_type quan trọng cho description" (vd: "34 tỉnh thành" thay vì "34 rows")
- Source hint khác: GeoJSON thường từ OpenStreetMap, Mã VLUT, official portal

**Trade-off**: 2 prompt files để maintain. Acceptable vì format semantics khác.

## Context

**Tại sao spec này tồn tại**: Phase 1 đã ship tabular upload (CSV/XLSX/XLS) commit `08ed11a`. Phase 1 backlog #1A (memory `project_phase2_backlog_2026_07_16.md`) chốt 2026-07-23 thu hẹp chỉ còn GeoJSON — PDF/MP3 defer Phase 3, multi-file defer phase sau. GeoJSON là format geospatial duy nhất Phase 1, cần cho use case "ranh giới hành chính", "điểm dịch vụ", "vùng phủ sóng" etc.

**Constraint**:
- Branch `main` (main-only workflow per memory `project_phase1_production.md`)
- Tiếng Việt trong code comments và UI text
- Không thêm dependency mới — `JSON.parse` native thay geojson-parser library
- AI naming neutral (`AI_BASE_URL`/`AI_MODEL`/`AI_ENV_VAR` swap-able, không declare Gemini/Claude)
- "VnExpress" camelCase trong UI text

**Proves**:
- Phase 1 fully covers "dataset = tabular + geospatial" scope (roadmap 2026-07-23)
- Upload wizard extensible cho non-tabular format (foundation cho PDF/MP3 Phase 3)
- GeoJSON preview via table — enough cho Phase 1 demand discovery (browse/read metadata + properties)

## Stakeholder Notes

- **Ninh (Data Journalist)**: Cần upload GeoJSON boundaries (provinces/districts) cho article maps. Power user — download GeoJSON + integrate riêng với QGIS/JS library. Table preview đủ để verify content.
- **Minh (Editor)**: Browse catalog thấy GeoJSON dataset → hiểu scope qua feature_count + geometry_type. Không cần render map trong platform.
- **Hoa (Reporter)**: Phase 2+ persona. Không upload. Có thể download GeoJSON cho bài viết có map embed (Phase sau).
