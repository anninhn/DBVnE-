# Roadmap

## Phase 1 — Dataset Catalog (re-architected 2026-07-02)

> **Status: DELIVERED 2026-07-24.** Wrap-up đầy đủ: `docs/phase-1.md`.

**Mục tiêu**: File-based catalog + AI-assisted upload + tracking usage. Mục đích chính **không phải** lưu mọi data tòa soạn, và các data đã được lưu từ các bên khác như GSO, World Bank — mà là **demand discovery**: thu thập + chuẩn hóa + track usage dataset để biết cái nào đáng đầu tư structured query (Phase 2).

**Substrate**: File-based (git + markdown + parquet), KHÔNG PostgreSQL cho Phase 1. Next.js giữ từ F1, kết hợp SSG (catalog) + dynamic API route (upload). Chi tiết: `constitution/tech-stack.md`.

**Format scope (chốt 2026-07-23)**: Giữ tinh thần "dataset = tabular + geospatial". Phase 1 chỉ accept:
- ✅ Tabular: CSV/XLSX/XLS (đã ship — TSV bỏ 2026-07-23 vì parser comma-only không handle tab)
- ✅ GeoJSON (geospatial = data, làm trong #1A)
- ⏸️ **PDF defer Phase 3** (Document RAG) — cả 2 luồng wizard + add-file, cả 2 loại text-based + scanned
- ⏸️ **MP3 defer Phase 3** (Audio RAG)

Lý do thu hẹp: hạn chế phức tạp MVP. PDF/MP3 = document/audio, thuộc Phase 3 RAG chứ không phải Phase 1 dataset.

**Spec**: cần viết lại specs cho lần re-architecture này.

### Build chunks trong Phase 1 re-arch

1. **Migration foundation** — Tạo `datasets/` metadata folder trong GitHub + setup Cloudflare R2 bucket (`staging/`, `<slug>/` prefixes, lifecycle rule 24h cho staging). Migrate "Hồ sơ 34 tỉnh" từ PostgreSQL: export tables → CSV upload R2, đồng thời generate `metadata.yaml` + `dictionary.md` commit GitHub (script `tools/migrate_f1_to_files.py`). `tags.yaml` controlled vocabulary.
2. **Catalog display (SSG)** — Listing + detail page đọc từ `datasets/*/metadata.yaml` thay vì PostgreSQL. File preview fetch trực tiếp từ R2 URL trong `files:` field. Giữ DatasetCard, DataViewer, Histogram components (đổi data source). Pagefind search.
3. **Upload wizard UI** — `/upload` page drag-and-drop + multi-step: presigned URL upload → server analyze → review AI proposal → edit → commit. Components mới: UploadDropzone (gọi `/api/upload/presign`, PUT R2), MetadataEditor, DictionaryEditor.
4. **AI Dataset Reviewer backend** — `/api/upload/analyze` server fetch file từ R2 → Claude API với per-format system prompt → đề xuất metadata + dictionary. `/api/upload/commit` user-approved → R2 object move `staging/` → `<slug>/` + git push metadata → trigger rebuild.
5. **Tracking** — Plausible/Umami integration. Log view/download/request. Dashboard đơn giản cho Ninh xem top datasets.

### Superseded (cũ, không build tiếp)

F1-F5 plan cũ (PostgreSQL-backed) **superseded by re-arch**:
- ~~F1 — Dataset Catalog & Listing~~ → đã ship trên PostgreSQL, sẽ migrate sang files
- ~~F2 — Dataset Detail & Card~~ → merge vào build chunk #2
- ~~F3 — Data Viewer~~ → giữ component, merge vào build chunk #2
- ~~F4 — Files Browser~~ → merge vào detail page (build chunk #2)
- ~~F5 — Search & Filter API contract~~ → thay bằng Pagefind client-side search (build chunk #2)

### Vẫn deferred (giữ từ plan cũ)

- **Quality scoring auto-calculated** — chưa có formula rõ, để Ninh đánh giá manual dựa usage data
- **Data dictionary browse page riêng** — dictionary hiện render trong detail page là đủ

**Deliverable**: Catalog thật trên file-based substrate + Upload wizard AI-assisted hoạt động + Tracking thu thập usage → đủ signal để quyết định Phase 2.

**Delivered**: Xem `docs/phase-1.md` cho full feature map (11 nhóm) + known gaps + source-of-truth.

---

## Phase 2 — Discovery Chat (Tháng 8–10, điều chỉnh sau khi Phase 1 chạy)

**Mục tiêu**: Phóng viên hỏi "có data gì về X?" bằng tiếng Việt tự nhiên → platform trả về top-K dataset cards phù hợp nhất + lý do.

**Lưu ý**: Scope thu hẹp so với plan cũ. Bỏ chart builder, SQL panel, query templates, dataset promotion, text-to-SQL — tất cả đẩy Phase 3. Discovery chỉ query **metadata catalog**, không query **data rows**.

### 2.1 — Discovery Chat (sub-feature duy nhất)

**Approach**: LLM routing zero-infra — Claude thấy metadata tất cả datasets + câu hỏi → trả top-3 cards + giải thích "tại sao phù hợp".

- **Input context**: flatten `metadata.yaml` thành ~200-500 tokens/dataset (title + description + tags + column names + data_dictionary entries + sample rows). 50 datasets × ~400 tokens = ~20K input tokens, fits trong Claude context.
- **Output**: top-3 dataset cards + 1 câu giải thích mỗi card ("Dataset này phù hợp vì có cột `dan_so` theo năm và tỉnh")
- **Cost**: ~$0.01-0.05/query với Haiku. Cache câu hỏi phổ biến.

### 2.2 — Scale path (khi nào upgrade)

LLM routing đủ cho catalog <50-100 datasets. Khi vượt ngưỡng hoặc thấy miss intent, upgrade theo thứ tự:

1. **PostgreSQL FTS + pg_trgm** — keyword match + typo tolerant, không cần vector
2. **Hybrid BM25 + LLM re-rank** — search engine (Meilisearch/Typesense) filter candidate → LLM re-rank top-K
3. **Vector DB (pgvector/Qdrant)** — chỉ khi fuzzy intent phức tạp (synonyms vùng miền, cross-language)

Vector embedding **không phải default** — là opt-in khi trigger criteria met.

### Không build trong Phase 2

- ❌ Chart builder
- ❌ SQL panel cho phóng viên
- ❌ Query templates (deterministic)
- ❌ Dataset promotion (Bronze → Silver PostgreSQL)
- ❌ Text-to-SQL

→ Tất cả trên đẩy Phase 3 hoặc loại bỏ.

**Deliverable**: Chat box trên homepage/detail → phóng viên hỏi "kinh tế miền Nam gần đây" → top-3 datasets về GRDP/tài chính khu vực. Zero infrastructure mới ngoài Claude API đã có.

---

## Phase 3 — Intelligence Platform (Tháng 11–12+, research direction)

**Mục tiêu**: AI-powered platform cho 300 phóng viên. RAG trên mọi loại data, multi-source reasoning, story detection.

**Lưu ý**: Đây là research direction. Chi tiết sẽ điều chỉnh dựa trên kết quả Phase 2.

**Tech stack**: pgvector (cùng Supabase) + multilingual-e5-large (embeddings) + Whisper (ASR) + Claude API (LLM). Lightweight custom RAG, không dùng heavy framework (LangChain/LlamaIndex).

### 3a — Document RAG
- **Upload flow** (defer từ Phase 1 #1A): PDF text-based (`pdf-parse` extract) + scanned (OCR hoặc AI File API vision). Cả 2 luồng: wizard (tạo dataset mới) + add-file (attach vào dataset có sẵn)
- PDF, báo cáo, tài liệu → chunking + embedding → pgvector
- Q&A trên documents: phóng viên hỏi → retrieve relevant chunks → Claude API generate answer
- Source citation: luôn link đến trang PDF cụ thể
- Embedding model: multilingual-e5-large (Hugging Face, hỗ trợ tiếng Việt)

### 3b — Audio RAG
- **Upload flow** (defer từ Phase 1 #1A): MP3 qua wizard + add-file
- MP3 phỏng vấn → Whisper (ASR) → transcript tiếng Việt
- Transcript → embedding → pgvector
- Search + extract quotes từ phỏng vấn
- Link về timestamp gốc trong audio

### 3c — Multi-source Reasoning
- Kết hợp structured data (Phase 2 query) + documents (3a RAG) + audio (3b transcript)
- Example: "Tóm tắt quan điểm chủ tịch TPHCM về GRDP 2024 từ bài phỏng vấn + so sánh với số liệu thực tế"
- Cross-reference: data nói gì vs. chính trị gia nói gì
- Single query interface: phóng viên hỏi 1 câu → system auto-route structured / document / audio / multi

### 3d — Story Detection
- Anomaly detection tự động trên structured data (Phase 3e Silver/Gold tables)
- Trend alerts: chỉ số bất thường → notify editor
- Potential story suggestions dựa trên data patterns
- Weekly data digest cho editorial team

### 3e — Structured Data Q&A (NL → SQL)

**Mục tiêu**: Phóng viên hỏi "dân số HCM 2024 so với Hà Nội?" → câu trả lời câu văn + bảng + chart, không cần biết SQL. Đây là phần Generation mà Phase 2 không làm.

**Approach — schema-aware prompting** (KHÔNG semantic layer mặc định):
- LLM nhận metadata dataset đã pick (columns + types + descriptions + sample rows từ `metadata.yaml` hiện có)
- Claude tool-use agent với tools: `get_dataset_schema`, `run_sql_query` (read-only, row limit, timeout), `verify_result`
- Verify loop: query → inspect result → re-prompt nếu schema mismatch
- DuckDB query trực tiếp CSV/XLSX/Parquet từ R2 — không cần PostgreSQL substrate

**UX cho phóng viên (non-technical)**:
- Chat box "Hỏi dữ liệu"
- Câu trả lời dạng câu văn: "Năm 2024, dân số TP.HCM 9.1M, Hà Nội 8.9M — HCM cao hơn 200K"
- "Xem chi tiết" → bảng + chart
- "Sao chép số liệu" → copy vào bài báo
- "Show query" (collapse, cho power user) → SQL + dataset version pin

**Guardrails**:
- Read-only connection ở DB level (không phải app level) — lesson từ Cursor agent xoá DB
- Row limit + timeout per query
- SQL trace vào `upload_log` cho provenance
- Version pin (gắn plan versioning 2026-07-10) — reproducibility journalism

**Loại bỏ khỏi scope (justified)**:
- ❌ Fine-tune text-to-SQL — overkill cho newsroom scale
- ❌ LangChain SQL agent auto-explore — burn tokens, hard to debug
- ❌ Raw SQL editor cho user — phóng viên không phải data engineer
- ❌ Concept metrics/dimensions expose cho user — phóng viên không hiểu

### 3f — Optional extensions (open for, không default)

Triggers cụ thể để cân nhắc bổ sung:

- **Vector DB / RAG trên metadata**: bổ sung pgvector/Qdrant khi (1) catalog >100 datasets với semantic overlap cao, (2) FTS miss fuzzy intent ("kinh tế Nam Bộ" → "ĐBSCL"), (3) cross-language matching cần thiết. Pattern Vanna AI.
- **Semantic layer** (Cube/dbt/Looker style): bổ sung `metrics[]`/`dimensions[]` per dataset khi có **multiple BI surfaces** cần consistent metrics (Looker + Tableau + Slack bot cùng metric). VNExpress hiện 1 surface → không cần. Pattern inspired Cube.dev 2026.
- **AI auto-suggest trong upload wizard**: chỉ enrich metadata tự nhiên cho phóng viên (description, synonyms, tags, sample values). KHÔNG expose concepts metrics/dimensions.

**Deliverable**: Intelligence platform phục vụ 300 phóng viên. Hỏi đáp, fact-check, story discovery. Structured Q&A cho phóng viên không biết SQL.

---

## Post-Phase 3

- User authentication và role-based access
- Public-facing data portal
- Visualization embed widgets cho bài báo
- Automated data fetching từ GSO, World Bank, etc.
- Mobile app
- Real-time data feeds

## Replanning Log

| Date | What Changed | Why |
|------|-------------|-----|
| 2026-05-09 | Schema: 11 tables → 5 tables wiki | Phóng viên cần browse/download |
| 2026-05-09 | Roadmap: 8 phases | Phase 1 wiki → phases 2-7 data → phase 8 dashboard |
| 2026-06-08 | Architecture: analytics → wiki/HF hub | Wiki model phù hợp newsroom hơn |
| 2026-06-09 | **Redefinition**: "34 Tỉnh wiki" → "VNExpress Data Platform" | Scope rộng hơn: mọi dataset tòa soạn, không chỉ 34 tỉnh. 3 phases: hub → query → intelligence. Thêm data quality, provenance, RAG roadmap. |
| 2026-06-12 | **Phase 2/3 solution analysis** | Đánh giá 3 giải pháp (Databricks Genie, AWS Bedrock, Holistics AML). Kết luận: giữ kiến trúc hiện tại + Claude API. Vietnamese AI companies không apply cho use case này (không có LLM generation, chỉ có NLP classification + GPU hosting). Thêm data promotion pipeline (Bronze→Silver→Gold) học từ Databricks medallion + HF auto-conversion. Phase 3 stack: pgvector + multilingual-e5 + Whisper + Claude API. |
| 2026-06-12 | **Clarify scope và approach** | Phase 1 scope: mọi data tòa soạn (không chỉ 34 tỉnh). HF-style frontend = pattern cho browse/preview, không phải copy HF. Phase 2/3 = research direction, chưa committed. Đánh dấu Phase 2/3 là "điều chỉnh sau khi phase trước chạy". |
| 2026-06-24 | **Phase 1 → 5 features (read-path MVP)** | Cũ: Phase 1 gộp 6 mục (1.1–1.6) gồm cả upload + quality + dictionary browse. Mới: Phase 1 chia 5 feature độc lập F1–F5 (Catalog/Detail/Viewer/Files/Search), chỉ read-path. Frontend HF đã build (spec 2026-06-23). Upload, quality scoring, dictionary browse page → "Deferred trong Phase 1". Schema: legacy entity `resources` drop, build constitution `resources` clean. Listing hiện chỉ dataset thật (mock ẩn); thêm qua SQL seed đến khi upload build. Lý do: chốt UI trước (đã duyệt prototype), wire vào DB thật từng feature, không over-build upload trước khi biết usage. |
| 2026-06-24 | **Column statistics (precomputed, full-table)** | Thêm `resources.column_stats` JSONB — mini charts của Dataset Viewer (F3) đọc stats precompute ở seed time trên full typed table thay vì compute từ 10-row preview. Trước: histogram/proportion bar phản ánh phân bố sai (chỉ 10 province đầu theo alphabet). Sau: phân bố thật của 34 provinces, HCM outlier hiện rõ. Migration 007 + update seed 006 (self-sufficient). Lý do: HF làm đúng vì precompute server-side; copy visual mà không copy architecture = chart đúng hình sai số. Xem `specs/2026-06-24-column-statistics/`. |
| 2026-07-02 | **Phase 1 Re-architecture: PostgreSQL → File-based + AI-assisted upload** | Cũ: Phase 1 = Next.js + Supabase PostgreSQL + 5 features F1-F5 (catalog/detail/viewer/files/search) + upload deferred. Mới: file-based storage (git + markdown + parquet/CSV/XLSX giữ nguyên gốc), AI-assisted upload wizard trên UI (drag-drop → Claude phân tích → user review metadata/dictionary → commit), Plausible tracking, không PostgreSQL cho Phase 1. Lý do (4): (1) Treadmill chẩn đoán — mỗi dataset = ~1000 dòng code SQL seed, không scale cho 1 người; (2) `upload_log` table = reimplementation git history; (3) Phase 1 purpose thật là **demand discovery** qua tracking, không phải "single source of truth" warehouse; (4) User sẽ không tự viết metadata/dictionary → cần AI-assisted tại upload time. DuckDB (Phase 2) query trực tiếp CSV/XLSX/Parquet — không cần PostgreSQL substrate sớm. PostgreSQL move xuống Phase 2 optional (chỉ khi promotion structured table cần). F1-F5 plan cũ superseded. Xem `specs/2026-07-02-phase1-rearch/`, `constitution/tech-stack.md` (re-architected). |
| 2026-07-23 | **Phase 2/3 scope adjustment sau brainstorm Intelligence** | Phase 2 thu hẹp: chỉ **Discovery Chat** (LLM routing zero-infra, Claude thấy metadata tất cả datasets → trả top-3 cards + lý do). Bỏ chart builder + SQL panel + query templates + dataset promotion + text-to-SQL. Phase 3 thêm **3e Structured Data Q&A** (NL→SQL bằng schema-aware prompting với Claude tool-use + DuckDB query R2 trực tiếp, KHÔNG semantic layer default). Phase 3 thêm **3f Optional extensions** với triggers cụ thể: vector DB/RAG khi catalog >100 + fuzzy intent; semantic layer khi multi-surface; AI auto-suggest wizard chỉ enrich metadata tự nhiên. Lý do: (1) Vector DB over-engineering cho 10-100 datasets — LLM routing đủ; (2) Semantic layer (Cube/dbt) là enterprise pattern cho multi-surface consistency, không fit newsroom 1 surface; (3) Fine-tune text-to-SQL overkill — zero-shot + rich context đủ; (4) Phóng viên không hiểu metrics/dimensions — UX phải giấu concepts. Reference: SOTA research 2026 (Spider2/BIRD broken, Cube semantic layer trend, Vanna RAG, Anthropic tool use). |
| 2026-07-23 | **Phase 1 format scope — tabular + GeoJSON, defer PDF/MP3 sang Phase 3** | Cũ: #1A multi-format gồm pdf/mp3/geojson/zip. Mới: #1A chỉ còn **GeoJSON** (geospatial = data). PDF + MP3 defer Phase 3 — cả 2 luồng (wizard + add-file) và 2 loại PDF (text-based `pdf-parse` extract + scanned OCR/AI vision). Lý do: giữ tinh thần "dataset = tabular" cho MVP, hạn chế phức tạp. PDF/MP3 = document/audio, thuộc Phase 3 RAG infrastructure (3a Document RAG pickup upload flow, 3b Audio RAG pickup upload flow) chứ không phải Phase 1 dataset. Phase 1 `detectFormat` accept CSV/XLSX/XLS + GeoJSON (native `JSON.parse`, không library ngoài). Dictionary reuse cho GeoJSON (columns = feature.properties.keys()). Preview GeoJSON: render table từ features.properties, defer map (Leaflet/MapLibre) cho sau. **TSV cũng bỏ cùng ngày** — `parseCSV` hardcode comma delimiter, TSV file upload sẽ parse sai (1 cột duy nhất); ưu tiên sửa sau nếu có demand thực tế thay vì quảng cáo sai. |
| 2026-07-24 | **Phase 1 wrap-up** | Đóng gói chính thức Phase 1 (Dataset Hub). CHANGELOG promote `[Unreleased]` → `[Phase 1] - 2026-07-24`. Wrap-up doc mới `docs/phase-1.md` — feature map (11 nhóm: catalog/upload/preview/search/edit-delete/geojson/frictionless/auth/articles/downloads/perf), architecture snapshot, source-of-truth, known gaps + workarounds, Phase 2 entry point. Ngoài plan gốc 2026-07-09 (4 features: search/pagination/viewer/edit-delete), Phase 1 còn ship các enhancement: GeoJSON upload, Frictionless Data Table Schema, Auth nhẹ + edit history timeline, Article Linking (reverse provenance), Download counter, listing render perf. Roadmap Phase 1 mark DELIVERED. |
