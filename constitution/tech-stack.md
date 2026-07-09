# VNExpress Data Platform — Tech Stack

## System Design

Dataset catalog + query + intelligence platform cho tòa soạn VNExpress, xây dựng incremental qua 3 phases. **Re-architected 2026-07-02**: Phase 1 chuyển từ PostgreSQL-centric sang file-based + AI-assisted upload trên UI.

```
Phase 1: Next.js (catalog static + upload dynamic) + Cloudflare R2 (file storage) + GitHub repo (metadata) + Claude API (upload AI assist)
Phase 2: + DuckDB (query parquet from R2 directly) → Promote popular to PostgreSQL (optional)
Phase 3: + RAG Pipeline (pgvector hoặc separate vector store) + Claude API
```

**Tool nội bộ, không public**: không ưu tiên SEO, không cần auth phức tạp, không cần scale massively.

**Storage principle**: tách rõ 2 loại storage theo tính chất data:
- **Metadata + dictionary + tags + README** (text, nhẹ) → **GitHub repo** — git history = provenance
- **Raw files** (CSV/XLSX/Parquet/PDF/MP3/GeoJSON binary, bất kỳ size) → **Cloudflare R2** — zero egress, presigned URL upload

## Phase 1 Stack (re-architected 2026-07-02)

```
Framework:       Next.js 15 (App Router) — GIỮ từ F1 hiện tại
Catalog:         Dynamic SSR runtime — fetch metadata.yaml từ GitHub raw mỗi request
                 (force-dynamic + revalidate 60s). Không SSG, không Vercel rebuild
                 khi upload dataset mới.
Upload:          Dynamic page + API Route với presigned URL pattern
Metadata store:  GitHub repo (text files: metadata.yaml, dictionary.md) — commit qua
                 Octokit REST API từ server sau khi user confirm trong wizard
Tags:            Hardcoded controlled vocabulary trong src/lib/tags.ts (PostgreSQL
                 tags table đã drop 2026-07-09)
File store:      Cloudflare R2 (binary files: CSV, XLSX, Parquet, PDF, MP3, GeoJSON)
                 - Zero egress, free 10GB tier
                 - Browser upload trực tiếp qua presigned URL (không qua Vercel)
                 - Object Versioning chưa GA → sha256 (ChecksumMode=ENABLED) là
                   primary atomic reference; version_id optional
Search:          Pagefind (built vào static catalog) hoặc client-side flexsearch
Data Preview:    Client-side render, fetch file trực tiếp từ R2 URL
Tracking:        Plausible (self-host hoặc $9/mo cloud) hoặc Umami (free self-host)
AI Upload:       OpenAI-compatible API (default Gemini 2.5 Flash, swap qua 3 env vars)
Hosting:         Vercel (đã deploy F1) hoặc Cloudflare Pages
```

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 15 (App Router) | Đã có F1 codebase, giữ; dynamic SSR cho catalog + API route cho upload |
| Language | TypeScript | Type safety |
| Source of truth | Git (GitHub) | Version control miễn phí, provenance tự động qua git history (không cần `upload_log` table) |
| Metadata format | YAML + Markdown (format-aware templates) | Đơn giản, human-readable; **template khác nhau theo file type** |
| Data format | **Giữ nguyên gốc** user upload — CSV, XLSX, Parquet, PDF, MP3, GeoJSON. Không ép convert | Tòa soạn VnExpress chủ yếu CSV + XLSX + PDF; converting = friction |
| Catalog search | Pagefind hoặc flexsearch | Built-in static site search, không cần backend |
| Tracking | Plausible / Umami | Privacy-friendly, đơn giản, không cần DB |
| AI assist | Claude API (Anthropic) | Phân tích file → propose metadata (template theo format) |
| Hosting | Vercel | Đã setup F1, auto-deploy từ git push |
| Pipeline | Python 3 + pandas (cho script migration) | Parse file cũ |

### Format support matrix

