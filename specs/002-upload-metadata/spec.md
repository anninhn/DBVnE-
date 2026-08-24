# Feature Specification: Upload & Metadata

**Feature Branch**: `002-upload-metadata`

**Created**: 2026-08-24

**Status**: DELIVERED — retro-documented

**Input**: Retro-spec cho code đã ship và đang chạy production. Phạm vi: cách
dữ liệu mới vào kho và cách metadata mô tả nó được tạo ra, sửa, và gỡ bỏ —
wizard bốn bước có AI hỗ trợ, data dictionary, sửa metadata, xoá mềm.

> **Ghi chú về retro-spec**: Tài liệu này mô tả năng lực **đã tồn tại**. Không
> chạy `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` cho spec này.
> Xem `specs/_archive/README.md` cho bản đồ spec cũ và các chỗ code đã trôi khỏi
> spec.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Đưa dữ liệu vào kho mà không phải tự viết metadata (Priority: P1)

Biên tập viên có một file dữ liệu và muốn đưa vào kho. Họ kéo thả file, chờ hệ
thống đọc và đề xuất sẵn tiêu đề, mô tả, chủ đề, tag, cùng bảng mô tả từng cột.
Họ đọc, sửa những chỗ AI đoán sai, rồi lưu. Không lúc nào phải nhìn một biểu mẫu
trống.

**Why this priority**: Không có bước này thì kho không có dữ liệu. Và nếu bắt
người dùng tự viết metadata từ trang trắng, họ sẽ không viết hoặc viết qua loa —
kho đầy file mà không tìm được gì.

**Independent Test**: Kéo một file CSV lạ vào, đi hết bốn bước, xác nhận dataset
xuất hiện trong kho với metadata và data dictionary đầy đủ.

**Acceptance Scenarios**:

1. **Given** người dùng đã đăng nhập, **When** kéo thả một file dạng bảng hoặc
   bản đồ, **Then** hệ thống nhận file và bắt đầu phân tích.
2. **Given** file vượt quá giới hạn dung lượng, **When** người dùng thả vào,
   **Then** hệ thống báo lỗi rõ ràng kèm dung lượng thật và giới hạn cho phép,
   trước khi tải lên.
3. **Given** file có định dạng không được hỗ trợ, **When** người dùng thả vào,
   **Then** hệ thống từ chối ngay và nêu các định dạng chấp nhận.
4. **Given** hệ thống đã đọc xong file, **When** hiển thị đề xuất, **Then** người
   dùng thấy tiêu đề, mô tả, chủ đề, tag, nguồn — **tất cả đều sửa được**.
5. **Given** AI không chắc về một suy đoán, **When** hiển thị đề xuất, **Then**
   hệ thống nêu rõ câu hỏi để người dùng xác nhận, thay vì im lặng chọn hộ.
6. **Given** người dùng sửa xong, **When** bấm lưu, **Then** metadata, data
   dictionary và mục lục kho được ghi **cùng một lần** — không có trạng thái nửa
   vời nơi metadata đã lưu mà mục lục chưa cập nhật.
7. **Given** đã lưu thành công, **When** hệ thống hiển thị kết quả, **Then**
   người dùng xem được nội dung vừa ghi và có đường dẫn tới dataset mới.

---

### User Story 2 - Mô tả từng cột dữ liệu để người sau hiểu được (Priority: P2)

Người đưa dữ liệu lên xem bảng mô tả cột mà hệ thống đề xuất — tên cột, kiểu dữ
liệu, đơn vị, mô tả — và sửa lại cho đúng. Với cột số, họ xác nhận quy ước thập
phân là kiểu Việt Nam hay kiểu Anh.

**Why this priority**: Data dictionary là thứ biến một file CSV vô danh thành dữ
liệu dùng được. Không có nó, người sau mở file ra không biết cột `dt` nghĩa là gì
hay đơn vị nào.

**Independent Test**: Đưa lên một file có cột số dùng dấu phẩy thập phân, xác
nhận hệ thống nhận ra và cho phép sửa quy ước.

**Acceptance Scenarios**:

1. **Given** một file dạng bảng, **When** hệ thống phân tích xong, **Then** mỗi
   cột có sẵn một dòng trong bảng mô tả với kiểu dữ liệu đã suy ra.
2. **Given** một cột số dùng quy ước Việt Nam (`1.234,56`), **When** hệ thống
   phân tích, **Then** quy ước thập phân được nhận ra và ghi lại cùng cột đó.
3. **Given** bảng mô tả cột đang hiển thị, **When** người dùng sửa bất kỳ ô nào,
   **Then** thay đổi được giữ và ghi vào dataset khi lưu.
4. **Given** một dataset không phải dạng bảng, **When** hệ thống lưu, **Then**
   vẫn tạo file mô tả với ghi chú rõ là dataset không có cột.

