# Changelog

Mọi thay đổi đáng chú ý của dự án. Format dựa [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased] — Phase 1 Dataset Hub (đang phát triển)

### 2026-07-24 — Article Linking feature (commit 728782f)

Attach VnExpress article URLs vào dataset cho reverse provenance — "dataset này đã được dùng trong bài báo nào".

**Why**: Data journalism cần track impact định tính. "Dataset sinh ra bài báo nào" quan trọng hơn "bao nhiêu lượt download" ở tòa soạn.

**New — ArticlesTab** (thay Community placeholder)
- `src/lib/articles/types.ts` — `ArticleEntry` interface (url, title, author?, published_at?, section?, thumbnail?, added_at, added_by)
- `src/lib/articles/og-fetch.ts` — `assertVnexpressUrl()` (hostname endsWith vnexpress.net) + `fetchOgMeta()` (cheerio, 8s timeout, custom UA, redirect check) + `ogMetaToArticle()`
- `src/app/api/dataset/articles/og/route.ts` — GET auth-gate, fetch OG tags server-side. Returns 200/400/401/422/502/504 theo error type
- `src/app/api/dataset/articles/route.ts` — POST validate + canonicalize URL (dedup) + audit `injectEdited()` summary `"Thêm bài báo: <title>"` + `commitMetadataYamlOnly()`
- `src/app/datasets/[slug]/ArticlesTab.tsx` — Client component. Paste URL → Enter → auto-fetch OG → auto-commit. Fallback title-only input khi OG fail. Card style VnExpress spotlight (thumbnail 120×72 trái, title serif hover `#087cce`, section tag đỏ `#A9324E` uppercase, "Added by {user} • {date}")

**Critical fix — `renderMetadataYaml` data loss**
- `src/lib/dataset-render.ts` thêm param `articles?: ArticleForRender[]` + `renderArticlesYaml()` helper. Render trước files section.
- `src/components/dataset/EditDatasetForm.tsx` truyền `initialMetadata.articles` — nếu không, edit metadata sẽ mất articles (function build YAML từ scratch).

**Sidebar consolidation — `MetadataSidebar.tsx`**
- Trước 4 card stacked (Downloads / Article Linking / Size / Source) → giờ 2 card:
  - **Usage** = Downloads + Articles (grid-cols-2 + vertical divider) — cùng phản ánh impact
  - **Details** = Source + Size + Files (Source group + divider + Size group) — cùng metadata tĩnh
- License ẩn: 7/7 dataset `internal`, không variation = không thông tin. Defer khi có public/restricted.

**Nav cleanup — `CatalogNav.tsx`**
- Remove HF mock tabs (Spaces / Tasks / Community)
- Add "Ask Me Anything" + badge "Coming soon" (disabled, tooltip) — placeholder cho Phase 2 (Discovery Chat) + Phase 3 (Q&A)

**Misc**
- `LoginForm.tsx` — remove "Session lưu vĩnh viễn" text
- `DatasetExplorer.tsx` — DatasetRow show "• N bài báo" khi `articles.length > 0`
- `commit.ts` — thêm `commitMetadataYamlOnly(slug, yaml, msg)` helper (chỉ commit metadata.yaml, không đụng dictionary.md)
- `package.json` — thêm `cheerio` (user-approved, 1st dep ngoài stack)

**Scope**: MVP add + display only. Edit/delete defer. URL scope `vnexpress.net` (accept subdomain). Permission: mọi user login được add vào bất kỳ dataset nào. Spec: `specs/2026-07-24-article-linking/`.

### 2026-07-24 — UX/UI tracking + listing polish

Auth nhẹ ship 2026-07-24 (commits 03865e8 + 05fe82f) thêm actor tracking vào metadata nhưng phần display chưa polish. Session này hoàn thiện UX/UI provenance + redesign listing cho readability.

**Why**: Journalistic provenance cần (1) hiển thị rõ ai edit khi nào, (2) timestamp chính xác không relative time mơ hồ, (3) listing dễ scan để phóng viên tìm dataset nhanh.

**New — Timeline `edits[]` History**
- `src/lib/types/dataset.ts` — thêm `EditEntry` type + `edits?: EditEntry[]` field
- `src/lib/datasets/read.ts` — `metadataToDataset()` expose `edits[]`; thêm `getMetadataYamlRaw()` helper
- `src/app/datasets/[slug]/MetadataSidebar.tsx` — `ActivityTimeline` component với vertical dots + connector line. Layout reverse-chrono (latest on top, convention GitHub/HF). Latest dot highlight `bg-hf-link`, older dots `bg-hf-text-muted`. Badge "Mới nhất" cho top entry khi >1 entry. Card split: "Source" (Source + License) + "Hoạt động" (timeline).