| Format | Lưu trữ | Data Preview | DuckDB query (Phase 2) | AI Reviewer hành vi |
|--------|---------|--------------|------------------------|---------------------|
| **CSV / TSV** | ✅ Nguyên gốc | ✅ Table + histogram | ✅ Native | Inspect columns + sample → metadata + dictionary |
| **XLSX** | ✅ Nguyên gốc | ✅ SheetJS render | ✅ Native | Inspect sheets + columns → metadata + dictionary |
| **Parquet** | ✅ Nguyên gốc | ✅ DuckDB-WASM | ✅ Native (best perf) | Inspect schema → metadata + dictionary |
| **PDF** | ✅ Nguyên gốc | ⚠️ Extract text + first page render | ❌ Extract tables ra CSV trước | Extract text → metadata + key_findings (**không dictionary**) |
| **MP3** | ✅ Nguyên gốc | ⚠️ Waveform + playback | ❌ Không áp dụng | Chỉ metadata cơ bản (Whisper transcript ở Phase 3) |
| **GeoJSON** | ✅ Nguyên gốc | ✅ Map render | ⚠️ Spatial extension | Inspect properties → metadata + light properties schema |

**Bắc star thiết kế**: mỗi metadata field phải serve 1 trong 3 mục đích:
1. **Query**: search/filter/find (title, tags, category, source, key_findings)
2. **Preview**: render mà không cần download (file_format, row_count, geometry_type, page_count)
3. **Quick understanding**: grasp nội dung mà không mở file (description, key_findings, methodology, coverage)

Field nào không serve 1 trong 3 → không capture.

### Tại sao không PostgreSQL cho Phase 1?

| Việc Phase 1 cần | PostgreSQL | Files + git |
|---|---|---|
| Lưu metadata dataset | ✅ | ✅ YAML |
| Lưu data dictionary | ✅ | ✅ Markdown |
| Lưu raw data | ⚠️ JSONB hoặc link R2 | ✅ File trực tiếp |
| Browse catalog | ✅ | ✅ Static site |
| Search | ✅ LIKE query | ✅ Pagefind |
| Filter tag/category | ✅ WHERE | ✅ Build-time group hoặc client-side |
| Sort by popularity | ✅ ORDER BY | ✅ Đọc analytics API |
| **Provenance** (ai, khi nào) | ⚠️ `upload_log` table (reimplement git) | ✅ **git history — mạnh hơn** |
| Schema migration | ❌ Mỗi thay đổi = SQL migration | ✅ Không cần |

PostgreSQL chỉ trả giá (pay off) ở Phase 2 (cross-dataset SQL query, concurrent writes từ nhiều user, high-volume transactions). Phase 1 không có requirement nào trong đó.

## Upload Flow — UI đa bước với AI Assist (key innovation)

**Yêu cầu**: Upload là web UI feature, không phải CLI. User drag-and-drop file → browser upload thẳng lên R2 qua presigned URL (không qua Vercel serverless) → server fetch file từ R2 để analyze → frontend guide user review/edit metadata + (nếu tabular) dictionary → user OK hết → server commit metadata vào GitHub.

**Presigned URL pattern là bắt buộc** — Vercel serverless có body size limit (~4.5 MB hobby, 5-50 MB Pro). Dataset thật có thể 50-200 MB (XLSX niên giám, PDF báo cáo). Browser upload trực tiếp lên R2 = không giới hạn size, không tốn Vercel bandwidth.

**Flow cụ thể thay đổi theo format**:
- **Tabular** (CSV/XLSX/Parquet): inspect columns + sample rows → propose metadata + dictionary
- **PDF**: extract text → propose metadata + key_findings (NO dictionary section)
- **MP3**: chỉ metadata cơ bản (duration, participants optional) — không AI analysis sâu (Phase 3 Whisper transcript sau)
- **GeoJSON**: inspect properties schema → propose metadata + light properties dictionary

Ví dụ dưới đây là cho **tabular** (phổ biến nhất). PDF/MP3/GeoJSON tương tự nhưng bỏ phần dictionary.

