# Specification Quality Checklist: Discovery Chat ở quy mô vài nghìn dataset

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-03
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

### Lần soát 1 — 2026-09-03

**Không đạt: 1 mục**

- `No [NEEDS CLARIFICATION] markers remain` — còn **1** marker ở **FR-054** (hạn mức
  câu hỏi mỗi ngày sau khi chi phí giảm). Đây là quyết định vận hành, không có mặc
  định hợp lý nào để đoán: nới quá thì mất tác dụng kiểm soát chi phí, nới ít thì
  không tận dụng được việc chi phí đã giảm 10 lần. Đã trình câu hỏi cho người quyết định.

**Đạt, kèm ghi chú**

- `No implementation details` — chi tiết kỹ thuật (số token đo được, trần API của nhà
  cung cấp, cách lưu vector) được đặt **có chủ ý** ở mục Assumptions theo yêu cầu của
  người dùng, không nằm trong Requirements hay Success Criteria. Requirements không
  nhắc tên hàm, tên model, tên thư viện nào.
- `Success criteria are technology-agnostic` — SC-001/SC-002 nói về **chi phí mỗi câu
  hỏi**, là chỉ số kinh doanh chứ không phải chỉ số kỹ thuật; giữ lại vì đây là lý do
  chính khiến hạn mức phải thấp, tức là ảnh hưởng trực tiếp tới người dùng.
- Nguồn số liệu và phần phân tích phương án nằm ở `docs/de-xuat-ama-quy-mo-lon.md`.
  Spec này chỉ tham chiếu, không lặp lại.

### Lần soát 2 — 2026-09-03, sau khi sửa hướng tiếp cận

Sửa theo quyết định: tra cứu viết thành **năng lực dùng chung** thay vì các bước bên
trong luồng trả lời. Thêm nhóm requirement `Năng lực tra cứu dùng chung` (FR-055→FR-060),
`SC-013`, hai key entity (`Retrieval capability`, `Surface`), một edge case, và ba lý do
ở mục Assumptions.

Soát lại: **vẫn 15/16 đạt**, mục không đạt vẫn là marker ở FR-054.

Kiểm riêng nguy cơ rò rỉ kỹ thuật sau khi thêm nhóm mới — grep các từ `token`,
`embedding`, `vector`, `DuckDB`, `index.json`, `API`, `cache`, `Gemini` trong toàn bộ
Requirements + Success Criteria: **không còn từ nào**. FR-055 mô tả năng lực bằng đầu
vào/đầu ra, FR-057 mô tả ba quy tắc đọc dữ liệu bằng hiện tượng ("định dạng số của
từng dataset", "một cột địa bàn chứa nhiều cấp hành chính lẫn nhau") chứ không bằng
tên kỹ thuật.

Ghi rõ trong Assumptions rằng **mặt tiền thứ hai ngoài phạm vi đợt này** — spec chỉ
đòi năng lực độc lập với mặt tiền và chứng minh bằng SC-013, không đòi xây thêm mặt
tiền. Tránh việc phạm vi phình ra khi đọc FR-058.

### Lần soát 3 — 2026-09-03, đã chốt hạn mức

FR-054 nhận đáp án: **500 câu/người/ngày, 5.000 câu/hệ thống/ngày**. Marker
[NEEDS CLARIFICATION] cuối cùng đã được thay bằng con số cụ thể, và thêm FR-061 cho
việc phân biệt hai loại thông báo từ chối.

**Kết quả: 16/16 đạt. Spec sẵn sàng cho `/speckit-clarify` hoặc thi công.**

(Checklist có 16 mục: Content Quality 4 + Requirement Completeness 8 + Feature Readiness 4.)

### Lần soát 4 — 2026-09-03, sau `/speckit-clarify`

Bốn câu hỏi được trả lời và ghi vào mục `## Clarifications` mới, kèm sửa vào các
requirement tương ứng:

| Câu | Kết quả | Sửa vào |
|---|---|---|
| Ngưỡng "ít giá trị" của một cột phân loại | **tối đa 200** | FR-038 |
| Số dataset đưa vào bước trả lời | **tối đa 20**, xếp theo mức liên quan | FR-055 |
| Khi nào là cuộc trò chuyện mới | **chỉ khi người dùng chủ động** | FR-046, FR-062 (mới) |
| Câu từ chối chỉ người dùng làm gì tiếp | dataset + cột + phạm vi + **đường dẫn xem trước** | FR-040, FR-063 (mới), US1 scenario 1 |

Thêm FR-062, FR-063 → tổng **36 FR**. Spec 419 dòng.

**Sửa thuật ngữ**: bỏ hết từ "mạch hội thoại" / "mạch mới" — người dùng chỉ ra đó là
từ tự đặt, không phải tiếng Việt tự nhiên. Thay bằng **cuộc trò chuyện**, đồng bộ 9
chỗ gồm cả key entity. Đây đúng là mục `Terminology & Consistency` của taxonomy, và
nó cũng liên quan mục checklist `Written for non-technical stakeholders`.

Kiểm lại rò rỉ kỹ thuật sau 4 lần sửa: Requirements + Success Criteria **không còn**
từ nào trong `token`/`embedding`/`vector`/`DuckDB`/`index.json`/`API`/`cache`/`Gemini`.

**Kết quả: vẫn 16/16 đạt.** Không mục nào hồi quy.

### Đã hoãn lại (không hỏi)

- **Ai được phép gọi năng lực tra cứu** (FR-060 nói phải từ chối rõ ràng khi không có
  quyền, nhưng không nói ai có quyền). Hoãn vì mặt tiền thứ hai đã ở ngoài phạm vi
  đợt này, nên trong đợt này quyền chỉ là quyền đăng nhập sẵn có của trang hỏi đáp
  (FR-001 spec 004). Phải chốt trước khi mở năng lực cho công cụ ngoài.

### Ghi chú về thứ tự

US6 (bộ đo chất lượng) xếp **P3** vì không phải hành trình của phóng viên, nhưng
**phải làm trước** US1–US5 về mặt thứ tự thi công — không có thước đo thì SC-004 tới
SC-008 không kiểm được. Ưu tiên và thứ tự thi công là hai chuyện khác nhau ở spec này.