**Bug fix — edits[] bị reset mỗi lần edit**
- `EditDatasetForm.tsx` xây YAML mới từ scratch qua `renderMetadataYaml()` → không giữ `edits[]` → `injectEdited()` reset về 1 entry mỗi lần.
- Fix: edit route fetch existing metadata.yaml từ GitHub → `mergeAuthFields()` copy edits[]/last_edited_by/at/status/deleted_by/at sang client YAML → `injectEdited()` append vào history nguyên vẹn.
- `src/lib/auth/inject-actor.ts` — thêm `mergeAuthFields(clientYaml, existingYaml)` helper.
- Lưu ý: edit history đã mất trước fix KHÔNG recover qua app (chỉ trace qua git log).

**Display polish**
- `MetadataSidebar.tsx` — `formatTimestamp()`: absolute `dd/mm/yyyy, hh:mm` (giờ VN, `Asia/Ho_Chi_Minh`). Bỏ relative time ("2 ngày trước") vì journalism cần timestamp chính xác.
- `page.tsx` — header breadcrumb + H1 dùng `lookupDisplayName()` thay raw username. H1 đổi từ `owner/slug` → `dataset.title` (human-readable, Vietnamese).

**Listing redesign — `DatasetExplorer.tsx`**
- Tên dataset: `owner/slug` → `d.title` (truncate min-w-0)
- Icon theo preview type: Map (`MapPin` đỏ) / Table (`Table2` xanh) / File (`FileText` xám) — thay `FileSpreadsheet` generic
- Layout 2 dòng: title (primary) + metadata cluster (Updated • rows primary muted + files • size secondary faint)
- Bỏ badge text "Map/Table/File" — icon đã truyền đủ info

**Sidebar filter cleanup**
- Format filter: trước hardcoded `["csv","xlsx","parquet","pdf"]` + `onChange` noop (decorative) → functional với state riêng + count + chỉ hiện formats có dataset (count > 0)
- Tags: truncate first 8 + "Xem thêm N" button (expand/collapse). FilterCheckbox label truncate với `title` attr cho full text hover.
- Category: thêm `giao-duc` ("Giáo dục") vào vocab — có 1 dataset dùng category không hợp lệ trước đó

**Icon consistency** — `FilesTabContent.tsx`
- Đổi `FileSpreadsheet` → `Table2`, `Map as MapIcon` → `MapPin` để match list view. pdf/mp3 giữ riêng (FileText/FileAudio).

### 2026-07-23 — GeoJSON upload + Dataset card preview toggle (commit d326df2)

GeoJSON upload pipeline end-to-end + Dataset card UX cải tiến cho geospatial datasets.

**Why**: Map là view chính cho geospatial data — table không truyền tải ý nghĩa địa lý. Cần ship toggle Map/Table ở Dataset card giống Files tab, dictionary hiển thị độc lập với preview data, và table preview cho file GeoJSON lớn (>10MB) vốn bị SSR skip.

**New**
- `src/lib/parse/geojson.ts` — native parser (parseGeoJson, computeBbox, majorityGeometryType, extractCrs). Reject CRS khác WGS84, validate RFC 7946.
- `src/components/geo/` — `GeoJsonMap` (Leaflet ~40KB, CartoDB Positron grayscale), `GeoJsonMapLazy` (dynamic ssr:false), `DatasetGeoJsonPreview` (R2 fetch + render, `embedded` prop), `UploadWizardMapPreview` (wizard step 3)
- `src/app/datasets/[slug]/DatasetCardTabs.tsx` — wrapper toggle Map/Table cho GeoJSON datasets (default Map). Map lazy mount giữ state, table lazy mount tránh fetch lớn trên page load.
- `tools/prompts/dataset-reviewer-geojson.md` — prompt riêng cho AI reviewer khi format=geojson
- `specs/2026-07-23-geojson-upload/` — spec requirements/plan/validation

**Changed**
- `inspect.ts`: GeoJSON branch extract geometry_type/bbox/crs/feature_count
- `dataset-render.ts`: render geo fields vào metadata.yaml khi format=geojson
- `read.ts:withPreviewData`: handle GeoJSON ≤10MB (flatten features.properties); lớn hơn skip SSR
- `read.ts:mapFilesToResources`: populate feature_count/geometry_type/bbox/crs từ metadata
- `types/dataset.ts`: thêm geo fields optional
- `UploadWizard.tsx`: gửi geo fields qua commit, preview Leaflet map
- `R2FileViewer.tsx`: toggle Map/Table cho GeoJSON (giống DatasetCardTabs)
- `DataDictionary.tsx`: **decouple khỏi `resource.columns`** — fallback render dictionary trực tiếp khi SSR skip preview data
- `DatasetViewer.tsx`: **hybrid** — tự fetch client-side cho GeoJSON lớn khi structured_data rỗng, giữ đầy đủ features (search/pagination/resource/histograms). Controls padding fix.
- `page.tsx`: dùng `DatasetCardTabs` thay stacked map+table layout
- `package.json`: thêm `leaflet` + `@types/leaflet`