```
┌─ Bước 1: Drag & drop ─────────────────────────┐
│  Upload page (/upload)                         │
│  ┌──────────────────────────────────────────┐  │
│  │   📁 Kéo thả file vào đây                 │  │
│  │      hoặc [Chọn file]                     │  │
│  │                                            │  │
│  │   Hỗ trợ: CSV, XLSX, Parquet, PDF, MP3    │  │
│  │   Không giới hạn size (upload thẳng R2)    │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                     ↓
┌─ Bước 2: Presigned URL + R2 upload ───────────┐
│  POST /api/upload/presign (Next.js API route) │
│    → trả { presignedUrl, r2Key, fileId }       │
│                                                 │
│  Browser PUT file → presignedUrl (R2 direct)   │
│    (không qua Vercel, không giới hạn size)     │
└─────────────────────────────────────────────────┘
                     ↓
┌─ Bước 3: Backend analyze ──────────────────────┐
│  POST /api/upload/analyze (gửi fileId)         │
│                                                 │
│  Server side:                                   │
│  1. Fetch file từ R2 (private, server-only)    │
│  2. Inspect: columns, dtypes, sample rows,     │
│     basic stats (min/max/unique/null count)    │
│  3. Call Claude API với "Dataset Reviewer"     │
│     subagent system prompt + inspection JSON   │
│  4. Return proposal JSON cho frontend          │
│  (File vẫn nằm trong R2 — staged, chưa commit) │
└─────────────────────────────────────────────────┘
                     ↓
┌─ Bước 4: Review UI (FRONTEND GUIDE USER) ──────┐
│  /upload/preview (cùng page, đổi state)        │
│                                                 │
│  ┌─ File info ──────────────────────────────┐  │
│  │ grdp_2024.csv • 34 rows × 5 cols • 2 KB  │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌─ Data preview (first 10 rows) ───────────┐  │
│  │ | tinh      | grdp_2024 | growth | ...   │  │
│  │ | Hà Nội    | 150000000 | 7.5    | ...   │  │
│  │ | ...       | ...       | ...    | ...   │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌─ 🤖 AI-proposed metadata (EDIT ĐƯỢC) ────┐  │
│  │ Title:       [GRDP 34 tỉnh 2024       ]  │  │
│  │ Description: [Tổng hợp GRDP 2024...   ]  │  │
│  │ Category:    [kinh-te ▾]                  │  │
│  │ Tags:        [kinh-te] [grdp] [+]         │  │
│  │ Source:      [GSO (inferred) ▾]           │  │
│  │ Source URL:  [https://gso.gov.vn/...  ]  │  │
│  │ Confidence:  🟢 High / 🟡 Medium / 🔴 Low│  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌─ 🤖 AI-proposed data dictionary ─────────┐  │
│  │ | Column    | Type   | Unit    | Desc  |  │  │
│  │ | tinh      | string | -       | Tên   |  │  │
│  │ |           |        |         | tỉnh  |  │  │
│  │ | grdp_2024 | number | tỷ VND  | GRDP  |  │  │
│  │ |           |        |         | thực  |  │  │
│  │ | growth    | number | %       | Tăng  |  │  │
│  │ |           |        |         | trưởng|  │  │
│  │ [Mỗi cell EDIT ĐƯỢC]                      │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌─ AI questions (cần user confirm) ────────┐  │
│  │ ⚠️ "Source có phải GSO không? (tôi đoán)"│  │
│  │ ⚠️ "Đơn vị grdp_2024 là tỷ VND đúng không?"│  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  [← Hủy]              [💾 Lưu draft]  [✓ XÁC NHẬN & COMMIT]│
└─────────────────────────────────────────────────┘
                     ↓ (user click XÁC NHẬN)
┌─ Bước 5: Commit metadata ──────────────────────┐
│  POST /api/upload/commit                       │
│                                                 │
│  Server side:                                   │
│  1. R2 object: chuyển từ staging → final path   │
│     (e.g. staging/<fileId> → <slug>/data/...)   │
│  2. Viết metadata.yaml — gồm field `files:`     │
│     liệt kê R2 object keys + public/default URL │
│  3. Viết dictionary.md (nếu tabular/geojson)    │
│  4. Git commit + push (server-side, GH PAT)     │
│     → chỉ metadata text, không có binary        │
│  5. Trigger Vercel rebuild → catalog updated    │
│                                                 │
│  User redirect tới /dataset/<slug> (live)       │
│  (Preview page fetch file trực tiếp từ R2 URL)  │
└─────────────────────────────────────────────────┘
```

**Effort per clean dataset**: 5-10 phút (chủ yếu review AI proposal trên UI).

**Lý do thiết kế này**:
- **Không giới hạn file size**: presigned URL upload bypass Vercel body limit. Dataset 100-200 MB OK.
- **Không tốn Vercel bandwidth**: traffic browser ↔ R2 thẳng, Vercel chỉ handle metadata.
- **User không bao giờ phải tự viết metadata từ trang trắng** — AI draft trước.
- **User vẫn kiểm soát**: mọi field edit được, AI flag uncertainty rõ ràng.
- **Server commit metadata保证 schema chuẩn** (không file lỗi) + raw file đã ở R2 (không cần move).
- **Trigger rebuild** → catalog cập nhật ngay sau upload.
- **Staging pattern**: file nằm ở `staging/<fileId>` trong R2 cho đến khi commit. Nếu user hủy → R2 lifecycle policy auto-clean sau 24h.

