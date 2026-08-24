# Specification Quality Checklist: Upload & Metadata

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-24
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [ ] No [NEEDS CLARIFICATION] markers remain — **1 còn lại** (FR-033)
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**Một marker `[NEEDS CLARIFICATION]` còn lại — FR-033, năng lực gỡ dataset.**

Đây là **mâu thuẫn thật giữa giao diện và API**, phát hiện khi hai agent review
đưa ra kết luận ngược nhau và tôi phải kiểm chứng:

| | Trạng thái thật |
|---|---|
| API gỡ dataset | Đã bỏ guard môi trường — **chạy được ở production** |
| Bằng chứng đã dùng thật | Git log có 3 lần gỡ dataset trên nhánh chính |
| Nút trên giao diện | **Vẫn ẩn ở production** |

Khác với hai marker của spec `001` (nhãn sai, lựa chọn trùng — sửa được ngay),
cái này là **quyết định mở một năng lực có tính phá huỷ** cho 7 người dùng thật.
Không tự quyết.

## Sai lệch tài liệu đã phát hiện

`docs/phase-1.md` (hai chỗ) ghi *"hard delete dev-only"*. Thực tế là **soft
delete chạy được ở production**. Tài liệu này đóng băng từ 2026-07-24 và chưa
cập nhật sau khi spec `2026-07-24-auth-light` gỡ guard môi trường. Cần sửa
`docs/phase-1.md` bất kể FR-033 quyết theo hướng nào.

## Kiểm tra đối chiếu Constitution

| Principle | Áp dụng trong spec này |
|---|---|
| I. Accuracy First | FR-008 (quy ước thập phân), FR-021 (ghi an toàn, dataset không biến mất), FR-027 (lịch sử chỉnh sửa) |
| II. Bộ nguồn không trộn | FR-023 + Assumptions — luồng wizard KHÔNG chuẩn hoá file upload; nguồn có cấu trúc đi luồng riêng (spec `005`) |
| III. File là sự thật | FR-019 (xác minh file tồn tại trước khi ghi metadata), FR-020 (ghi một thao tác), FR-032 (xoá mềm không đụng file thô) |
| IV. Demand-driven | Assumptions — thay file và tự đổi mật khẩu là khoảng trống đã biết, chưa build vì chưa có nhu cầu đủ mạnh |
| V. AI đề xuất, người quyết | **Trọng tâm của spec này** — FR-010 (mọi đề xuất sửa được, không ghi thứ người dùng chưa xem), FR-011 (không chắc thì hỏi, không chọn hộ), Assumptions (nguồn structured thì không dùng AI) |

Ràng buộc kỹ thuật liên quan: #2 raw file không vào git (FR-004) · #3 upload qua
presigned URL (FR-004) · #4 mọi thay đổi qua API (FR-023) · #6 không thêm
dependency · #10 mỗi dataset phải có metadata (SC-002).

## Ba FR sinh từ bug đã sửa

Viết thành ràng buộc để không tái phát:

| FR | Bug gốc |
|---|---|
| FR-008 | `Number("1.234,56")` ra `NaN` → cột số kiểu Việt Nam biến mất khỏi phân bố giá trị |
| FR-021 | Tiêu đề chứa dấu nháy làm hỏng bản ghi → dataset biến mất khỏi kho |
| FR-026 | Sửa metadata dataset bản đồ làm mất số đối tượng, loại hình học, phạm vi toạ độ, hệ quy chiếu |
