# Changelog

Mọi thay đổi đáng chú ý của dự án. Format dựa [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased] — Phase 1 Dataset Hub (đang phát triển)

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