### Subagent "Dataset Reviewer" (backend, format-aware)

Không phải Claude Code subagent (đây là production runtime). Là **multi-prompt system** — system prompt khác nhau theo file type, gọi từ Next.js API route:

```typescript
// src/app/api/upload/analyze/route.ts (pseudo)
// File đã ở R2 (đã upload qua presigned URL ở bước trước)
const { r2Key, filename } = await db.uploads.get(fileId); // track staging uploads
const format = detectFormat(filename); // csv | xlsx | parquet | pdf | mp3 | geojson

// Stream/fetch file từ R2 (server-only, private read)
const fileBuffer = await r2.getObject(r2Key);
const inspection = await inspectFile(fileBuffer, format); // columns+stats | text+pages | ...

const prompt = DATASET_REVIEWER_PROMPTS[format]; // per-format system prompt
const response = await anthropic.messages.create({
  model: "claude-opus-4-6",
  system: prompt,
  messages: [{
    role: "user",
    content: [
      { type: "text", text: `File: ${filename} (${format})` },
      // Cho PDF có thể dùng document tool, cho tabular inspection JSON là đủ:
      { type: "text", text: `Inspection: ${JSON.stringify(inspection)}` },
    ]
  }]
});

// Response schema cũng per-format:
// - tabular → { metadata, dictionary, questions }
// - pdf     → { metadata, key_findings, questions }  (no dictionary)
// - mp3     → { metadata }                            (no analysis)
// - geojson → { metadata, properties_dictionary }
return Response.json({ proposal: response, filePreview });
```

**Prompt templates stored ở**: `tools/prompts/` (version controlled):
- `dataset-reviewer-tabular.md`
- `dataset-reviewer-pdf.md`
- `dataset-reviewer-mp3.md` (minimal)
- `dataset-reviewer-geojson.md`

## Folder Structure

**Tách 2 loại storage**:

```
GITHUB REPO (metadata only — text, nhẹ, git-tracked)       R2 BUCKET (raw files — binary, bất kỳ size)
┌──────────────────────────────────────────────┐          ┌──────────────────────────────────────────┐
│ datasets/                                     │          │ <bucket>/                                 │
│ ├── ho-so-34-tinh/                  # TABULAR │          │ ├── ho-so-34-tinh/                        │
│ │   ├── metadata.yaml              # có files:│  ──────► │ │   ├── province_stats.csv                 │
│ │   ├── dictionary.md                         │  ref via │ │   ├── wards.csv                          │
│ │   └── README.md                  # optional │   r2 key │ │   └── leadership.csv                     │
│ ├── bao-cao-gso-2024/                  # PDF  │          │ ├── bao-cao-gso-2024/                     │
│ │   ├── metadata.yaml              # có files:│  ──────► │ │   ├── bao-cao-gso-2024.pdf               │
│ │   └── preview/                              │          │ │   └── preview/  (auto-gen, lifecycle)    │
│ │       ├── page-1.png                        │          │ │       ├── page-1.png                     │
│ │       └── extracted.txt                     │          │ │       └── extracted.txt                  │
│ ├── phong-van-chu-tich-tphcm/          # MP3  │          │ ├── phong-van-chu-tich-tphcm/             │
│ │   └── metadata.yaml                         │  ──────► │ │   └── phong-van-2024-12.mp3              │
│ ├── ranh-gioi-34-tinh/              # GeoJSON │          │ ├── ranh-gioi-34-tinh/                    │
│ │   ├── metadata.yaml                         │  ──────► │ │   └── ranh-gioi.geojson                  │
│ │   └── dictionary.md                         │          │ └── staging/  # upload chờ commit, 24h TTL│
│ └── tags.yaml                       # vocab   │          │     └── <fileId>                          │
└──────────────────────────────────────────────┘          └──────────────────────────────────────────┘
```

