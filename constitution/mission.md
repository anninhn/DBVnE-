# VnExpress Data Platform

## Định vị

> **Bàn số liệu đáng tin của tòa soạn.**
> Nơi phóng viên **tìm được dataset luôn** (mọi nguồn), và với nguồn thống kê có cấu trúc, **hỏi được con số kèm cảnh báo gốc** của nguồn đó. Không hứa hợp nhất mọi nguồn thành một hệ số liệu — so sánh là việc của người hỏi, hệ thống chỉ có trách nhiệm **không giấu khác biệt**.

**Không phải**: data warehouse (không hợp nhất nguồn) · công cụ phân tích (chart/notebook là việc của agent) · portal công khai (chưa).

Chi tiết thiết kế + bằng chứng đo đạc: `docs/product-design-proposal.md` (v3.2, 2026-08-24).

## Overview

**VnExpress Data Platform** là kho dữ liệu và công cụ thông tin cho tòa soạn VnExpress, xây dựng theo 3 giai đoạn:

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

Platform này giải quyết bằng cách: **tập trung dataset vào 1 nơi có thể search/preview được** + **standardize metadata lúc upload bằng AI** + **track usage để biết demand thật**.

> **Cập nhật 2026-08-24 — re-host, không chỉ link.** Bản trước ghi *"không re-host raw data của GSO/World Bank — chỉ link"*. **Điều đó đã đổi.** Nguồn thống kê có cấu trúc (NSO, World Bank) được **fetch, chuẩn hoá và lưu** thành dataset trong kho, vì:
> - Chỉ link thì phóng viên vẫn phải tự vào PxWeb, tự tải, tự un-pivot — đúng cái ma sát platform sinh ra để xoá
> - Bản gốc NSO là **pivot 2 tầng header**, không mô tả được bằng Frictionless schema, không preview được, không query được
> - Không giữ bản sao thì không có `vintage`, không có footnote phương pháp, không biết nguồn sửa số lúc nào — tức không có provenance của **con số** (yêu cầu 3)
>
> Đổi lại phải giữ nguyên tắc **bộ nguồn không trộn**: mỗi nguồn là một bộ riêng, giữ nguyên nhãn/đơn vị/cảnh báo/địa giới của nguồn đó. Không bao giờ merge hai bộ thành một hệ số liệu chung.

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

## Model nội dung — ba lớp (chốt 2026-08-24)

| Lớp | Là gì | Trả lời câu hỏi | Ai dùng |
|---|---|---|---|
| **Object** | mọi file, nguyên gốc, bất biến, có hash | "cho tôi file" | tất cả |
| **Chuỗi** | `chiều × thời gian → giá trị`, **per bộ nguồn** | "con số là bao nhiêu" | Hoa (phóng viên, qua chat) |
| **Microdata** | file lớn chưa tổng hợp (điểm thi: 1 dòng = 1 thí sinh) | "tôi tự phân tích" | Ninh (data journalist, qua agent) |

Microdata **không** vào lớp Chuỗi: tổng hợp đòi hỏi *chọn* cách tổng hợp — đó là quyết định biên tập, máy chọn hộ = số sai không ai biết vì sao.

## Hai luồng ingest

| | **Luồng A — khối lượng** | **Luồng B — độc quyền** |
|---|---|---|
| Nguồn | NSO, World Bank, bộ ngành có API | tài liệu rò rỉ, công văn, data tự thu thập |
| Cách vào | connector script, deterministic | upload wizard |
| AI đoán metadata? | ❌ không cần — nguồn đã structured | ✅ cần |
| Vào lớp Chuỗi? | ✅ | chỉ khi khai được vai trò cột — tự nguyện |

**Luật ingest**:
- **Bộ nguồn không trộn** — không bao giờ merge hai nguồn thành một hệ số liệu chung
- **Cả bộ hoặc không** — không chuẩn hoá nhỏ giọt trong một bộ
- **Không chuẩn hoá file upload** — bề mặt bẫy không giới hạn
- **Không hợp nhất địa giới** — 63 tỉnh (trước 2025) và 34 tỉnh là hai hệ khác nhau; chặn so sánh xuyên thời đại thay vì làm nó trông có vẻ được
- **Kill-switch**: bộ nguồn mới mà "lát đầu" (≥1 chỉ tiêu trả số đúng) tốn **> 2 tuần** → DỪNG, nghĩ lại kiến trúc

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
- ~~Automated data fetching từ external sources~~ → **promoted 2026-08-24: đây giờ là luồng ingest chính (luồng A), không còn deferred**

## Success Metrics

| What | Success | Method |
|------|---------|--------|
| Data centralization | ~~30-50 datasets~~ → **toàn bộ NSO (~500 bảng, 12 database) + dataset tòa soạn upload** | Inventory audit |
| Độ chính xác con số (mới 2026-08-24) | exact-match 100% · cảnh báo vintage 100% · hiện truy vấn 100% | `scripts/eval-chat.mjs` mở rộng |
| Upload workflow | Upload + standardize 1 dataset clean < 15 phút | User test |
| Demand discovery | Tracking data phân biệt được top 5 vs bottom 5 datasets sau 60 ngày | Analytics review |
| Query accuracy (Phase 2) | 100% câu trả lời có kèm nguồn data gốc | Verify source links |
| Query speed (Phase 2) | Template query < 3 giây | Measure latency |
| Adoption (Phase 3+) | 50+ phóng viên dùng platform hàng tuần | Usage analytics |

## Key Principles

1. **Accuracy first**: Mỗi con số phải trace được nguồn gốc. Sai số → tin sai → mất uy tín.
   *(2026-08-24)* Cụ thể hoá thành **6 luật kiểm chứng V1–V6** (`docs/product-design-proposal.md` §8b): số phải là bản sao từ tool call (không LLM sinh) · LLM không được làm số học · cảnh báo do UI render không do LLM viết · hiện truy vấn đã dùng · mỗi số một link kiểm chứng · không có thì nói không có. **Kiểm bằng code, không bằng chỉ dẫn trong prompt.**
   Giới hạn phải nói thẳng với phóng viên: hệ thống bảo đảm *con số này có trong nguồn X tại ô Y*, **không** bảo đảm *nó trả lời đúng câu hỏi của bạn*.
2. **Source transparency**: Luôn show data gốc, query, reasoning — phóng viên tự verify.
3. **Demand-driven, not speculative**: Phase 1 = demand discovery. Không đầu tư structured query hay RAG cho dataset chưa proven demand. Track trước, invest sau.
   *(2026-08-24)* Đo demand đã chạy: **đa số phóng viên cần con số, phóng viên dữ liệu cần raw data.** Demand giờ quyết định **bộ nguồn nào onboard tiếp**, không quyết định bảng nào trong bộ được chuẩn hoá (cả bộ hoặc không).
4. **Files first, database later**: PostgreSQL là premature optimization cho Phase 1. File-based (git + markdown + parquet) đủ cho catalog + preview + tracking. DB chỉ thêm khi Phase 2 promotion thực sự cần.
5. **AI-assisted standardization**: Đừng bắt user tự viết metadata/dictionary — họ sẽ không viết, hoặc viết kém. AI propose, user review. Standardize tại upload time, không sau.
6. **Iterative**: Mỗi phase thu thập usage data → quyết định phase sau. Không over-engineer sớm.
7. **Vietnamese-first**: UI, query, response đều tiếng Việt.
