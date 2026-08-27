# Feature Specification: Catalog & Discovery

**Feature Branch**: `001-catalog-discovery`

**Created**: 2026-08-24

**Status**: DELIVERED — retro-documented

**Input**: Retro-spec cho code đã ship và đang chạy production. Mô tả hành vi
thật của hệ thống, không phải ý định của spec cũ. Phạm vi: cách phóng viên tìm
và xem dataset trong kho — listing, search, filter, sort, phân trang, trang chi
tiết, preview theo định dạng, và truy nguồn gốc.

> **Ghi chú về retro-spec**: Tài liệu này mô tả năng lực **đã tồn tại**. Không
> chạy `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` cho spec này —
> sẽ build lại thứ đang phục vụ người dùng thật. Spec tồn tại để (a) làm chuẩn
> đối chiếu khi sửa về sau, (b) ghi lại hành vi mà không tài liệu nào khác ghi.
> Xem `specs/_archive/README.md` cho bản đồ spec cũ và các chỗ code đã trôi khỏi
> spec.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tìm được dataset cần dùng (Priority: P1)

Phóng viên vào kho, không biết chính xác dataset tên gì. Họ gõ vài từ khoá tiếng
Việt (có dấu hoặc không), thu hẹp dần bằng bộ lọc chủ đề / định dạng / kích
thước, và sắp xếp theo mức độ được dùng hoặc theo thời gian. Danh sách thu hẹp
ngay khi gõ, không phải chờ tải lại trang.

**Why this priority**: Không tìm được thì mọi năng lực khác vô nghĩa. Đây là cửa
vào duy nhất của sản phẩm.

**Independent Test**: Mở trang danh sách, gõ một từ khoá, tick một bộ lọc, đổi
cách sắp xếp — xác nhận danh sách thu hẹp đúng và không tải lại trang.

**Acceptance Scenarios**:

1. **Given** kho có nhiều dataset, **When** phóng viên gõ "rừng" vào ô tìm kiếm,
   **Then** danh sách chỉ còn dataset có từ đó trong tiêu đề, mô tả, tag hoặc
   tên cột.
2. **Given** phóng viên gõ "rung" (không dấu), **When** hệ thống tìm kiếm,
   **Then** kết quả vẫn khớp dataset chứa "rừng" — không phân biệt dấu.
3. **Given** phóng viên gõ nhiều từ "dân số tỉnh", **When** hệ thống tìm kiếm,
   **Then** chỉ trả dataset khớp **tất cả** các từ, không phải bất kỳ từ nào.
4. **Given** danh sách đang hiển thị, **When** phóng viên tick một chủ đề ở bộ
   lọc bên trái, **Then** danh sách thu hẹp và bộ đếm bên cạnh mỗi lựa chọn phản
   ánh đúng số dataset còn lại.
5. **Given** dataset được lưu với **bất kỳ** chủ đề nào mà người upload chọn
   được, **When** phóng viên lọc theo chủ đề đó, **Then** dataset PHẢI xuất hiện
   — danh sách chủ đề lúc upload và lúc lọc là cùng một nguồn.
6. **Given** kho có nhiều dataset hơn một trang, **When** phóng viên chuyển
   trang, **Then** chỉ phần danh sách đổi, thanh điều hướng và bộ lọc giữ nguyên
   trạng thái.
7. **Given** không dataset nào khớp, **When** hệ thống trả kết quả, **Then**
   hiển thị trạng thái rỗng rõ ràng — không hiển thị kết quả gần đúng.

---

### User Story 2 - Xem trước dữ liệu mà không phải tải file (Priority: P2)

Phóng viên tìm ra một dataset khả dĩ nhưng chưa chắc đúng thứ mình cần. Họ mở
trang chi tiết, xem vài chục dòng đầu, đọc mô tả từng cột, và với dữ liệu bản đồ
thì xem luôn ranh giới trên bản đồ — tất cả trước khi quyết định tải về.

**Why this priority**: Không có bước này, phóng viên phải tải file hàng trăm MB
chỉ để biết mình lấy nhầm. Đây là thứ biến "danh sách file" thành "kho dữ liệu".

**Independent Test**: Mở một dataset bất kỳ, xác nhận thấy được dữ liệu mẫu +
mô tả cột mà không bấm tải về lần nào.

**Acceptance Scenarios**:

1. **Given** một dataset dạng bảng, **When** phóng viên mở trang chi tiết,
   **Then** thấy bảng dữ liệu mẫu kèm tên cột, kiểu dữ liệu và đơn vị.