---

### User Story 3 - Sửa metadata sai mà không mất dữ liệu đã có (Priority: P2)

Sau khi dataset đã ở trong kho, người dùng phát hiện mô tả sai hoặc thiếu tag.
Họ mở trang sửa, chỉnh phần chữ, xem trước, rồi lưu. File đính kèm, lịch sử
chỉnh sửa, bài báo đã liên kết, và các thông tin kỹ thuật của dataset đều còn
nguyên.

**Why this priority**: Metadata luôn cần sửa. Nếu mỗi lần sửa lại mất một phần
dữ liệu thì người dùng sẽ không dám sửa, và kho sẽ đầy mô tả sai.

**Independent Test**: Sửa mô tả của một dataset bản đồ đã từng được liên kết bài
báo, xác nhận sau khi lưu vẫn còn đủ thông tin hình học và danh sách bài báo.

**Acceptance Scenarios**:

1. **Given** một dataset đã có trong kho, **When** người dùng mở trang sửa,
   **Then** thấy metadata và bảng mô tả cột hiện tại, đã điền sẵn.
2. **Given** đang sửa, **When** người dùng xem trước, **Then** thấy đúng nội dung
   sẽ được ghi, trước khi cam kết.
3. **Given** một dataset bản đồ, **When** người dùng sửa metadata rồi lưu,
   **Then** thông tin hình học của dataset (số đối tượng, loại hình học, phạm vi
   toạ độ, hệ quy chiếu) PHẢI còn nguyên.
4. **Given** một dataset đã liên kết bài báo, **When** người dùng sửa metadata
   rồi lưu, **Then** danh sách bài báo PHẢI còn nguyên.
5. **Given** một dataset đã bị sửa trước đó, **When** người dùng sửa tiếp,
   **Then** lịch sử chỉnh sửa cũ PHẢI còn nguyên và được nối thêm mục mới.
6. **Given** đang ở trang sửa, **When** người dùng nhìn định danh của dataset,
   **Then** định danh đó **không sửa được** — vì đường dẫn đã có thể được chia sẻ
   hoặc trích trong bài báo.
7. **Given** người dùng chỉ sửa phần chữ, **When** lưu, **Then** file đính kèm
   KHÔNG bị thay đổi — chức năng thay file không thuộc luồng này.

---

### User Story 4 - Gỡ dataset khỏi kho mà vẫn truy được (Priority: P3)

Người dùng cần gỡ một dataset đưa lên nhầm hoặc đã lỗi thời. Họ gõ lại định danh
để xác nhận, nêu lý do, và dataset biến mất khỏi kho. Nhưng bản ghi vẫn tồn tại
để sau này truy được ai gỡ, lúc nào, vì sao.

**Why this priority**: Cần thiết nhưng ít dùng. Ưu tiên thấp hơn ba luồng trên.

**Independent Test**: Gỡ một dataset, xác nhận nó biến mất khỏi kho nhưng vẫn
tìm được dấu vết trong nhật ký.

**Acceptance Scenarios**:

1. **Given** người dùng muốn gỡ một dataset, **When** hệ thống yêu cầu xác nhận,
   **Then** người dùng PHẢI gõ lại đúng định danh dataset — không chỉ bấm một nút.
2. **Given** đã xác nhận, **When** hệ thống gỡ dataset, **Then** dataset biến mất
   khỏi danh sách và mở đường dẫn trực tiếp báo không tìm thấy.
3. **Given** dataset đã gỡ, **When** kiểm tra sau đó, **Then** vẫn truy được ai
   gỡ, lúc nào, và lý do.
4. **Given** dataset đã gỡ, **When** kiểm tra kho file, **Then** file thô vẫn còn
   — việc xoá hẳn là thao tác quản trị riêng, có chủ đích.

---

### Edge Cases

- **Hai dataset cùng tiêu đề** — hệ thống tự sinh định danh khác nhau, không ghi
  đè lên dataset đã có.
- **File chưa tải lên xong hoặc đã hết hạn** khi người dùng bấm lưu — hệ thống
  kiểm tra file có thật trước khi ghi metadata, báo lỗi rõ thay vì tạo dataset
  trỏ tới file không tồn tại.
- **AI trả về nội dung không đọc được** — hệ thống thử lại vài lần trước khi báo
  lỗi, và thông báo lỗi bằng tiếng Việt dễ hiểu, không phải thông báo kỹ thuật.
- **Ghi metadata thất bại giữa chừng** — người dùng vẫn xem được nội dung đã soạn
  để không mất công nhập lại.
- **Tiêu đề hoặc mô tả chứa ký tự đặc biệt** — nội dung được ghi an toàn, dataset
  không biến mất khỏi kho vì lỗi định dạng.
