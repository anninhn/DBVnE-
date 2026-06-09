# Roadmap

## Phase 1 — Dataset Hub (Tháng 6–7)

**Mục tiêu**: Xây HF-style dataset platform. Data journalist upload dataset, browse, preview, download. Mọi dataset tòa soạn cần được tập trung 1 nơi.

### 1.1 — Nền tảng & Design System
- Setup project Next.js 15 + Tailwind + Supabase
- HF design system: fonts (Source Sans 3 + IBM Plex Mono), colors (`#FFD21E`), components
- Database schema: `datasets`, `resources`, `data_dictionary`, `tags`, `upload_log`

### 1.2 — Dataset Listing Page (`/`)
- HF-style listing: sidebar filters (category, tags), search bar, sort
- Dataset cards: title, description, tags, quality score, file count
- Responsive grid layout

### 1.3 — Dataset Detail Page (`/datasets/[slug]`)
- Tab bar (HF yellow underline): Hồ sơ | Dữ liệu | Files
- **Hồ sơ tab**: metadata, description, data quality report, provenance
- **Dữ liệu tab**: interactive data table viewer (paginated, column headers from schema)
- **Files tab**: file list with download buttons, file type icons
- Right sidebar: metadata cards (category, tags, size, quality, upload info)

### 1.4 — Upload & Data Entry
- Upload form: tạo dataset mới + upload files
- Structured data preview (first N rows) auto-extracted from CSV/Excel
- Data dictionary auto-generated from column headers
- Upload log (provenance): ai, khi nào, từ nguồn nào

### 1.5 — Data Quality & Dictionary
- Data quality metrics: completeness, freshness, validity
- Data dictionary page: browse tất cả indicators + metadata
- Validation rules per column (min/max, not null, type check)

### 1.6 — Seed Data
- Import 34 tỉnh thành dataset (địa giới, lãnh đạo, dân số, GRDP, FDI)
- Import tags vocabulary
- Import data dictionary entries

**Deliverable**: Production dataset hub, data journalist có thể upload, browse, preview, download. Data quality visible. Provenance tracked.

---

## Phase 2 — Query Layer (Tháng 8–10)

**Mục tiêu**: Phóng viên hỏi câu hỏi từ data → platform trả lời ngay, chính xác. Bắt đầu bằng deterministic templates, sau đó thêm text-to-sql.

### 2.1 — Usage Analytics
- Track: datasets nào view nhiều, queries nào phổ biến, phóng viên nào active
- Dashboard cho Minh (Editor): data usage overview

### 2.2 — Query Templates
- Pre-built templates: phóng viên chọn template, điền tham số
  - "So sánh [chỉ số] của [tỉnh A] vs [tỉnh B] giai đoạn [năm]"
  - "Xu hướng [chỉ số] của [tỉnh] trong [N] năm — có bất thường không?"
  - "Top [N] tỉnh [chỉ số] năm [năm]"
- Deterministic — luôn trả đúng kết quả, không hallucinate
- Source verification: show query + data gốc

### 2.3 — Dataset Promotion
- Promote popular datasets → structured tables/materialized views
- Clean + validate data during promotion
- Fast query response từ promoted tables

### 2.4 — Text-to-SQL (sau khi templates ổn)
- Free-form Vietnamese question → LLM → SQL → answer
- Schema context provided cho LLM từ data_dictionary
- Guardrails: chỉ query promoted tables, sandbox SQL, show generated query
- Fallback to templates khi LLM không chắc chắn

**Deliverable**: Phóng viên hỏi "GRDP TPHCM năm nay 20% có bất thường không?" → platform trả lời ngay với chart + source.

---

## Phase 3 — Intelligence Platform (Tháng 11–12+)

**Mục tiêu**: AI-powered platform cho 300 phóng viên. RAG trên mọi loại data, multi-source reasoning, story detection.

### 3a — Document RAG
- PDF, báo cáo, tài liệu → chunking + embedding → vector DB
- Q&A trên documents: phóng viên hỏi → retrieve relevant docs → generate answer
- Source citation: luôn link đến trang PDF cụ thể

### 3b — Audio RAG
- MP3 phỏng vấn → ASR (Whisper / Vietnamese model) → transcript
- Transcript → embedding → vector DB
- Search + extract quotes từ phỏng vấn
- Link về timestamp gốc trong audio

### 3c — Multi-source Reasoning
- Kết hợp structured data (Phase 2) + documents (3a) + audio (3b)
- Example: "Tóm tắt quan điểm chủ tịch TPHCM về GRDP 2024 từ bài phỏng vấn + so sánh với số liệu thực tế"
- Cross-reference: data nói gì vs. chính trị gia nói gì

### 3d — Story Detection
- Anomaly detection tự động trên structured data
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
