# VNExpress Data Platform

## Overview

**VNExpress Data Platform** là kho dữ liệu và công cụ情报 cho tòa soạn VNExpress, xây dựng theo 3 giai đoạn:

1. **Phase 1 — Dataset Catalog**: File-based catalog (giống Google Drive cho dataset) + AI-assisted standardization. Mục đích chính: **demand discovery** — thu thập + track usage để biết dataset nào reporter thực sự dùng nhiều, làm đầu vào cho Phase 2. Browse, preview, search. Standardize metadata/dictionary NGAY lúc upload bằng AI subagent (user không phải tự viết).
2. **Phase 2 — Query Layer**: Structured query system cho datasets phổ biến (do Phase 1 tracking chỉ ra). Phóng viên hỏi "GRDP TPHCM năm nay 20% có bất thường so 20 năm trước không?" → platform trả lời ngay, chính xác, dựa trên data đã promote vào structured tables.
3. **Phase 3 — Intelligence Platform**: RAG + advanced AI cho toàn tòa soạn (300 phóng viên). Hỏi đáp, tìm potential story, fact-check, multi-source reasoning.

## Motivation

Phóng viên VNExpress cần dữ liệu liên tục: kinh tế vĩ mô, quốc tế, dân số, bầu cử, khí hậu, FDI, báo cáo PDF, phỏng vấn MP3... Tòa soạn có rất nhiều data từ nhiều domain. Hiện tại:

- **Fragmentation**: Data rải rác — PDF GSO, Excel lẻ tẻ, file cá nhân, Google Sheets shared
- **No single source of truth**: Cùng 1 con số, 2 nguồn khác nhau, không biết cái nào đúng
- **No provenance**: Không truy được nguồn gốc — ai nhập, từ đâu, khi nào
- **Manual lookup**: Phóng viên tự tìm, tự đối chiếu, mất giờ
- **No central repository**: Không có nơi tập trung mọi raw data. Khi cần data gì phải đi tìm — hỏi nhau, tìm trong drive cá nhân, search folder shared.

Platform này giải quyết bằng cách: **tập trung dataset vào 1 nơi có thể search/preview được** + **standardize metadata lúc upload bằng AI** + **track usage để biết demand thật**. Phase 1 không phải data warehouse (không re-host raw data của GSO/World Bank — chỉ link). Phase 1 là substrate cho demand discovery → Phase 2 mới đầu tư structured query cho popular datasets → Phase 3 mới build intelligence.

## Current Data Landscape

Tòa soạn hiện có data từ nhiều domain (không chỉ 34 tỉnh):
- Kinh tế vĩ mô (GRDP, GDP, inflation, interest rates)
- Quốc tế (trade, FDI, comparisons)
- Dân số, giáo dục, y tế
- Bầu cử, chính trị
- Khí hậu, môi trường
- Báo cáo PDF, phỏng vấn MP3
- Formats: CSV, Excel, PDF, MP3, GeoJSON

Phase 1 cần handle tất cả loại data này — không giới hạn domain.

## Target Audience

- **Hoa (Reporter)**: Cần fact-check nhanh. "GRDP TPHCM 20% năm nay có đúng không?" → platform trả lời với nguồn. Non-technical, dùng search + chat. (Phase 2+)
- **Minh (Editor)**: Quản lý data tòa soạn. Upload dataset mới, kiểm tra data quality, giao bài dựa trên insight từ data. (Phase 1+)
- **Ninh (Data Journalist)**: Tìm potential story, phân tích sâu, xây pipeline xử lý data. Power user, cần API access + raw data download. (Phase 1+)

## Scope

### Phase 1 — Dataset Catalog (MVP, re-architected 2026-07-02)

**Bản chất**: File-based catalog (như Google Drive folder + AI assistant). Mục đích chính **không phải** lưu trữ mọi data tòa soạn, và các data đã được lưu từ các bên khác như GSO, World Bank — mà là **demand discovery**: thu thập dataset + track usage để biết cái nào đáng đầu tư structured query ở Phase 2.