2. **Given** một dataset rất lớn (hàng triệu dòng), **When** phóng viên mở trang
   chi tiết, **Then** dữ liệu mẫu hiện ra trong vài giây — hệ thống chỉ đọc phần
   đầu file, không tải toàn bộ.
3. **Given** một dataset bản đồ, **When** phóng viên mở trang chi tiết, **Then**
   có thể chuyển qua lại giữa dạng **bản đồ** và dạng **bảng**.
4. **Given** dataset có nhiều file đính kèm, **When** phóng viên mở tab danh sách
   file, **Then** thấy từng file kèm kích thước và có thể xem trước ngay tại chỗ.
5. **Given** một cột số dùng định dạng Việt Nam (`1.234,56`), **When** hệ thống
   hiển thị phân bố của cột, **Then** giá trị được hiểu đúng — cột không bị bỏ
   qua và thống kê không sai thang.
6. **Given** một cột phân loại, **When** phóng viên xem trang chi tiết, **Then**
   thấy các giá trị phổ biến nhất kèm tỷ trọng.

---

### User Story 3 - Truy được nguồn gốc trước khi trích lên bài (Priority: P3)

Trước khi dùng số liệu trong bài viết, phóng viên cần biết dữ liệu này từ đâu,
ai đưa lên, lúc nào, và đã bị sửa lần nào chưa. Khi biên tập viên chất vấn, họ
phải trưng ra được.

**Why this priority**: Đây là điều kiện để số liệu dùng được cho báo chí. Không
có nó thì kho chỉ là chỗ chứa file.

**Independent Test**: Mở một dataset đã từng bị sửa, xác nhận thấy đủ nguồn,
người đưa lên, thời điểm, và lịch sử chỉnh sửa.

**Acceptance Scenarios**:

1. **Given** một dataset bất kỳ, **When** phóng viên mở trang chi tiết, **Then**
   thấy tên nguồn và đường dẫn tới nguồn gốc (nếu có).
2. **Given** một dataset đã bị sửa metadata, **When** phóng viên xem phần thông
   tin, **Then** thấy lịch sử chỉnh sửa theo thứ tự mới nhất trước, mỗi mục có
   người thực hiện và thời điểm.
3. **Given** bất kỳ mốc thời gian nào hiển thị, **When** phóng viên đọc, **Then**
   đó là thời điểm tuyệt đối dạng `dd/mm/yyyy hh:mm` giờ Việt Nam — KHÔNG phải
   dạng tương đối kiểu "3 ngày trước".

---

### Edge Cases

- **File quá lớn để xem trước phía máy chủ** — hệ thống bỏ qua bước dựng sẵn và
  để trình duyệt tự tải phần cần thiết; người dùng thấy trạng thái đang tải thay
  vì trang trắng.
- **Dataset bản đồ dung lượng rất lớn** — dạng bảng chỉ được tải khi người dùng
  thực sự chuyển sang tab đó, tránh tải hàng trăm MB cho người chỉ muốn xem bản đồ.
- **Dataset đã bị xoá mềm** — không xuất hiện trong danh sách và mở trực tiếp
  đường dẫn thì báo không tìm thấy.
- **Dataset cũ thiếu trường metadata** (ví dụ thiếu thông tin loại hình học) —
  hệ thống vẫn nhận diện đúng định dạng qua thông tin thay thế, không hỏng trang.
- **Dataset không có file nào** — trang vẫn mở được, hiển thị trạng thái rỗng ở
  phần xem trước.
- **Từ khoá tìm kiếm không khớp gì** — trạng thái rỗng trung thực, không hạ
  ngưỡng để trả kết quả gần đúng.

## Requirements *(mandatory)*

### Functional Requirements

**Danh sách và tìm kiếm**

- **FR-001**: Hệ thống MUST hiển thị danh sách dataset dạng dòng gọn, mỗi dòng
  nêu tiêu đề, thời điểm cập nhật, số dòng dữ liệu, số file, dung lượng và số
  lượt tải.
- **FR-002**: Người dùng MUST tìm kiếm được bằng tiếng Việt **không phân biệt
  dấu**, và kết quả chỉ gồm dataset khớp **tất cả** từ khoá đã nhập.
- **FR-003**: Hệ thống MUST cho lọc theo chủ đề, định dạng file, khoảng kích
  thước và tag; mỗi lựa chọn MUST kèm số lượng dataset tương ứng.
