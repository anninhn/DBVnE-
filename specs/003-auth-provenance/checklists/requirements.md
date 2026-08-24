# Specification Quality Checklist: Auth & Provenance

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-24
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
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

**Trạng thái: PASS 16/16.** Marker ở FR-032 đã được Ninh quyết ngày 2026-08-24:
**bổ sung năng lực gỡ liên kết bài báo.**

Khác ba retro-spec trước (chỉ ghi lại thứ đã có), đây là **năng lực mới** — spec
`003` vì vậy không còn thuần retro. Đã cài đặt cùng ngày:

- Đường gỡ ở tầng API, so khớp bằng cùng dạng chuẩn hoá mà thao tác thêm dùng
  để phát hiện trùng — nên URL thêm vào kiểu nào cũng gỡ được kiểu đó
- Nút gỡ hiện khi rê chuột lên từng bài, chỉ với người đã đăng nhập
- Cập nhật lạc quan: bỏ khỏi danh sách ngay, khôi phục nếu máy chủ từ chối
- Ghi vào lịch sử chỉnh sửa như mọi thay đổi metadata khác
- Làm mới cache ngay, cùng chuẩn với ba route ghi còn lại

## Hai vấn đề đã sửa cùng ngày

**FR-023 — bài báo mới không hiện ngay.** `/api/dataset/articles` là route ghi
**duy nhất** không làm mới cache, trong khi ba route còn lại (thêm dataset, sửa
metadata, gỡ dataset) đều có. Hậu quả: bài vừa thêm không xuất hiện cho tới khi
bộ nhớ tạm hết hạn. Đã thêm, giờ cả bốn route đồng nhất.

**FR-031 — nhật ký câu hỏi mất dấu người hỏi.** Khoá dùng để ghi nhận người hỏi
lấy từ một trường mà quy trình đăng nhập không bao giờ điền, nên rơi về giá trị
mặc định — **mọi người dùng gộp làm một**. Hai hậu quả: hạn mức câu hỏi mỗi
người biến thành hạn mức chung cho cả tòa soạn, và nhật ký không cho biết ai
hỏi gì. Đã sửa sáng nay (commit `3701154`), spec ghi lại thành ràng buộc.

## Quyết định bảo mật có chủ đích — không phải thiếu sót

Ghi rõ trong Assumptions để người đọc sau không tưởng là bỏ quên:

| Quyết định | Lý do |
|---|---|
| Phiên làm việc rất dài | Công cụ nội bộ, nhân sự đã biết nhau; ưu tiên ma sát thấp |
| Không xác thực hai lớp | Cùng lý do |
| Vai trò có trường nhưng chưa dùng | Mọi người đăng nhập làm được như nhau; phân quyền chưa cần ở quy mô hiện tại |
| Quản trị viên cấp mật khẩu, người dùng chưa tự đổi | Màn hình đổi mật khẩu đã lên kế hoạch, chưa làm |
| Đếm lượt tải có thể lệch vài đơn vị | Tín hiệu xu hướng, không phải số liệu đối soát |

Khi số người dùng tăng đáng kể, **cả năm dòng trên cần xem lại**.

## Kiểm tra đối chiếu Constitution

| Principle | Áp dụng trong spec này |
|---|---|
| I. Accuracy First | FR-014 (thời gian tuyệt đối), FR-012 (lịch sử chỉ nối thêm) — provenance là nền của "trace được nguồn" |
| II. Bộ nguồn không trộn | Không áp dụng |
| III. File là sự thật | FR-010–FR-016 — mọi dấu vết nằm trong bản ghi dataset và lịch sử phiên bản, không ở cơ sở dữ liệu riêng |
| IV. Demand-driven | Assumptions — vai trò, đổi mật khẩu, đếm chính xác đều hoãn vì chưa có nhu cầu đủ mạnh |
| V. AI đề xuất, người quyết | Không áp dụng |

Ràng buộc kỹ thuật liên quan: #4 mọi thay đổi qua API · #9 timestamp tuyệt đối
(FR-014) · #10 metadata bắt buộc.