**Core capabilities**:
- **File-based storage**: dataset = metadata folder (GitHub: `metadata.yaml` + `dictionary.md`) + raw file ở Cloudflare R2 (CSV/XLSX/Parquet/PDF/MP3). Không PostgreSQL cho Phase 1. Browser upload thẳng R2 qua presigned URL → không giới hạn file size.
- **AI-assisted standardization tại upload**: user drop file → AI subagent đề xuất metadata + data dictionary → user review → commit. Giải quyết vấn đề "user không biết viết gì, chỉ dump file".
- **Browse + data preview**: static site render catalog với data preview (table + histogram). Giữ UI pattern hiện tại (HF-inspired), chỉ đổi data source từ JSONB → đọc trực tiếp từ parquet/CSV.
- **Search**: full-text trên metadata + dictionary (Pagefind hoặc Algolia DocSearch).
- **Tracking**: log view/download/request qua analytics (Plausible/Umami hoặc đơn giản hơn). Đây là **lý do Phase 1 tồn tại** — không có tracking = không biết đầu tư Phase 2 cho cái gì.
- **Provenance qua git**: mỗi thay đổi track qua git history. Không cần `upload_log` table riêng.
- **Target user**: Ninh (Data Journalist) + Minh (Editor) + 3-5 reporter early adopter để có signal.

### Phase 2 — Query Layer (research phase, điều chỉnh sau khi Phase 1 chạy)

- Query templates: phóng viên chọn template, điền tham số → kết quả deterministic
  - Ví dụ: "So sánh [chỉ số] của [tỉnh A] vs [tỉnh B] giai đoạn [năm]"
  - Ví dụ: "Xu hướng [chỉ số] của [tỉnh] trong [N] năm — có bất thường không?"
- Popular dataset promotion: merge/structure datasets dùng nhiều → fast query
- Text-to-SQL (sau khi template system ổn định): free-form question → SQL → answer
- Source verification: luôn show query + data gốc để phóng viên tự kiểm chứng
- **Target user**: Hoa (Reporter) + Ninh

### Phase 3 — Intelligence Platform (research phase, điều chỉnh sau khi Phase 2 chạy)

- **3a — Document RAG**: Q&A trên PDF, báo cáo, tài liệu → vector search + retrieval
- **3b — Audio RAG**: Transcribe MP3 phỏng vấn → search + extract quotes
- **3c — Multi-source reasoning**: Kết hợp structured data + documents + audio → trả lời câu hỏi phức tạp
- **3d — Story detection**: Anomaly detection tự động, trend alerts, potential story suggestions
- **Target user**: toàn tòa soạn (300 phóng viên)

### Deferred

- User authentication và role-based access (Phase 1 là internal tool)
- Public-facing data portal
- Visualization embed widgets cho bài báo
- Automated data fetching từ external sources

## Success Metrics

| What | Success | Method |
|------|---------|--------|
| Data centralization | 30-50 datasets phổ biến nhất có trên catalog | Inventory audit |
| Upload workflow | Upload + standardize 1 dataset clean < 15 phút | User test |
| Demand discovery | Tracking data phân biệt được top 5 vs bottom 5 datasets sau 60 ngày | Analytics review |
| Query accuracy (Phase 2) | 100% câu trả lời có kèm nguồn data gốc | Verify source links |
| Query speed (Phase 2) | Template query < 3 giây | Measure latency |
| Adoption (Phase 3+) | 50+ phóng viên dùng platform hàng tuần | Usage analytics |

## Key Principles

1. **Accuracy first**: Mỗi con số phải trace được nguồn gốc. Sai số → tin sai → mất uy tín.
2. **Source transparency**: Luôn show data gốc, query, reasoning — phóng viên tự verify.
3. **Demand-driven, not speculative**: Phase 1 = demand discovery. Không đầu tư structured query (Phase 2) hay RAG (Phase 3) cho dataset chưa proven demand. Track trước, invest sau.
4. **Files first, database later**: PostgreSQL là premature optimization cho Phase 1. File-based (git + markdown + parquet) đủ cho catalog + preview + tracking. DB chỉ thêm khi Phase 2 promotion thực sự cần.
5. **AI-assisted standardization**: Đừng bắt user tự viết metadata/dictionary — họ sẽ không viết, hoặc viết kém. AI propose, user review. Standardize tại upload time, không sau.
6. **Iterative**: Mỗi phase thu thập usage data → quyết định phase sau. Không over-engineer sớm.
7. **Vietnamese-first**: UI, query, response đều tiếng Việt.