**Quy ước**:
- Mọi dataset có `metadata.yaml` trong GitHub (bắt buộc, format-aware)
- `metadata.yaml` chứa field `files:` liệt kê R2 object keys + URL — đây là cầu nối giữa 2 store
- Raw files **không** commit vào git — chỉ lưu ở R2
- Chỉ tabular + geojson có `dictionary.md` (column/properties schema)
- PDF preview (page render + extracted text) có thể generate-on-demand và lưu ở R2 `preview/` subfolder với lifecycle rule
- MP3 không có preview riêng (render bằng audio element, src là R2 URL)
- R2 bucket có `staging/` prefix cho upload chờ commit — lifecycle rule auto-clean sau 24h nếu không commit

### Format-aware metadata templates

**Nguyên tắc**: template metadata khác nhau theo file type. Tabular có data dictionary; PDF/MP3 không cần (chỉ metadata cơ bản). Mục tiêu: **dễ query, dễ preview, dễ hiểu nhanh**.

#### Common fields (mọi format đều có)

```yaml
title:           # Query + Understanding — bắt buộc
slug:            # Query (URL) — auto-generate từ title, edit được
description:     # Query + Understanding — bắt buộc, 1-3 câu
category:        # Query filter — từ tags.yaml controlled vocabulary
tags:            # Query filter — từ tags.yaml controlled vocabulary
source:          # Understanding (provenance)
  name:
  url:
  retrieved:
  method:        # download | email | leak | scrape | manual_entry
license:         # public | internal | restricted
format:          # csv | xlsx | parquet | pdf | mp3 | geojson (auto-detected)
size_mb:         # auto
uploaded_by:     # auto from session/git
uploaded_at:     # auto
files:           # R2 object references — CẦU NỐI tới R2 bucket
  - path: ho-so-34-tinh/province_stats.csv   # R2 object key
    size_mb: 0.4
    sha256: abc123...                          # integrity check
  - path: ho-so-34-tinh/wards.csv
    size_mb: 1.1
    sha256: def456...
r2_public_base:  # optional — nếu bucket có public read qua custom domain
  # https://data.vnexpress.net/  →  files[].path appended tại runtime
```

#### Tabular (CSV/XLSX/Parquet) — thêm fields + có dictionary

```yaml
row_count:              # auto
columns_count:          # auto
coverage:
  temporal: [2024]      # list of years
  geographic: "34 tỉnh thành VN"
next_refresh: 2026-02-01   # khi nào data cần update lại (null = one-time)
methodology_notes: |        # optional, ghi chú về cách tính/chuẩn hóa
  3 cách tính GRDP: cơ bản/thực tế/so sánh — file dùng giá thực tế
```

Plus `dictionary.md` (markdown table): column | type | unit | description | source.

#### PDF (document) — KHÔNG có dictionary

```yaml
page_count: 45             # auto
doc_type: report           # report | whitepaper | letter | legal | research | presentation
published_date: 2025-01-15 # ngày tài liệu publish (khác retrieved_date)
language: vi               # vi | en | other
key_findings: |            # optional nhưng khuyến khích — 1-3 câu tóm tắt phát phẩm chính
  - GRDP TPHCM 2024 tăng 7.5%, cao thứ 2 cả nước
  - FDI Bắc Ninh dẫn đầu, chủ yếu từ Hàn Quốc
  - ...
# KHÔNG có row_count, columns_count, dictionary.md
```

Preview: first page render + extracted text (search được).

#### MP3 (audio) — KHÔNG có dictionary

```yaml
duration_seconds: 3600     # auto
participants:              # list of names (nếu biết)
  - "Chủ tịch TPHCM"
  - "PV VnExpress"
recorded_date: 2024-12-15
language: vi
# KHÔNG có row_count, columns_count, dictionary.md
# Transcript = Phase 3 (Whisper)
```

Preview: waveform + playback controls.

#### GeoJSON (geographic) — light dictionary cho properties

```yaml
feature_count: 34          # auto
geometry_type: Polygon     # Point | Line | Polygon | Multi*
bbox: [102.1, 8.2, 109.5, 23.4]   # auto
crs: EPSG:4326             # auto
# dictionary.md: properties schema (light) — khác tabular ở chỗ mô tả JSON properties
```

Preview: map render (Leaflet/MapLibre).

