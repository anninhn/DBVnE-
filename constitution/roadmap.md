# Roadmap

## Phase 1 — Dataset Hub (Tháng 6–7)

**Mục tiêu**: Xây nơi tập trung mọi raw data tòa soạn. HF-style frontend pattern cho browse/preview/download. Data journalist browse, preview, download. Mọi dataset tòa soạn cần được tập trung 1 nơi.

**Scope data**: Không giới hạn 34 tỉnh — bao gồm kinh tế vĩ mô, quốc tế, dân số, giáo dục, y tế, bầu cử, khí hậu, PDF reports, MP3 phỏng vấn, GeoJSON... Mọi data tòa soạn cần.

**Scope MVP (replanned 2026-06-24)**: Chỉ read-path — frontend HF (đã build ở `specs/2026-06-23-hf-frontend-demo/`) wire vào DB + API thật. Upload, quality scoring, data dictionary browse page **deferred** (xem "Deferred trong Phase 1" cuối phase). Phase 1 chia thành 5 feature độc lập, mỗi feature 1 spec dưới `specs/2026-06-24-<name>/`, build theo thứ tự F1→F5.

### F1 — Dataset Catalog & Listing · `specs/2026-06-24-dataset-catalog/`
- **Foundation (substrate)**: tạo constitution schema clean (`datasets`, `resources`, `data_dictionary`, `upload_log`, reuse `tags`); DROP legacy entity `resources`/`resource_versions`/`indicator_metadata`; KEEP typed tables `province_stats`/`wards`/`leadership` làm nguồn seed.
- Seed 1 dataset thật "Hồ sơ 34 tỉnh thành 2025" (3 resources + ~25 dictionary entries).
- **Capability**: browse + find datasets. HF compact-row listing `/` với sidebar filters, search, sort. Listing hiện chỉ dataset thật (mock datasets ẩn — không badge DEMO); thêm dataset mới qua SQL seed đến khi upload feature build.
- API: `GET /api/datasets`.
- Build: schema migration `005`, seed `006`, types `src/lib/types/dataset.ts`, data layer `src/lib/data/datasets.ts`.

### F2 — Dataset Detail & Card · `specs/2026-06-24-dataset-detail/`
- **Capability**: đọc metadata, nguồn, mô tả của 1 dataset. Detail page header (`org/name`), metadata pills, Dataset card tab (description, source, README, dictionary preview), sidebar (Tải về/Quy mô/Nguồn gốc).
- API: `GET /api/datasets/[slug]` (full dataset + resources + dictionary).
- Build: wire `datasets/[slug]/page.tsx` vào data layer (component không đổi).

### F3 — Data Viewer · `specs/2026-06-24-data-viewer/`
- **Capability**: preview rows + hiểu phân bố mỗi cột. DatasetViewer: resource dropdown, bảng với per-column mini charts (histogram numeric / proportion bar categorical), type badges, `min→max`/`N giá trị`, pagination, "End of preview".
- API: dùng F2's route (resources mang `structured_data` JSONB + `columns`).
- **Column statistics** (`specs/2026-06-24-column-statistics/`, built alongside F1): mini charts đọc `resources.column_stats` JSONB — stats precompute ở seed time trên **full typed table** (không phải 10-row preview), nên histogram/proportion bar phản ánh distribution thật. Viewer fallback về client-side compute từ preview nếu `column_stats` null.
- Build: hero viewer render real province_stats rows, histograms từ real data, dropdown switch 3 resources.

### F4 — Files Browser · `specs/2026-06-24-files-browser/`
- **Capability**: xem files trong dataset + download. Files and versions tab: bảng file (filename, size, rows, updated, download) với icon theo loại file.
- API: F2's route trả resources; feature này chỉ render subset file.
- Build: Files tab render 3 hero resources đúng size/rows; download link trỏ `file_url`.

### F5 — Search & Filter API contract · `specs/2026-06-24-search-filter/`
- **Capability**: tìm dataset trong catalog bằng text/category/tag/size. Listing search box + sidebar facets (hiện client-side).
- Build: promote search/filter lên server-side — `GET /api/datasets?search=&category=&tag=&size=&sort=` chấp nhận và honor query params. UI vẫn filter client-side (5 datasets), nhưng API contract sẵn sàng cho scale Phase 2. Cleanup legacy routes ở đây.

### Deferred trong Phase 1 (moved out of MVP scope)
- **Upload flow** (tạo dataset / thêm resources / trích CSV preview / auto-dictionary) — cũ 1.4, defer vì read-path priority
- **Quality scoring** (completeness/freshness/validity) — cũ 1.5, defer (Chất lượng box đã gỡ khỏi UI)
- **Data dictionary browse page** — cũ 1.5, defer (dictionary hiện render trong detail page)

**Deliverable**: Dataset hub thật, data journalist browse/preview/download dataset thật. Upload + quality tracking theo sau.

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
