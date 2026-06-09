# VNExpress Data Platform

## Overview

**VNExpress Data Platform** là kho dữ liệu và công cụ情报 cho tòa soạn VNExpress, xây dựng theo 3 giai đoạn:

1. **Phase 1 — Dataset Hub**: Platform upload, browse, preview datasets theo mô hình Hugging Face Hub. Phục vụ nhóm data journalist đầu tiên — họ cần tìm dataset phù hợp cho topic báo chí.
2. **Phase 2 — Query Layer**: Structured query system cho datasets phổ biến. Phóng viên hỏi "GRDP TPHCM năm nay 20% có bất thường so 20 năm trước không?" → platform trả lời ngay, chính xác, dựa trên data đã lưu.
3. **Phase 3 — Intelligence Platform**: RAG + advanced AI cho toàn tòa soạn (300 phóng viên). Hỏi đáp, tìm potential story, fact-check, multi-source reasoning.

## Motivation

Phóng viên VNExpress cần dữ liệu liên tục: số liệu kinh tế, dân số, bầu cử, khí hậu, báo cáo PDF, phỏng vấn MP3... Hiện tại:

- **Fragmentation**: Data rải rác — PDF GSO, Excel lẻ tẻ, file cá nhân, Google Sheets shared
- **No single source of truth**: Cùng 1 con số, 2 nguồn khác nhau, không biết cái nào đúng
- **No provenance**: Không truy được nguồn gốc — ai nhập, từ đâu, khi nào
- **Manual lookup**: Phóng viên tự tìm, tự đối chiếu, mất giờ

Platform này giải quyết bằng cách: tập trung mọi dataset → chuẩn hóa → cho phép query → trả lời câu hỏi từ data.

## Target Audience

- **Hoa (Reporter)**: Cần fact-check nhanh. "GRDP TPHCM 20% năm nay có đúng không?" → platform trả lời với nguồn. Non-technical, dùng search + chat. (Phase 2+)
- **Minh (Editor)**: Quản lý data tòa soạn. Upload dataset mới, kiểm tra data quality, giao bài dựa trên insight từ data. (Phase 1+)
- **Ninh (Data Journalist)**: Tìm potential story, phân tích sâu, xây pipeline xử lý data. Power user, cần API access + raw data download. (Phase 1+)

## Scope

### Phase 1 — Dataset Hub (MVP)

- Platform upload dataset (bất kỳ loại: CSV, Excel, PDF, MP3, GeoJSON...)
- Browse/search datasets theo category, tags, keyword
- Dataset detail page: metadata, data dictionary, data quality report, preview
- Data dictionary auto-generated từ metadata
- Data quality: provenance (nguồn, ai nhập, khi nào), freshness, completeness
- Download file gốc
- **Target user**: Ninh (Data Journalist) + Minh (Editor)

### Phase 2 — Query Layer

- Query templates: phóng viên chọn template, điền tham số → kết quả deterministic
  - Ví dụ: "So sánh [chỉ số] của [tỉnh A] vs [tỉnh B] giai đoạn [năm]"
  - Ví dụ: "Xu hướng [chỉ số] của [tỉnh] trong [N] năm — có bất thường không?"
- Popular dataset promotion: merge/structure datasets dùng nhiều → fast query
- Text-to-SQL (sau khi template system ổn định): free-form question → SQL → answer
- Source verification: luôn show query + data gốc để phóng viên tự kiểm chứng
- **Target user**: Hoa (Reporter) + Ninh

### Phase 3 — Intelligence Platform

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
| Data centralization | 80% datasets tòa soạn có trên platform | Inventory audit |
| Upload workflow | Data journalist upload 1 dataset mới < 5 phút | User test |
| Query accuracy | 100% câu trả lời có kèm nguồn data gốc | Verify source links |
| Query speed | Template query < 3 giây | Measure latency |
| Adoption | 50+ phóng viên dùng platform hàng tuần | Usage analytics |

## Key Principles

1. **Accuracy first**: Mỗi con số phải trace được nguồn gốc. Sai số → tin sai → mất uy tín.
2. **Source transparency**: Luôn show data gốc, query, reasoning — phóng viên tự verify.
3. **Iterative**: Phase 1 → thu thập usage data → quyết định Phase 2. Không over-engineer sớm.
4. **Store everything**: Structured data (PostgreSQL) + unstructured (R2) — không loại trừ.
5. **Vietnamese-first**: UI, query, response đều tiếng Việt.