## Phase 2 Stack (sau khi Phase 1 thu thập usage data)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| LLM | Claude API (Anthropic) | Xử lý tiếng Việt tốt, API ổn định |
| Query engine (light) | DuckDB | Query CSV/Parquet trực tiếp, sub-second cho scale VN |
| Query engine (heavy, optional) | PostgreSQL | Chỉ khi dataset promoted cần structured schema nghiêm ngặt |
| Template system | Custom (Next.js API route) | Deterministic queries, không hallucinate |
| Promotion pipeline | Python script | Đọc file → validate → insert PostgreSQL (nếu cần) |
| Usage tracking | Đã có từ Phase 1 (Plausible/Umami) | Reuse |

### Data Promotion Pattern (Phase 1 files → Phase 2 structured)

```
Phase 1 (files)              Phase 2 (light)              Phase 2 (heavy, optional)
┌──────────────────┐         ┌────────────────────┐       ┌──────────────────┐
│ datasets/         │         │ DuckDB query       │       │ PostgreSQL       │
│   metadata.yaml   │──read──→│ trên parquet files │──────→│ promoted_tables  │
│   dictionary.md   │         │ (no ingestion)     │       │ (typed, indexed) │
│   data/*.parquet  │         │                    │       │                  │
│                   │         │ Use case:          │       │ Use case:        │
│ Tracking qua      │         │ ad-hoc query từ    │       │ production query │
│ Plausible/Umami   │         │ reporter           │       │ templates, high  │
│                   │         │                    │       │ volume           │
└──────────────────┘         └────────────────────┘       └──────────────────┘
```

**Promotion criteria** (chỉ promote khi Phase 1 tracking chỉ ra):
1. Top 3-5 datasets theo view/download/repeat_user (rolling 30 ngày)
2. Tabular với data dictionary đầy đủ
3. Update frequency justify structured investment

## Phase 3 Stack (research direction)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Vector DB | pgvector (trên Supabase) HOẶC separate (Qdrant/Weaviate) | Quyết định sau Phase 2 |
| Embedding | multilingual-e5-large (Hugging Face) | Multilingual, VN support, open-source |
| ASR | Whisper (OpenAI) | MP3 → transcript |
| LLM (RAG) | Claude API | Cùng LLM với Phase 2 |
| RAG framework | Custom (lightweight) | Không LangChain/LlamaIndex |

## Configuration

| Variable | Description | Phase |
|----------|-------------|-------|
| `ANTHROPIC_API_KEY` | Claude API cho upload subagent | Phase 1+ |
| `R2_ACCOUNT_ID` | Cloudflare account ID | Phase 1+ |
| `R2_ACCESS_KEY_ID` | R2 access key (server-only, không expose browser) | Phase 1+ |
| `R2_SECRET_ACCESS_KEY` | R2 secret key (server-only) | Phase 1+ |
| `R2_BUCKET_NAME` | Tên R2 bucket (e.g. `vne-data-platform`) | Phase 1+ |
| `R2_PUBLIC_BASE` | Custom domain hoặc R2 public URL cho file đọc từ browser | Phase 1+ |
| `GITHUB_TOKEN` | PAT để commit metadata từ server | Phase 1+ |
| `PLAUSIBLE_DOMAIN` | Domain cho Plausible tracking | Phase 1+ |
| `DATABASE_URL` (nếu cần) | PostgreSQL — chỉ khi Phase 2 promotion | Phase 2+ |

**R2 bucket layout** (object keys):
- `<slug>/<filename>` — committed files (e.g. `ho-so-34-tinh/province_stats.csv`)
- `<slug>/preview/<generated>` — preview artifacts (PDF page renders, text extracts)
- `staging/<fileId>` — uploads chờ commit (lifecycle: xóa sau 24h)

**R2 permissions**:
- Server (Access Key): full read/write/delete — dùng cho analyze, commit, preview generate
- Browser (presigned URL): PUT-only cho `staging/*` (time-limited 15 phút)
- Public read (nếu enable): chỉ qua `R2_PUBLIC_BASE` custom domain, scope per-object qua metadata.yaml `files:` list

## API Design (Phase 1)