**Resilient**: `DatasetCardTabs` detect GeoJSON từ `resources[].file_type === "geojson"` OR `dataset.geometry_type` — xử lý metadata cũ thiếu geo fields (vd upload trước code geo-fields support được deploy).

### 2026-07-23 — Frictionless Data Table Schema (commit f6f3ca9)

Pivot decimal convention từ auto-normalize sang Frictionless Data Table Schema. Storage raw giữ nguyên, schema lưu trong dictionary, parser đọc schema.

**Why**: Auto-normalize mất raw gốc → vi phạm CLAUDE.md "Mỗi con số phải trace được nguồn". Frictionless là industry standard cho publishing platforms (CKAN, data.gov, OpenDataSoft).

**New**
- `src/lib/parse/number.ts` — `parseNumberWithSchema` + `formatNumberWithSchema` (Frictionless-compatible)
- `src/lib/parse/decimal-detect.ts` — `detectDecimalFormat` (regex majority vote per-column, skip ambiguous)

**Changed**
- Types: `DataDictionaryEntry` + `DictionaryForRender` + `AIProposal.dictionary` + `DictionaryEntry` thêm `decimal_char` + `group_char` optional
- `inspect.ts:inspectColumn` detect decimal format, re-compute min/max nếu vi format
- `column-stats.ts`: `numericStats` + `histogramBins` nhận optional `NumberSchema`
- `dataset-render.ts`: `renderDictionaryMarkdown` render 6 cột (Column|Type|Dec|Group|Unit|Description)
- `read.ts`: `parseDictionaryMarkdown` parser backward compat (4 hoặc 6 cột)
- `DictionaryEditor.tsx`: 2 dropdown Dec/Group, disabled cho non-number
- `dataset-reviewer.ts`: `trimmedInspection` gửi `decimalFormat` cho AI
- `tools/prompts/dataset-reviewer-tabular.md`: section mới Frictionless schema
- `DatasetViewer.tsx`: `ColumnDef.schema` build từ dictionary, pass xuống `NumericStats`/`Histogram`

**Display convention**: cell UI = RAW (publishing — user nhìn đúng những gì download). Stats UI = format vi-VN (presentation layer).

Resolves Phase 2 backlog #2A. See `memory/project_frictionless_schema_2026_07_23.md`.

### 2026-07-23 — Fix preview rounding (commit c2e8b0e)

**Fixed**
- `DatasetViewer.tsx:formatCell` bỏ `toLocaleString("vi-VN")` (mặc định max 3 decimal → mất precision). Cell CSV giữ nguyên string gốc; cell XLSX render qua `String(value)`.
- `R2FileViewer.tsx`: cùng pattern — hiển thị raw trực tiếp từ R2.
- Sửa silent bug `parseFloat("3,14") = 3` (vi decimal).

Sau đó sửa lại khi pivot Frictionless: cell luôn raw, không transform.

### 2026-07-10 — Phase 1 completion + polish (commit 08ed11a)

Hoàn thiện Phase 1: 4 features còn thiếu + perf fix + rebrand. All validation gaps resolved.

**Performance**
- CSV preview qua HTTP Range (1MB chunk) — detail page 23s → 2.3s cho file 153MB/1.58M rows
- `enrichRowCounts` size cap ≥10MB — skip download file lớn khi listing count rows
- RSC-safe XLSX cell coercion (`coerceCell`) — fix "Only plain objects can be passed to Client Components"

**Features**
- Wire-up "Search rows…" filter trong DatasetViewer (client-side, ≤1000 preview rows)
- CatalogNav: luôn hiển thị search box; detail page Enter → navigate `/?q=`
- Windowed pagination trong DatasetViewer — fix overflow khi nhiều pages
- row_count/columns_count persist vào metadata.yaml lúc upload + read-time fallback cho dataset cũ

**Changed**
- Rename "VNExpress" → "VnExpress" toàn bộ UI (8 instances, 6 files)
- Upload size limit 100MB → 500MB
- Formats pill wired to actual resource file_type (không hardcode "csv")
- "Từ điển dữ liệu" → "Data Dictionary"

### 2026-07-09 — Phase 1 production-ready (commits 5354573–b4f03df)

Source of truth chuyển sang GitHub Contents API + R2. Supabase drop hoàn toàn.

**Architecture**
- File-based: `datasets/<slug>/metadata.yaml` qua GitHub Contents API (authoritative, không CDN stale)
- R2 public access enabled — object URL thay vì Supabase Storage
- Dynamic SSR (`force-dynamic`) cho mọi page fetch external data — tránh Vercel cache 404