- **FR-004**: Danh sách chủ đề dùng khi lọc và danh sách chủ đề chọn được khi
  đưa dataset lên MUST là **cùng một nguồn** — không được lệch nhau.
- **FR-005**: Hệ thống MUST chỉ hiển thị lựa chọn định dạng có ít nhất một
  dataset, không liệt kê định dạng rỗng.
- **FR-006**: Hệ thống MUST cho sắp xếp theo mức độ được dùng và theo thời gian
  cập nhật.
- **FR-007**: Hệ thống MUST phân trang danh sách và giữ nguyên trạng thái bộ lọc
  khi chuyển trang.
- **FR-008**: Thao tác lọc, tìm, sắp xếp và chuyển trang MUST không làm tải lại
  trang.
- **FR-009**: Khi không có kết quả, hệ thống MUST hiển thị trạng thái rỗng rõ
  ràng và KHÔNG được trả kết quả gần đúng.

**Trang chi tiết và xem trước**

- **FR-010**: Hệ thống MUST hiển thị dữ liệu mẫu của dataset dạng bảng kèm tên
  cột, mà không yêu cầu người dùng tải file.
- **FR-011**: Với file rất lớn, hệ thống MUST chỉ đọc phần đầu file đủ để dựng
  bảng mẫu, không tải toàn bộ.
- **FR-012**: Với dataset bản đồ, hệ thống MUST cho chuyển qua lại giữa hiển thị
  **bản đồ** và **bảng**, và MUST chỉ tải dạng bảng khi người dùng chuyển sang.
- **FR-013**: Hệ thống MUST hiển thị data dictionary — mỗi cột kèm kiểu dữ liệu,
  đơn vị và mô tả.
- **FR-014**: Hệ thống MUST hiển thị mô tả dài của dataset dưới dạng văn bản có
  định dạng.
- **FR-015**: Hệ thống MUST liệt kê mọi file đính kèm kèm dung lượng, và cho xem
  trước từng file ngay tại trang.
- **FR-016**: Hệ thống MUST hiển thị phân bố giá trị của từng cột: dạng biểu đồ
  cột cho dữ liệu số, dạng tỷ trọng cho dữ liệu phân loại.
- **FR-017**: Phân bố giá trị MUST được tính trên **toàn bộ** dataset, không
  phải trên vài dòng mẫu.
- **FR-018**: Hệ thống MUST hiểu đúng số theo quy ước thập phân đã khai của cột
  (ví dụ `1.234,56` kiểu Việt Nam) khi tính phân bố; cột dùng quy ước này KHÔNG
  được bị loại khỏi thống kê.
- **FR-019**: Giá trị trong bảng xem trước MUST hiển thị đúng như trong file gốc,
  không định dạng lại — để khớp với file khi người dùng tải về.

**Nguồn gốc**

- **FR-020**: Hệ thống MUST hiển thị nguồn dataset và đường dẫn tới nguồn gốc.
- **FR-021**: Hệ thống MUST hiển thị người đưa lên, thời điểm đưa lên, và lịch
  sử chỉnh sửa theo thứ tự mới nhất trước.
- **FR-022**: Mọi mốc thời gian MUST hiển thị tuyệt đối theo `dd/mm/yyyy hh:mm`
  giờ Việt Nam; KHÔNG được dùng thời gian tương đối.
- **FR-023**: Dataset đã xoá mềm MUST không xuất hiện trong danh sách và mở
  trực tiếp đường dẫn phải báo không tìm thấy.

**Ngôn ngữ và thương hiệu**

- **FR-024**: Giao diện MUST dùng tiếng Việt cho động từ và thông báo, giữ tiếng
  Anh cho danh từ kỹ thuật đã thành quy ước (Dataset, Data Dictionary, rows,
  Preview, Download).
- **FR-025**: Thương hiệu MUST viết là "VnExpress".

**Trung thực trong nhãn và lựa chọn** *(chốt 2026-08-24)*

- **FR-026**: Bộ lọc kích thước MUST chia thành **năm bậc** — dưới 1 nghìn,
  1–10 nghìn, 10–100 nghìn, 100 nghìn–1 triệu, và trên 1 triệu dòng. Nhãn của
  mỗi bậc MUST mô tả đúng khoảng giá trị nó nhận; KHÔNG được có bậc mang nhãn
  hẹp nhưng nhận mọi giá trị lớn hơn.
