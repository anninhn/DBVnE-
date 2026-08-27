# Specification Quality Checklist: Discovery Chat

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

### Số đo chất lượng thật (`eval/reports/2026-07-24.json`)

| Chỉ số | Giá trị | Nghĩa là |
|---|---|---|
| Số câu hỏi chuẩn | **8** | |
| Tỷ lệ trả lời thành công | 87,5% | 7/8 câu trả về được kết quả |
| **Độ chính xác** | **100%** | Nhắc tới dataset nào là đúng dataset đó |
| **Tỷ lệ tìm hết** | **42,9%** | **Bỏ sót hơn một nửa** dataset lẽ ra phải tìm được |
| Tuân thủ tiếng Việt | 100% | |

**Cặp số 100% / 42,9% là phát hiện quan trọng nhất của spec này.** Nó mô tả chính
xác kiểu sai của hệ thống: nó **không bịa**, nhưng nó **bỏ sót**. Với người dùng,
đây là kiểu sai khó nhận ra nhất — câu trả lời trông đáng tin, có nguồn, bấm được,
nên không ai nghĩ là còn thiếu. Phóng viên tưởng kho chỉ có bấy nhiêu.

Số đo chạy ngày 2026-07-24 khi kho có **8 dataset**. Kho hiện có **17**. Chưa đo lại.

### Hai marker đã chốt 2026-08-24 — PASS 16/16

- **FR-027** → **không đặt ngưỡng, theo dõi xu hướng.** Bộ câu hỏi chuẩn 8 câu là
  mẫu quá nhỏ để một con số ngưỡng có ý nghĩa; đặt ngưỡng trên đó tạo mục tiêu
  giả. Thay bằng yêu cầu lưu kết quả mỗi lần đo kèm ngày và số dataset, để **so
  sánh giữa các lần**. Đánh đổi đã ghi rõ trong spec: mất tín hiệu tự động, bù
  bằng tín hiệu xu hướng có ý nghĩa hơn.
- **FR-028** → **giữ văn phong hiện tại.** Quyết định có chủ đích cho công cụ nội
  bộ của nhóm nhỏ đã biết nhau. Spec ghi kèm **điều kiện xem lại**: khi sản phẩm
  mở rộng ra ngoài nhóm ban đầu.

Cả hai đều không cần đổi code — spec ghi lại quyết định để người sau không tưởng
là sơ suất rồi tự đi "sửa".

### Ranh giới quan trọng nhất của spec này

Chat ở đây trả về **dataset nào phù hợp**, KHÔNG trả về **con số là bao nhiêu**.

Nhầm hai thứ này là hiểu sai cả sản phẩm — và tài liệu thiết kế ghi rõ đây chính
là lời hứa gốc của Phase 2 mà bản đã ship chưa thực hiện. Trả lời bằng giá trị
thật cần một bộ bảo đảm khác hẳn (kiểm chứng con số, cảnh báo số sơ bộ, hiện truy
vấn đã dùng) — thuộc spec `007`.

## Kiểm tra đối chiếu Constitution

| Principle | Áp dụng trong spec này |
|---|---|
| I. Accuracy First | FR-007 (không hạ ngưỡng để có kết quả), FR-009 (chỉ dataset thật), SC-003 (không bịa dataset). **Lưu ý**: V1–V6 chưa áp dụng ở đây vì spec này không trả con số |
| II. Bộ nguồn không trộn | Không áp dụng |
| III. File là sự thật | Assumptions — danh sách dataset đưa vào ngữ cảnh dẫn xuất từ metadata, dựng lại được |
| IV. Demand-driven | Assumptions — chưa nhớ ngữ cảnh, chưa nhớ tạm câu trả lời, chưa lọc sơ bộ; cả ba hoãn tới khi có tín hiệu cần |
| V. AI đề xuất, người quyết | FR-008 (gợi ý chỉ điền vào ô, không tự gửi) — người dùng giữ quyền quyết định hỏi gì |

Ràng buộc kỹ thuật liên quan: #7 Vietnamese-first (FR-006) · #4 mọi thay đổi qua API.

## Sai lệch tài liệu đã sửa

Hai chỗ trong `docs/phase-2.md`, sửa cùng ngày:

1. **Số câu hỏi chuẩn** — ghi "26 gold questions" ở hai chỗ; file thật có **8 câu**
   (`eval/gold-questions.json` và `eval/reports/2026-07-24.json` đều xác nhận).
2. **Báo cáo eval thiếu chỉ số bất lợi** — dòng tổng kết liệt kê ba số đẹp
   (87,5% success · 100% accuracy · 100% Vietnamese) và **bỏ qua recall 42,9%** —
   đúng con số duy nhất cho thấy điểm yếu. Đã bổ sung kèm giải thích vì sao cặp
   số 100%/42,9% quan trọng, và ghi rõ số đo chạy khi kho có 8 dataset, hiện 17.

Chỗ thứ hai đáng ngại hơn chỗ thứ nhất: một tài liệu wrap-up chọn lọc chỉ số có
lợi khiến người đọc tin sản phẩm tốt hơn thực tế.
