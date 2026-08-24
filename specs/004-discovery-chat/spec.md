# Feature Specification: Discovery Chat

**Feature Branch**: `004-discovery-chat`

**Created**: 2026-08-24

**Status**: DELIVERED — retro-documented

**Input**: Retro-spec cho code đã ship và đang chạy production. Phạm vi: phóng
viên hỏi bằng tiếng Việt tự nhiên để tìm dataset phù hợp, thay vì phải tự lọc và
tự đoán từ khoá.

> **Ghi chú về phạm vi**: Chat ở spec này trả về **dataset nào phù hợp**, KHÔNG
> trả về **con số là bao nhiêu**. Trả lời bằng giá trị thật thuộc spec `007`.
> Đây là ranh giới quan trọng — nhầm hai thứ này là hiểu sai cả sản phẩm.
>
> Không chạy `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hỏi bằng lời thay vì tự lọc (Priority: P1)

Phóng viên không biết kho có gì, cũng không biết đặt từ khoá nào. Họ gõ câu hỏi
đời thường — *"có data gì về rừng ở Tây Nguyên không?"* — và nhận về vài dataset
kèm lý do vì sao mỗi cái phù hợp. Câu trả lời hiện dần ra chứ không bắt chờ một
khối im lặng.

**Why this priority**: Bộ lọc chỉ giúp người đã biết mình tìm gì. Phóng viên
thường không biết — họ có câu hỏi, không có từ khoá.

**Independent Test**: Hỏi một câu tự nhiên về chủ đề có trong kho, xác nhận nhận
về dataset đúng kèm lý do.

**Acceptance Scenarios**:

1. **Given** người dùng đã đăng nhập, **When** gõ một câu hỏi tiếng Việt tự
   nhiên, **Then** nhận về danh sách dataset phù hợp, mỗi cái kèm một câu giải
   thích vì sao.
2. **Given** hệ thống đang soạn câu trả lời, **When** người dùng chờ, **Then**
   thấy nội dung hiện dần — không phải màn hình trống không phản hồi.
3. **Given** câu trả lời đã xong, **When** người dùng đọc, **Then** mỗi dataset
   được nhắc tới đều có thẻ bấm được dẫn thẳng tới dataset đó.
4. **Given** **không** dataset nào thực sự phù hợp, **When** hệ thống trả lời,
   **Then** nói thẳng là không có — **KHÔNG** được hạ ngưỡng để đưa ra thứ gần
   gần cho có.
5. **Given** người dùng chưa đăng nhập, **When** mở trang hỏi đáp, **Then** hệ
   thống yêu cầu đăng nhập trước.
6. **Given** câu trả lời có gợi ý câu hỏi tiếp theo, **When** người dùng bấm vào,
   **Then** câu đó được **điền vào ô nhập** — KHÔNG tự động gửi đi.

---

### User Story 2 - Hỏi sâu về một dataset cụ thể (Priority: P2)

Phóng viên đang xem một dataset và muốn hỏi kỹ hơn về nó — có cột gì, phủ những
năm nào. Họ bấm nút hỏi ngay từ trang dataset, và hệ thống biết đang nói về
dataset nào mà không cần họ mô tả lại.

**Why this priority**: Không có bước này, người dùng phải copy tên dataset vào
câu hỏi và hy vọng hệ thống hiểu đúng.

**Independent Test**: Từ trang một dataset, bấm nút hỏi, xác nhận hệ thống hiển
thị dataset đang gắn và trả lời dựa trên nó.

**Acceptance Scenarios**:

1. **Given** người dùng đang xem một dataset, **When** bấm nút hỏi về dataset
   này, **Then** trang hỏi đáp mở ra với dataset đó **đã được gắn sẵn** và hiện
   rõ trên giao diện.
2. **Given** một dataset đang được gắn, **When** người dùng đặt câu hỏi, **Then**
   câu trả lời ưu tiên dựa trên dataset đó.
3. **Given** dataset được gắn đã bị gỡ khỏi kho, **When** hệ thống xử lý, **Then**
   bỏ qua phần gắn và trả lời bình thường — không báo lỗi cho người dùng.

---

### User Story 3 - Nói cho hệ thống biết câu trả lời có dùng được không (Priority: P3)

Sau mỗi câu trả lời, người dùng bấm một nút đánh giá. Nếu không hài lòng, họ ghi
thêm vài chữ vì sao. Dữ liệu này dùng để biết chỗ nào hệ thống trả lời kém.

**Why this priority**: Cần để cải thiện, nhưng không chặn việc dùng hằng ngày.

**Independent Test**: Đánh giá một câu trả lời kèm ghi chú, xác nhận được ghi lại.

**Acceptance Scenarios**:

1. **Given** một câu trả lời vừa hiện ra, **When** người dùng đánh giá, **Then**
   hệ thống ghi nhận.
2. **Given** người dùng đánh giá tiêu cực, **When** hệ thống phản hồi, **Then**
   mở ô cho họ ghi lý do trước khi gửi.
3. **Given** việc ghi nhận đánh giá thất bại, **When** lỗi xảy ra, **Then** người
   dùng KHÔNG bị làm phiền — đây là việc phụ, không chặn luồng chính.
4. **Given** mọi câu hỏi, **When** hệ thống ghi nhật ký, **Then** bản ghi PHẢI
   kèm **người hỏi** — để biết ai cần gì.

---

### Edge Cases

- **Câu trả lời bị cắt giữa chừng vì quá dài** — hệ thống ghi cảnh báo lại để
  người vận hành biết, thay vì âm thầm trả về kết quả thiếu.
- **Mô hình trả về nội dung không đúng khuôn dạng** — hệ thống vẫn cố bóc tách
  phần dùng được thay vì bỏ cả câu trả lời.
- **Người dùng hỏi quá nhiều trong một ngày** — hệ thống từ chối kèm thông báo
  rõ ràng, và hạn mức tính **theo từng người**, không gộp chung.
- **Toàn hệ thống chạm trần chi phí trong ngày** — từ chối kèm thông báo riêng,
  phân biệt với trường hợp cá nhân vượt hạn mức.
- **Không đọc được danh sách dataset** — báo lỗi rõ, không trả lời dựa trên
  thông tin rỗng.
- **Câu hỏi quá dài** — từ chối trước khi gửi đi xử lý.

## Requirements *(mandatory)*

### Functional Requirements

**Hỏi và trả lời**

- **FR-001**: Chỉ người đã đăng nhập MUST dùng được chức năng hỏi đáp.
- **FR-002**: Hệ thống MUST nhận câu hỏi bằng tiếng Việt tự nhiên và trả về danh
  sách dataset phù hợp.
- **FR-003**: Mỗi dataset được nhắc tới MUST kèm một câu giải thích vì sao nó phù
  hợp với câu hỏi.
- **FR-004**: Mỗi dataset được nhắc tới MUST có đường dẫn bấm được tới dataset đó.
- **FR-005**: Câu trả lời MUST hiện dần trong lúc soạn, không bắt người dùng chờ
  trước một màn hình không phản hồi.
- **FR-006**: Câu trả lời MUST bằng tiếng Việt.
- **FR-007**: Khi không có dataset nào thực sự phù hợp, hệ thống MUST nói thẳng
  là không có. **CẤM** hạ ngưỡng để đưa ra kết quả gần đúng cho có.
- **FR-008**: Gợi ý câu hỏi tiếp theo MUST chỉ điền vào ô nhập, KHÔNG tự gửi —
  người dùng giữ quyền quyết định hỏi gì.
- **FR-009**: Hệ thống MUST chỉ trả lời dựa trên dataset **thực sự có** trong kho;
  dataset đã gỡ MUST không xuất hiện.

**Gắn dataset cụ thể**

- **FR-010**: Người dùng MUST gắn được một dataset cụ thể vào câu hỏi, khởi động
  từ trang dataset đó.
- **FR-011**: Dataset đang gắn MUST hiện rõ trên giao diện để người dùng biết
  ngữ cảnh.
- **FR-012**: Khi có dataset gắn, câu trả lời MUST ưu tiên dựa trên dataset đó.
- **FR-013**: Dataset gắn không còn tồn tại MUST được bỏ qua trong im lặng —
  người dùng vẫn nhận được câu trả lời bình thường.

**Đánh giá và nhật ký**

- **FR-014**: Người dùng MUST đánh giá được từng câu trả lời.
- **FR-015**: Đánh giá tiêu cực MUST cho phép ghi thêm lý do.
- **FR-016**: Ghi nhận đánh giá thất bại MUST không làm gián đoạn người dùng.
- **FR-017**: Mọi câu hỏi MUST được ghi nhật ký kèm **người hỏi**, câu hỏi, tóm
  tắt trả lời, dataset được nhắc tới, và thời gian phản hồi.
- **FR-018**: Khoá ghi nhận người hỏi MUST là định danh thật; CẤM dùng giá trị
  mặc định khiến mọi người gộp làm một.

**Giới hạn sử dụng**

- **FR-019**: Hệ thống MUST giới hạn số câu hỏi **mỗi người mỗi ngày**.
- **FR-020**: Hệ thống MUST có trần tổng cho toàn hệ thống mỗi ngày, để chi phí
  không vượt kiểm soát.
- **FR-021**: Hai loại từ chối trên MUST có thông báo **khác nhau**, để người
  dùng biết là do mình hay do hệ thống.
- **FR-022**: Câu hỏi vượt quá độ dài hợp lý MUST bị từ chối trước khi gửi đi xử lý.

**Chất lượng và độ bền**

- **FR-023**: Khi mô hình trả về nội dung không đúng khuôn dạng, hệ thống MUST
  cố bóc tách phần dùng được thay vì bỏ cả câu trả lời.
- **FR-024**: Khi câu trả lời bị cắt vì quá dài, hệ thống MUST ghi lại cảnh báo
  cho người vận hành.
- **FR-025**: Hệ thống MUST có bộ câu hỏi chuẩn để đo chất lượng trả lời, chạy
  lại được bất cứ lúc nào.
- **FR-026**: Bộ đo MUST theo dõi tối thiểu: tỷ lệ trả lời thành công, độ chính
  xác của dataset được nhắc tới, và **tỷ lệ tìm ra hết** dataset lẽ ra phải tìm được.

**Quyết định còn mở**

- **FR-027**: Đo ngày 2026-07-24 cho thấy khi hệ thống nhắc tới một dataset thì
  **luôn đúng** (độ chính xác 100%), nhưng nó **bỏ sót hơn một nửa** số dataset
  lẽ ra phải tìm được (tỷ lệ tìm hết 42,9%). Người dùng nhận về câu trả lời trông
  đáng tin nhưng thiếu.
  [NEEDS CLARIFICATION: ngưỡng tỷ lệ tìm hết tối thiểu chấp nhận được là bao
  nhiêu, và có cần đo lại sau khi kho tăng từ 8 lên 17 dataset không?]
- **FR-028**: Lời mời nhập câu hỏi hiện dùng văn phong suồng sã, trong đó một câu
  nêu đích danh một đồng nghiệp và chuyện chi phí nội bộ.
  [NEEDS CLARIFICATION: giữ văn phong hiện tại, hay chuyển sang trung tính khi
  sản phẩm mở rộng ra ngoài nhóm nhỏ ban đầu?]

### Key Entities

- **Câu hỏi**: Điều người dùng muốn biết, kèm dataset gắn nếu có.
- **Câu trả lời**: Phần văn xuôi giải thích, danh sách dataset được nhắc tới kèm
  lý do và mức độ chắc chắn, và các gợi ý hỏi tiếp.
- **Bản ghi nhật ký**: Một lượt hỏi đáp — người hỏi, câu hỏi, tóm tắt trả lời,
  dataset được nhắc tới, thời gian phản hồi, đánh giá của người dùng.
- **Hạn mức**: Số câu hỏi đã dùng trong ngày, theo từng người và theo toàn hệ thống.
- **Bộ câu hỏi chuẩn**: Danh sách câu hỏi kèm dataset đúng, dùng để đo chất lượng.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Phóng viên tìm ra dataset cần dùng bằng **một câu hỏi đời thường**,
  không cần biết trước từ khoá hay tên dataset.
- **SC-002**: Người dùng thấy phản hồi bắt đầu xuất hiện trong vòng **vài giây**
  kể từ khi gửi câu hỏi.
- **SC-003**: **100%** dataset được nhắc tới thực sự tồn tại trong kho và bấm
  được — không có dataset bịa ra.
- **SC-004**: **100%** câu trả lời bằng tiếng Việt.
- **SC-005**: Khi không có dữ liệu phù hợp, hệ thống nói thẳng — **0** trường hợp
  đưa ra kết quả gần đúng cho có.
- **SC-006**: **100%** bản ghi nhật ký truy được người hỏi.
- **SC-007**: Chi phí vận hành mỗi ngày **không vượt** trần đã đặt.

## Assumptions

- **Retro-spec**: Năng lực mô tả ở đây đã ship và đang chạy production.
- **Chỉ tìm dataset, chưa trả lời bằng số**: Đây là ranh giới cố ý. Trả lời bằng
  giá trị thật cần nhiều bảo đảm khác hẳn (kiểm chứng con số, cảnh báo số sơ bộ,
  hiện truy vấn đã dùng) — thuộc spec `007`.
- **Một câu một lần, không nhớ ngữ cảnh**: Mỗi câu hỏi độc lập. Hỏi nối tiếp
  dạng "còn tỉnh khác thì sao?" chưa hỗ trợ. Chấp nhận ở giai đoạn hiện tại.
- **Không nhớ tạm câu trả lời**: Hai người hỏi cùng một câu sẽ tốn hai lần chi phí.
  Chấp nhận ở lưu lượng hiện tại.
- **Toàn bộ danh sách dataset được đưa vào ngữ cảnh mỗi lần hỏi**: Cách này đơn
  giản và đủ tốt ở quy mô vài chục dataset. Khi kho lên tới hàng trăm, cần lớp
  lọc sơ bộ trước — thuộc spec `006`/`007`.
- **Chất lượng đo bằng bộ câu hỏi chuẩn, không phải cảm tính**: Bộ đo hiện có 8
  câu, chạy lần gần nhất 2026-07-24 khi kho còn 8 dataset. Kho hiện có 17 —
  **số đo đã cũ**.
- **Phụ thuộc spec khác**: `001` (dataset được nhắc tới dẫn về đâu) · `003` (đăng
  nhập, nhật ký kèm người hỏi).