- **File rất lớn** — tải thẳng lên kho file, không đi qua máy chủ ứng dụng, nên
  không bị chặn bởi giới hạn dung lượng của tầng trung gian.

## Requirements *(mandatory)*

### Functional Requirements

**Nhận file**

- **FR-001**: Chỉ người đã đăng nhập MUST được đưa dữ liệu lên.
- **FR-002**: Hệ thống MUST chấp nhận dữ liệu dạng bảng và dữ liệu bản đồ; MUST
  từ chối định dạng khác kèm thông báo nêu rõ định dạng được hỗ trợ.
- **FR-003**: Hệ thống MUST áp giới hạn dung lượng và báo lỗi kèm dung lượng thật
  **trước khi** bắt đầu tải lên.
- **FR-004**: File MUST được tải thẳng từ trình duyệt lên kho file, không đi qua
  máy chủ ứng dụng.
- **FR-005**: Đường dẫn lưu file MUST được sinh tự động và duy nhất; tên file
  người dùng đặt MUST được làm sạch trước khi dùng làm đường dẫn.

**Phân tích và đề xuất**

- **FR-006**: Hệ thống MUST đọc file và suy ra: danh sách cột, kiểu dữ liệu, số
  dòng, vài dòng mẫu, và phân bố giá trị của từng cột.
- **FR-007**: Phân bố giá trị MUST tính trên **toàn bộ** dataset, không phải trên
  mẫu.
- **FR-008**: Hệ thống MUST nhận ra quy ước thập phân của cột số và ghi lại cùng
  cột đó; cột dùng quy ước Việt Nam KHÔNG được bị loại khỏi phân bố giá trị.
- **FR-009**: Hệ thống MUST đề xuất tiêu đề, mô tả, chủ đề, tag và nguồn dựa trên
  nội dung file.
- **FR-010**: Mọi đề xuất MUST sửa được. Hệ thống KHÔNG được ghi bất cứ đề xuất
  nào mà người dùng chưa xem qua.
- **FR-011**: Khi suy đoán không chắc chắn, hệ thống MUST nêu câu hỏi cho người
  dùng xác nhận thay vì chọn hộ trong im lặng.
- **FR-012**: Nếu phân tích thất bại, hệ thống MUST thử lại vài lần trước khi báo
  lỗi, và thông báo lỗi MUST bằng tiếng Việt dễ hiểu.

**Data dictionary**

- **FR-013**: Hệ thống MUST tạo sẵn một dòng mô tả cho mỗi cột, gồm kiểu dữ liệu,
  đơn vị và mô tả.
- **FR-014**: Người dùng MUST sửa được từng ô trong bảng mô tả cột.
- **FR-015**: Với cột số, hệ thống MUST ghi lại quy ước thập phân và quy ước phân
  cách hàng nghìn cùng cột đó.
- **FR-016**: Dataset không có cột MUST vẫn có file mô tả, ghi rõ lý do không có
  nội dung.

**Ghi vào kho**

- **FR-017**: Định danh dataset MUST được sinh từ tiêu đề, và MUST duy nhất trong
  kho; trùng thì hệ thống tự phân biệt, KHÔNG được ghi đè dataset đã có.
- **FR-018**: Người dùng MUST đặt được định danh riêng lúc tạo mới, nhưng định
  danh MUST không đổi được sau đó.
- **FR-019**: Trước khi ghi metadata, hệ thống MUST xác minh file đã thực sự tồn
  tại trong kho file.
- **FR-020**: Metadata, bảng mô tả cột và mục lục kho MUST được ghi trong **một
  thao tác duy nhất** — không có trạng thái nửa vời.
- **FR-021**: Nội dung do người dùng nhập (tiêu đề, mô tả, tên nguồn, tên file)
  MUST được ghi an toàn; ký tự đặc biệt KHÔNG được làm hỏng bản ghi hay khiến
  dataset biến mất khỏi kho.
- **FR-022**: Nếu ghi thất bại, hệ thống MUST cho người dùng xem lại nội dung đã
  soạn để không mất công nhập lại.
- **FR-023**: Mọi thay đổi MUST đi qua giao diện hoặc API của ứng dụng; KHÔNG
  được ghi trực tiếp vào kho metadata hay kho file.

**Sửa metadata**

- **FR-024**: Chỉ người đã đăng nhập MUST sửa được metadata.
- **FR-025**: Luồng sửa MUST chỉ đụng phần chữ; file đính kèm KHÔNG bị thay đổi.
- **FR-026**: Sau khi sửa, các thông tin sau PHẢI còn nguyên: file đính kèm,
  thông tin hình học của dataset bản đồ, danh sách bài báo đã liên kết, người và
  thời điểm đưa lên, lịch sử chỉnh sửa.
