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

- [ ] No [NEEDS CLARIFICATION] markers remain — **2 còn lại** (FR-027, FR-028)
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
| Số câu hỏi chuẩn | **8** | *(không phải 26 như một tài liệu khác ghi)* |
| Tỷ lệ trả lời thành công | 87,5% | 7/8 câu trả về được kết quả |
| **Độ chính xác** | **100%** | Nhắc tới dataset nào là đúng dataset đó |
| **Tỷ lệ tìm hết** | **42,9%** | **Bỏ sót hơn một nửa** dataset lẽ ra phải tìm được |
| Tuân thủ tiếng Việt | 100% | |

**Cặp số 100% / 42,9% là phát hiện quan trọng nhất của spec này.** Nó mô tả chính
xác kiểu sai của hệ thống: nó **không bịa**, nhưng nó **bỏ sót**. Với người dùng,
đây là kiểu sai khó nhận ra nhất — câu trả lời trông đáng tin, có nguồn, bấm được,
nên không ai nghĩ là còn thiếu. Phóng viên tưởng kho chỉ có bấy nhiêu.

Số đo chạy ngày 2026-07-24 khi kho có **8 dataset**. Kho hiện có **17**. Chưa đo lại.

### Hai marker `[NEEDS CLARIFICATION]` còn lại

- **FR-027** — ngưỡng tỷ lệ tìm hết tối thiểu chấp nhận được là bao nhiêu, và có
  cần đo lại sau khi kho tăng gấp đôi không?
- **FR-028** — lời mời nhập câu hỏi dùng văn phong suồng sã, một câu nêu đích danh
  đồng nghiệp và chuyện chi phí nội bộ. Giữ hay chuyển trung tính?

Cả hai đều là **quyết định sản phẩm**, không phải thiếu thông tin.

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

## Ghi nhận sai lệch tài liệu

`docs/phase-2.md` ghi bộ câu hỏi chuẩn có **26 câu**. File thật `eval/gold-questions.json`
có **8 câu**, và báo cáo `eval/reports/2026-07-24.json` cũng ghi `total: 8`. Cần
sửa `docs/phase-2.md`.