- **FR-027**: Danh sách lựa chọn sắp xếp MUST không chứa hai lựa chọn cho ra
  cùng một thứ tự. Mỗi lựa chọn hiển thị cho người dùng PHẢI dựa trên một tín
  hiệu khác biệt và có thật.

*Ghi chú*: cả hai yêu cầu này sinh ra từ hành vi lệch phát hiện khi viết spec —
bậc kích thước lớn nhất từng dán nhãn "10K–100K" cho cả dataset 6,4 triệu dòng,
và lựa chọn "được quan tâm" từng cho kết quả trùng khít "được tải nhiều". Đã
sửa cùng ngày.

### Key Entities

- **Dataset**: Một bộ dữ liệu trong kho. Có tiêu đề, mô tả, chủ đề, tag, nguồn,
  giấy phép, người đưa lên, thời điểm, lịch sử chỉnh sửa, trạng thái (đang dùng
  / đã xoá mềm), và một hoặc nhiều file đính kèm.
- **File đính kèm**: Một tệp thuộc dataset. Có tên, định dạng, dung lượng, và
  phân bố giá trị theo cột đã tính sẵn.
- **Mục data dictionary**: Mô tả một cột dữ liệu — tên cột, kiểu, đơn vị, mô tả,
  và quy ước thập phân nếu là cột số.
- **Phân bố cột**: Tóm tắt thống kê của một cột — với cột số là khoảng giá trị
  và biểu đồ phân bố; với cột phân loại là số giá trị khác nhau và các giá trị
  phổ biến nhất.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Phóng viên tìm ra dataset cần dùng trong vòng **3 thao tác** kể từ
  khi vào kho (gõ từ khoá, tick bộ lọc, bấm mở).
- **SC-002**: Danh sách phản hồi **tức thì** khi gõ hoặc đổi bộ lọc — người dùng
  không cảm nhận được độ trễ chờ tải.
- **SC-003**: Dữ liệu mẫu của dataset lớn nhất trong kho hiện ra trong vòng
  **3 giây** kể từ khi mở trang chi tiết.
- **SC-004**: **100%** dataset trong kho tìm được qua bộ lọc chủ đề — không
  dataset nào vô hình vì lệch danh mục.
- **SC-005**: Phóng viên đánh giá được một dataset có đúng thứ mình cần hay
  không **mà không tải file nào về**.
- **SC-006**: **100%** mốc thời gian hiển thị ở dạng tuyệt đối kèm ngày, tháng,
  năm và giờ.
- **SC-007**: Cột số dùng quy ước thập phân Việt Nam có phân bố hiển thị đúng
  thang — **0** cột bị loại khỏi thống kê vì lý do định dạng số.

## Assumptions

- **Retro-spec**: Năng lực mô tả ở đây đã ship và đang chạy production phục vụ
  người dùng thật. Spec viết theo **hành vi quan sát được của code**, không theo
  ý định của spec cũ — vì hai thứ đã lệch nhau ở nhiều điểm (xem
  `specs/_archive/README.md` §4).
- **Công cụ nội bộ**: Người dùng là nhân sự tòa soạn, dùng máy tính để bàn.
  Giao diện tối ưu cho desktop; hỗ trợ điện thoại không thuộc phạm vi.
- **Duyệt kho không cần đăng nhập**: Xem danh sách, mở trang chi tiết và xem
  trước dữ liệu là công khai trong nội bộ. Chỉ hành động tải file mới yêu cầu
  đăng nhập — thuộc phạm vi spec `003`.
- **Quy mô hiện tại**: Kho ở mức vài chục dataset. Lọc và tìm kiếm xử lý trực
  tiếp trên trình duyệt là đủ. Khi kho vượt vài trăm dataset, cần lớp lọc sơ bộ
  phía máy chủ — thuộc phạm vi spec sau.
- **Phân bố cột tính sẵn lúc đưa dataset lên**: Trang chi tiết đọc kết quả có
  sẵn, không tính lại. Cơ chế tính thuộc phạm vi spec `002`.
- **Nguồn sự thật là file**: Metadata nằm trong version control, file thô nằm ở
  object storage. Mọi thứ trang này hiển thị đều dẫn xuất từ hai nguồn đó và
  dựng lại được.
- **Phụ thuộc spec khác**: `002` (đưa dataset lên, sinh metadata và phân bố cột)
  · `003` (đăng nhập, lịch sử chỉnh sửa, liên kết bài báo, đếm lượt tải) ·
  `004` (hỏi đáp bằng ngôn ngữ tự nhiên).