| Method | Path | Type | Description |
|--------|------|------|-------------|
| GET | `/` | Dynamic SSR | Listing page (fetch `datasets/*/metadata.yaml` runtime từ GitHub raw) |
| GET | `/datasets/[slug]` | Dynamic SSR | Detail + preview page (force-dynamic, không cache 404) |
| GET | `/upload` | Dynamic | Upload wizard UI |
| GET | `/api/tags` | Sync | Hardcoded tags array |
| GET | `/api/datasets` | Dynamic SSR | JSON list (cho client-side filter) |
| POST | `/api/upload/presign` | Dynamic | Trả presigned URL cho browser PUT file thẳng R2 (`<fileId>/<filename>`) |
| POST | `/api/upload/analyze` | Dynamic | Server fetch file từ R2 → AI provider → proposal JSON |
| POST | `/api/upload/commit` | Dynamic | User-approved metadata → git commit metadata.yaml + dictionary.md qua Octokit |
| GET | `/search` | Client-side | Pagefind index (no backend) — chưa wire |
| GET | `/api/files/[...path]` | Dynamic | (Optional) signed URL proxy nếu không muốn public R2 |

**Static catalog** + **dynamic upload** = hybrid Next.js app. Catalog rebuild khi git push.

**R2 access pattern**:
- Browser upload: PUT qua presigned URL (15 phút TTL, scope `staging/*`)
- Server analyze/commit: dùng R2 SDK với Access Key
- Browser preview/download: đọc qua `R2_PUBLIC_BASE` (custom domain) HOẶC `/api/files/*` proxy (signed URL)

## Project Layout (re-architected)

```
/
├── constitution/
│   ├── mission.md
│   ├── tech-stack.md
│   ├── roadmap.md
│   └── vne-color-palette.md
├── specs/
│   └── 2026-07-02-phase1-rearch/
├── datasets/                            # ← GitHub repo — METADATA ONLY (text files)
│   ├── ho-so-34-tinh/
│   │   ├── metadata.yaml                # có field files: → R2 object keys
│   │   ├── dictionary.md
│   │   └── README.md                    # optional, long-form notes
│   ├── tags.yaml                        # controlled vocabulary
│   └── ...
├── src/                                 # ← Next.js app (GIỮ từ F1, rewrite interior)
│   ├── app/
│   │   ├── page.tsx                    # Catalog listing (SSG from datasets/)
│   │   ├── dataset/[slug]/
│   │   │   └── page.tsx                # Dataset detail (SSG) — file fetch từ R2
│   │   ├── upload/
│   │   │   ├── page.tsx                # Upload wizard UI (dynamic)
│   │   │   └── UploadWizard.tsx        # Multi-step component
│   │   └── api/
│   │       └── upload/
│   │           ├── presign/route.ts    # Trả presigned URL cho browser PUT R2
│   │           ├── analyze/route.ts    # Server fetch R2 → Claude API → proposal
│   │           └── commit/route.ts     # R2 move staging→final + git commit metadata
│   ├── lib/
│   │   ├── datasets/                   # Read datasets/ folder (replace db/)
│   │   │   ├── list.ts
│   │   │   ├── read.ts
│   │   │   └── types.ts
│   │   ├── r2/                         # MỚI — R2 SDK wrapper
│   │   │   ├── presign.ts              # Tạo presigned PUT URL (staging)
│   │   │   ├── get.ts                  # Server-side fetch object
│   │   │   └── move.ts                 # staging → final path sau commit
│   │   ├── ai/
│   │   │   └── dataset-reviewer.ts     # Claude API integration (per-format prompts)
│   │   └── git/
│   │       └── commit.ts               # Server-side git commit (metadata only)
│   └── components/
│       ├── DatasetCard.tsx             # GIỮ từ F1
│       ├── DataViewer.tsx              # GIỮ, đổi data source sang R2 URL
│       ├── Histogram.tsx               # GIỮ
│       ├── UploadDropzone.tsx          # MỚI — drag-drop, lấy presigned URL, PUT R2
│       ├── MetadataEditor.tsx          # MỚI
│       └── DictionaryEditor.tsx        # MỚI
├── tools/
│   ├── prompts/
│   │   ├── dataset-reviewer-tabular.md # Per-format system prompts
│   │   ├── dataset-reviewer-pdf.md
│   │   ├── dataset-reviewer-mp3.md
│   │   └── dataset-reviewer-geojson.md
│   ├── migrate_f1_to_files.py          # Export PostgreSQL → metadata.yaml + push R2
│   └── upload_to_r2.py                 # One-time bulk upload existing files
└── data/                                # Legacy (F1 SQL scripts)
    └── scripts/
        └── (archive)
```

**Note**: `datasets/` folder chứa **chỉ text files** (metadata.yaml, dictionary.md, README.md). Raw files (CSV, PDF, MP3) **không** trong repo — chỉ ở R2.