**Shipped**
- Search adapter: SimpleFilterAdapter, token-AND + diacritics-insensitive
- Pagination (PAGE_SIZE=20) trong DatasetExplorer
- R2 file viewer: CSV/XLSX/PDF/MP3, native CSV parser (no papaparse)
- Edit/Delete dataset: EditDatasetForm (metadata-only), DeleteDatasetButton (dev-only)
- Editable slug trong upload wizard (auto-fill + server conflict resolve)
- `tools/cleanup-orphans.mjs` — sync GitHub metadata vs R2 objects

**Bug fixes**
- 404 sau upload (force-dynamic + Contents API)
- Search diacritics + token-AND match
- Delete tree items thiếu mode + type
- Stale listing (list.ts no-store)

### 2026-07-03 — Upload Wizard MVP / re-arch (commits a29816f–20e272d)

Pivot từ PostgreSQL → file-based + R2 + AI-assisted upload. Constitution update.

**Added**
- Upload Wizard: drag-and-drop CSV/XLSX → R2 upload → AI inspect (metadata + dictionary) → preview commit → GitHub Contents API
- AI naming neutral: `AI_BASE_URL`/`AI_MODEL`/`AI_ENV_VAR` consts (swap provider không đổi code)
- CORS R2 config cho localhost + vercel.app
- r2Key validation: UUID/filename pattern

### 2026-06-24 — Dataset Catalog (commits 0757032–5e31495)

Wire frontend mock → real data + viewer improvements.

### 2026-06-23 — HF Frontend Demo (mock data)

Triển khai giao diện HF-style — **chỉ frontend, mock data, không đụng DB/API**.
Bản sao của `prototype/hf-clone.html` (đã duyệt) → React + Tailwind v4. Mục đích: chốt
hướng UI trước khi migrate dữ liệu thật. Xem `specs/2026-06-23-hf-frontend-demo/`.

**Added**
- Design tokens HF trong `globals.css` qua Tailwind v4 `@theme` (colors + fonts)
- Google Fonts (Source Sans 3 + IBM Plex Mono) qua `<link>` trong `layout.tsx`
- Mock data `src/lib/mock/datasets.ts` — 5 datasets, hero là "Hồ sơ 34 tỉnh thành 2025"
- Listing `/` HF compact-row style (`DatasetExplorer.tsx`) + sidebar filters + sort
- Detail `/datasets/[slug]` HF layout: header `org/name`, metadata pills, 3 tabs
- **DatasetViewer** — dataset viewer với mini charts:
  - Histogram (numeric) + proportion bar (categorical), inline SVG, không dependency
  - Type badges + `min → max` / `N giá trị`
  - Resource dropdown (KHÔNG train/test split)
  - Pagination + "End of preview"
- `MetadataSidebar` — Tải về / Quy mô / Nguồn gốc
- Prototype `prototype/hf-clone.html` (giữ làm reference / ground truth)

**Changed**
- Listing: card grid → compact rows (HF style)
- `datasets.ts`: gỡ `quality_score`/`quality`/`last_verified_at`, thêm `downloads`/`likes`
- `page.tsx` (home): rewrite từ entity-grouped sang HF dataset listing

**Removed**
- `src/components/DatasetCard.tsx` (thay bằng compact rows)
- `src/app/datasets/[slug]/DataTable.tsx` (thay bằng DatasetViewer)
- Chất lượng box khỏi sidebar (HF không có concept này)
- VNE color palette (thay bằng HF tokens)

**Không đụng** — tất cả `/api/*`, `/entities/[id]`, `/upload`, DB schema, SQL/Python scripts.

> ⚠️ **Demo**: chưa kết nối Supabase. Data từ mock file. Khi migrate thật: tạo bảng
> `datasets`/`resources`/`data_dictionary`/`upload_log` (theo `tech-stack.md`), seed
> 34-tinh data, thay mock import bằng Supabase query. UI đã structured đọc từ `Dataset`
> type khớp schema đó.

### 2026-06-09 — Redefinition: 34 Tỉnh wiki → VNExpress Data Platform

Scope mở rộng từ "34 Tỉnh wiki" thành "VNExpress Data Platform" — mọi dataset tòa soạn.
3 phases: hub → query → intelligence. Thêm data quality, provenance, RAG roadmap.

### 2026-06-08 — Wiki infrastructure

Next.js 15 + Tailwind + Supabase. DB schema entity-centric (`entities_catalog`,
`resources`, `resource_versions`, `indicator_metadata`, `tags`). API + `/entities/[id]`
page + `/upload` form.

### 2026-05-09 — Initial: 34 Tỉnh dataset

Khởi tạo dataset lõi 34 tỉnh thành. Database schema + seed data.
