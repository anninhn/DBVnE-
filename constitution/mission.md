# Hồ sơ toàn cảnh 34 tỉnh, thành Việt Nam

## Overview

**34 Tỉnh Thành** là kho tri thức (knowledge repository) cho tòa soạn VNExpress, mô hình tham khảo Hugging Face Hub:

1. **Thu thập** — nhập chỉ số KT-XH, dữ liệu hạ tầng, khí hậu, file quy hoạch (PDF), ghi âm phỏng vấn (MP3) cho 34 tỉnh thành (sau sáp nhập)
2. **Lưu trữ lai** — số liệu cấu trúc trong PostgreSQL (JSONB), file vật lý (PDF, MP3, XLSX) trên Object Storage (Cloudflare R2)
3. **Duyệt & Tìm kiếm** — phóng viên vào trang tỉnh → thấy mọi tài nguyên sẵn có → tải file gốc, giống duyệt dataset trên Hugging Face
4. **Traceability** — mỗi con số đi kèm link đến file gốc trên Object Storage, phóng viên click đối chiếu bằng mắt
5. **Versioning** — lịch sử cập nhật theo mô hình Git nhẹ (ai sửa lúc nào, snapshot trước sau)

Hệ thống là **wiki tra cứu**, không phải analytics engine. Phóng viên browse/search để tìm data, bước phân tích tổng hợp tự làm.

## Motivation

Sáp nhập hành chính 2025 giảm 63 tỉnh xuống 34. Ba gap:

- **Merge gap**: Không có dataset thống nhất ánh xạ pre-merger → 34 tỉnh mới — phóng viên phải tự ghép thủ công
- **Access gap**: Phóng viên VNExpress dựa vào PDF GSO rải rác, Excel lẻ tẻ — không có nơi tập trung để duyệt, tìm kiếm, tải file gốc
- **Traceability gap**: Khi dùng số liệu trong bài, không có cách nhanh chóng trỏ về file gốc để kiểm chứng

## Target Audience

- **Hoa (Reporter)**: Cần tìm chỉ số cụ thể (GRDP, số trường, giường bệnh) cho 1 tỉnh để trích dẫn trong bài. Non-technical — muốn search bar, click download.
- **Minh (Editor)**: Duyệt xem có data gì, phát hiện trend, giao bài. Upload dataset mới nhận từ cơ quan nhà nước.
- **Ninh (Data Journalist)**: Tìm kiếm potential story dựa trên data — so sánh tỉnh, phát hiện outlier, trả lời research questions. Xây pipeline, viết script xử lý, thiết kế visualization. Power user, quản lý hệ thống.

## Scope

### MVP (Giai đoạn 1 — Tháng 5–6)

- [ ] PostgreSQL schema (~5 tables: entities_catalog, resources, resource_versions, indicator_metadata, tags)
- [ ] Object Storage (Cloudflare R2) cho file nhị phân
- [ ] 34 tỉnh seeded (post-merger, mapping old_codes)
- [ ] Upload UI: phóng viên upload số liệu + file đính kèm qua web form
- [ ] Wiki-style browse: trang tỉnh hiển thị mọi tài nguyên, filter theo tags/loại/năm
- [ ] Version history: mỗi update tạo snapshot, xem được timeline
- [ ] Traceability: số liệu đi kèm link file gốc
- [ ] Auto-generated data dictionary (từ indicator_metadata)
- [ ] Search: tìm theo keyword, tags, loại tài nguyên

### Post-MVP (incremental, không thay đổi hệ thống)

Tháng 6–12: bổ sung data qua cùng workflow (upload → resource → version). Hệ thống không đổi, chỉ data chảy vào.

### Dashboard Layer (Giai đoạn cuối — Tháng 12)

Khi đã xác định được chỉ số nào cần query nhanh (hot indicators), promote sang materialized views hoặc bảng riêng để phục vụ dashboard. Không redesign — chỉ thêm layer phía trên.

### Deferred (Post-MVP)

- User authentication và role-based access (MVP là internal tool)
- Public-facing data portal (project riêng)
- Dashboard tương tác (sau khi có đủ data để xác định hot indicators)

## Success Metrics

| What We Measure | Success Threshold | Method |
|-----------------|-------------------|--------|
| Data coverage | 34 provinces × 10 indicators × 5 years populated | Count resources in database |
| Upload workflow | Phóng viên upload 1 dataset mới không cần giúp | User test với Hoa/Minh |
| Page load | Trang tỉnh load < 2 giây | Measure page load time |
| Traceability | 100% số liệu có link file gốc | Verify resources có file_url |
| Search | Tìm thấy data cần trong < 3 clicks | User test |
| Data dictionary | 100% indicator keys có metadata | Verify indicator_metadata rows |

## Open Questions

1. Province codes: theo chuẩn GSO mới hay định nghĩa internal IDs (như đề xuất `VN-LA` cho Long An)?
2. Tag vocabulary: cố định (chọn từ danh sách) hay tự do (phóng viên tự gõ)?
3. Object Storage: Cloudflare R2 hay Supabase Storage?
4. Xử lý tỉnh sáp nhập từ nhiều tỉnh cũ: tổng, trung bình gia quyền, hoặc giữ tất cả variants?
