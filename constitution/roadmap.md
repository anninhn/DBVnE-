# Roadmap

## Phase 1 — Dataset Catalog (re-architected 2026-07-02)

**Mục tiêu**: File-based catalog + AI-assisted upload + tracking usage. Mục đích chính **không phải** lưu mọi data tòa soạn, và các data đã được lưu từ các bên khác như GSO, World Bank — mà là **demand discovery**: thu thập + chuẩn hóa + track usage dataset để biết cái nào đáng đầu tư structured query (Phase 2).

**Substrate**: File-based (git + markdown + parquet), KHÔNG PostgreSQL cho Phase 1. Next.js giữ từ F1, kết hợp SSG (catalog) + dynamic API route (upload). Chi tiết: `constitution/tech-stack.md`.

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

---

## Phase 2 — Query Layer (Tháng 8–10, điều chỉnh sau khi Phase 1 chạy)

**Mục tiêu**: Phóng viên hỏi câu hỏi từ data → platform trả lời ngay, chính xác. Bắt đầu bằng deterministic templates, sau đó thêm text-to-sql.

**Lưu ý**: Đây là research direction, không phải committed plan. Chi tiết cụ thể sẽ điều chỉnh sau khi Phase 1 thu thập đủ usage data thực tế.

**Data flow**: Phase 1 Dataset Hub (Bronze) → Usage tracking → Promote popular datasets → Structured tables (Silver/Gold) → Query templates → Text-to-SQL

### 2.1 — Usage Analytics & Data Promotion
- Track: datasets nào view nhiều, downloads, preview interactions, repeat users
- `dataset_access_log` table: auto-log mọi access (view, download, preview, api_query)
- Popularity scoring: `views × 1 + downloads × 3 + preview × 2 + repeat_users × 5` (rolling 30 ngày)
- Dashboard cho Minh (Editor): data usage overview + promotion candidates
- **Promotion criteria**: popularity threshold AND quality_score >= 80 AND tabular AND has data_dictionary AND has provenance

### 2.2 — Query Templates
- Pre-built templates: phóng viên chọn template, điền tham số
  - "So sánh [chỉ số] của [tỉnh A] vs [tỉnh B] giai đoạn [năm]"
  - "Xu hướng [chỉ số] của [tỉnh] trong [N] năm — có bất thường không?"
  - "Top [N] tỉnh [chỉ số] năm [năm]"
- Deterministic — luôn trả đúng kết quả, không hallucinate
- Source verification: show query + data gốc

### 2.3 — Dataset Promotion (Bronze → Silver)
- Promote popular datasets → real PostgreSQL tables (không còn JSONB)
- Validation pipeline: check types, ranges, completeness dựa trên `data_dictionary`
- Python script `data/scripts/promote_dataset.py`: đọc từ `resources.structured_data` hoặc R2 CSV → tạo typed table
- Materialized views cho aggregation patterns phổ biến (top N, trend, comparison)
- `promoted_tables` registry: tracking schema version, last refreshed, row_count

### 2.4 — Text-to-SQL (sau khi templates ổn)
- Free-form Vietnamese question → Claude API → SQL → answer
- Schema context provided cho LLM từ `data_dictionary` + `promoted_tables`
- Guardrails: chỉ query promoted tables, read-only connection, row-limited, show generated SQL
- Fallback to templates khi LLM không chắc chắn
- LLM choice: Claude API (xử lý tiếng Việt tốt, pricing rõ ràng, không lock-in platform)

**Deliverable**: Phóng viên hỏi "GRDP TPHCM năm nay 20% có bất thường không?" → platform trả lời ngay với chart + source.

---

## Phase 3 — Intelligence Platform (Tháng 11–12+, research direction)

**Mục tiêu**: AI-powered platform cho 300 phóng viên. RAG trên mọi loại data, multi-source reasoning, story detection.

**Lưu ý**: Đây là research direction. Chi tiết sẽ điều chỉnh dựa trên kết quả Phase 2.

**Tech stack**: pgvector (cùng Supabase) + multilingual-e5-large (embeddings) + Whisper (ASR) + Claude API (LLM). Lightweight custom RAG, không dùng heavy framework (LangChain/LlamaIndex).

### 3a — Document RAG
- PDF, báo cáo, tài liệu → chunking + embedding → pgvector
- Q&A trên documents: phóng viên hỏi → retrieve relevant chunks → Claude API generate answer
- Source citation: luôn link đến trang PDF cụ thể
- Embedding model: multilingual-e5-large (Hugging Face, hỗ trợ tiếng Việt)

### 3b — Audio RAG
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
- Anomaly detection tự động trên promoted structured data (Phase 2 Silver/Gold tables)
- Trend alerts: chỉ số bất thường → notify editor
- Potential story suggestions dựa trên data patterns
- Weekly data digest cho editorial team

**Deliverable**: Intelligence platform phục vụ 300 phóng viên. Hỏi đáp, fact-check, story discovery.

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