- **FR-027**: Mỗi lần sửa MUST nối thêm một mục vào lịch sử chỉnh sửa, ghi người
  thực hiện và thời điểm.
- **FR-028**: Người dùng MUST xem trước được nội dung sẽ ghi trước khi cam kết.

**Gỡ dataset**

- **FR-029**: Gỡ dataset MUST yêu cầu người dùng gõ lại đúng định danh để xác
  nhận.
- **FR-030**: Gỡ dataset MUST là **xoá mềm** — dataset biến mất khỏi kho nhưng
  bản ghi còn lại để truy vết.
- **FR-031**: Hệ thống MUST ghi nhật ký: ai gỡ, lúc nào, lý do.
- **FR-032**: Xoá mềm MUST không xoá file thô; xoá hẳn là thao tác quản trị riêng.
- **FR-033**: Năng lực gỡ dataset MUST nhất quán giữa giao diện và API — không
  được để trường hợp API cho phép mà giao diện ẩn nút, hoặc ngược lại.
  [NEEDS CLARIFICATION: hiện API cho gỡ ở production và đã được dùng thật, nhưng
  nút trên giao diện bị ẩn ở production — nên mở nút, hay khoá luôn API?]

### Key Entities

- **File đưa lên**: Tệp người dùng chọn. Có tên gốc, định dạng, dung lượng, và
  một đường dẫn duy nhất trong kho file.
- **Kết quả phân tích**: Những gì hệ thống đọc được từ file — danh sách cột, kiểu
  dữ liệu suy ra, số dòng, dòng mẫu, phân bố giá trị, quy ước thập phân.
- **Đề xuất metadata**: Bản nháp do hệ thống sinh — tiêu đề, mô tả, chủ đề, tag,
  nguồn, mức độ chắc chắn, và danh sách câu hỏi cần người dùng xác nhận.
- **Mục data dictionary**: Mô tả một cột — tên, kiểu, đơn vị, mô tả, quy ước thập
  phân và quy ước phân cách hàng nghìn.
- **Mục lịch sử chỉnh sửa**: Một lần sửa — người thực hiện, thời điểm, tóm tắt.
- **Bản ghi gỡ dataset**: Ai gỡ, lúc nào, lý do.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Người dùng đưa một dataset sạch vào kho hoàn chỉnh trong vòng
  **15 phút**, phần lớn thời gian là đọc và sửa đề xuất chứ không phải tự soạn.
- **SC-002**: **100%** dataset trong kho có metadata và bảng mô tả cột — không
  dataset nào chỉ có file trần.
- **SC-003**: Người dùng KHÔNG bao giờ phải đối diện một biểu mẫu trống — mọi
  trường đều có đề xuất sẵn trước khi họ chạm vào.
- **SC-004**: **0** trường hợp sửa metadata làm mất dữ liệu đã có (file, thông
  tin hình học, bài báo liên kết, lịch sử chỉnh sửa).
- **SC-005**: **0** trường hợp dataset biến mất khỏi kho do lỗi định dạng bản ghi.
- **SC-006**: **0** trường hợp metadata ghi thành công mà mục lục kho chưa cập
  nhật, hoặc ngược lại.
- **SC-007**: **100%** thao tác gỡ dataset truy được người thực hiện, thời điểm
  và lý do.

## Assumptions

- **Retro-spec**: Năng lực mô tả ở đây đã ship và đang chạy production. Spec viết
  theo **hành vi quan sát được của code**, không theo ý định của spec cũ.
- **AI đề xuất, người quyết**: Vai trò của AI là xoá bỏ trang trắng, không phải
  quyết thay người dùng. Không có đường nào để đề xuất của AI đi thẳng vào kho mà
  không qua mắt người.
- **Nguồn có cấu trúc thì không dùng AI**: Luồng đưa dữ liệu vào bằng máy từ
  nguồn thống kê chính thức xử lý deterministic từ metadata của nguồn — thuộc
  phạm vi spec `005`, không dùng luồng wizard này.
- **Thay file chưa hỗ trợ**: Muốn đổi file phải gỡ dataset rồi đưa lên lại. Đây
  là khoảng trống đã biết, chưa có spec riêng.
- **Người dùng tự đổi mật khẩu chưa hỗ trợ**: Quản trị viên tạo và cấp lại. Thuộc
  phạm vi spec `003`.
- **Định dạng tài liệu và âm thanh chưa nhận**: Chỉ dữ liệu dạng bảng và bản đồ.
  Tài liệu và âm thanh thuộc giai đoạn sau.
- **Phụ thuộc spec khác**: `001` (nơi dataset mới xuất hiện và được xem trước) ·
  `003` (đăng nhập, lịch sử chỉnh sửa hiển thị, liên kết bài báo).