## Migration từ F1 hiện tại

**Giữ**:
- Next.js framework + Vercel deploy
- Data Viewer component (DatasetViewer, Histogram) → đổi data source từ JSONB → parquet
- DatasetCard component
- HF-inspired UI pattern + VNE color palette
- TypeScript types (adapt)

**Migrate** (đã thực hiện 2026-07-09):
- ✅ Listing page: đổi từ `listDatasets()` query PostgreSQL → dynamic SSR đọc `datasets/*/metadata.yaml` runtime từ GitHub raw
- ✅ Tags controlled vocabulary: hardcoded trong `src/lib/tags.ts` (PostgreSQL table + `tags.yaml` đều không dùng)
- "Hồ sơ 34 tỉnh" dataset: chưa migrate — defer đến khi cần (script `tools/migrate_f1_to_files.py` chưa viết)

**Add mới**:
- ✅ `/upload` page + wizard (4 bước: presign → R2 PUT → AI analyze → review → commit)
- ✅ `/api/upload/presign` + `/api/upload/analyze` + `/api/upload/commit` API routes
- ✅ `MetadataEditor` + `DictionaryEditor` + `UploadDropzone` components
- ✅ `src/lib/r2/` — R2 SDK wrapper (presign, get metadata)
- ✅ `src/lib/datasets/` — reader layer (types.ts, list.ts, read.ts)
- ✅ `src/lib/git/commit.ts` — Octokit wrapper cho server-side git push
- Per-format Dataset Reviewer system prompts (4 files trong `tools/prompts/`)

**Archive** (đã move sang `_archive/`):
- ✅ `src/lib/data/datasets.ts` → `_archive/data-datasets-postgres.ts`
- ✅ `src/lib/db/supabase.ts` → `_archive/db-supabase.ts`
- ✅ `src/app/entities/` → `_archive/entities-legacy/`

**Drop hẳn**:
- ✅ `upload_log` table concept (replaced by git history)
- ✅ `quality_score` field (chưa bao giờ implemented)
- ✅ Legacy entity routes (`/entities/[id]`, `/api/province-stats`, `/api/wards`, `/api/leadership`)
- ✅ `@supabase/supabase-js` dependency
- ✅ `src/app/api/datasets/` PostgreSQL route (đã replace bằng `/api/datasets` đọc từ GitHub raw)
- ✅ `src/lib/storage/`, `src/lib/db/` — toàn bộ Supabase integration

## Phase 2/3 Solution Analysis (reference)

Đánh giá 3 giải pháp platform cho Phase 2/3 (đánh giá tháng 6/2026, vẫn đúng):

| Giải pháp | Phù hợp Phase 2? | Phù hợp Phase 3? | Phán xét |
|-----------|-----------------|-----------------|----------|
| Databricks Lakehouse + Genie | Tốt nhưng limit | Yếu | Over-engineered |
| AWS + Bedrock Multi-Agent | Mạnh nhất nhưng phức tạp | Trung bình | Quá nặng |
| Holistics + PostgreSQL | Tốt cho structured | Không | Optional Phase 2 |

**Kết luận (vẫn đúng)**: Giữ custom build + Claude API. Vietnamese AI companies (FPT.AI, PhoBERT) không apply. **Substrate thay đổi: file-based cho Phase 1, DB optional ở Phase 2.**

## Constraints

- Vietnamese UI throughout
- Mobile-friendly
- Internal tool — không cần auth phức tạp Phase 1, không ưu tiên SEO
- Mỗi dataset phải có `metadata.yaml` (+ `dictionary.md` nếu tabular/geojson) — enforced bằng CI check + upload wizard
- **Raw files KHÔNG commit vào git** — chỉ metadata text. Raw files chỉ ở R2.
- **Browser upload qua presigned URL** — không qua Vercel serverless (tránh body size limit)
- Tags chọn từ `datasets/tags.yaml` controlled vocabulary — không gõ tự do
- Mỗi con số phải trace được nguồn (provenance qua git history + `source` field trong metadata + R2 object versioning)
- Phase 2/3: dùng LLM API (Claude), không lock-in platform
- **Không thêm PostgreSQL/Supabase cho Phase 1** — chỉ khi Phase 2 promotion thực sự cần *(note: Supabase đã drop hoàn toàn 2026-07-09 sau khi tags chuyển sang hardcoded)*
