# Feature Specification: Auth & Provenance

**Feature Branch**: `003-auth-provenance`

**Created**: 2026-08-24

**Status**: DELIVERED — retro-documented

**Input**: Retro-spec cho code đã ship và đang chạy production. Phạm vi: ai được
làm gì trong kho, và làm sao truy được dấu vết của mọi thay đổi cùng mọi lần sử
dụng — đăng nhập, gán người thực hiện, lịch sử chỉnh sửa, liên kết bài báo, đếm
lượt tải.

> **Ghi chú về retro-spec**: Tài liệu này mô tả năng lực **đã tồn tại**. Không
> chạy `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` cho spec này.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Đăng nhập một lần, làm việc lâu dài (Priority: P1)

Nhân sự tòa soạn đăng nhập bằng tên đăng nhập và mật khẩu. Sau đó họ dùng kho
bình thường trong thời gian rất dài mà không bị hỏi lại. Người chưa đăng nhập
vẫn duyệt và xem trước dữ liệu được, nhưng không đưa dữ liệu lên, không sửa,
không tải file.

**Why this priority**: Không có danh tính thì không gán được ai làm gì — mọi thứ
về provenance sụp đổ theo.

**Independent Test**: Đăng nhập, đóng trình duyệt, mở lại — xác nhận vẫn còn
phiên làm việc và vào được trang cần đăng nhập.

**Acceptance Scenarios**:

1. **Given** người dùng chưa đăng nhập, **When** mở trang danh sách hoặc trang
   chi tiết dataset, **Then** vẫn xem được bình thường.
2. **Given** người dùng chưa đăng nhập, **When** mở trang đưa dữ liệu lên hoặc
   trang sửa, **Then** hệ thống chuyển sang trang đăng nhập và **ghi nhớ nơi họ
   định đến**.
3. **Given** người dùng đăng nhập thành công, **When** hệ thống hoàn tất, **Then**
   họ được đưa thẳng tới nơi định đến ban đầu.
4. **Given** người dùng nhập sai thông tin, **When** gửi biểu mẫu, **Then** thông
   báo lỗi KHÔNG được tiết lộ tên đăng nhập đó có tồn tại hay không.
5. **Given** đường dẫn đích do người khác cung cấp, **When** hệ thống chuyển
   hướng sau đăng nhập, **Then** chỉ chuyển tới đường dẫn nội bộ — không cho phép
   chuyển ra ngoài.
6. **Given** một tài khoản bị vô hiệu hoá, **When** người đó cố đăng nhập,
   **Then** hệ thống từ chối.

---

### User Story 2 - Biết ai đã làm gì với dataset (Priority: P1)

Khi mở một dataset, người dùng thấy ai đưa lên, lúc nào, và nếu đã bị sửa thì
ai sửa, lúc nào. Danh sách xếp mới nhất trước. Không có thao tác nào làm mất
lịch sử đã ghi.

**Why this priority**: Đây là điều kiện để số liệu dùng được cho báo chí. Không
truy được nguồn gốc thì không trích lên bài được.

**Independent Test**: Sửa metadata một dataset hai lần bằng hai tài khoản khác
nhau, xác nhận cả hai lần đều hiện đúng người và đúng thời điểm.

**Acceptance Scenarios**:

1. **Given** một dataset bất kỳ, **When** người dùng mở trang chi tiết, **Then**
   thấy người đưa lên và thời điểm đưa lên.
2. **Given** một dataset đã bị sửa, **When** người dùng xem phần thông tin,
   **Then** thấy danh sách lần sửa, mới nhất trước, mỗi lần có người và thời điểm.
3. **Given** dataset đã có lịch sử chỉnh sửa, **When** ai đó sửa tiếp, **Then**
   lịch sử cũ PHẢI còn nguyên và được nối thêm — KHÔNG được ghi đè.
4. **Given** bất kỳ thời điểm nào hiển thị, **When** người dùng đọc, **Then** đó
   là thời gian tuyệt đối kèm ngày, tháng, năm và giờ theo múi giờ Việt Nam.
5. **Given** hệ thống hiển thị tên người, **When** người dùng đọc, **Then** thấy
   tên hiển thị dễ đọc, không phải mã định danh nội bộ.

---

### User Story 3 - Nối bài báo đã đăng về lại dataset đã dùng (Priority: P2)

Sau khi bài báo lên trang, phóng viên dán đường dẫn bài vào dataset đã dùng. Hệ
thống tự lấy tiêu đề, tác giả, ngày đăng, chuyên mục và ảnh đại diện. Lần sau ai
mở dataset sẽ thấy nó đã được dùng ở những bài nào.

**Why this priority**: Đây là **provenance ngược** — không chỉ biết dữ liệu từ
đâu tới, mà biết nó đã đi tới đâu. Giúp thấy dataset nào thực sự tạo ra giá trị.

**Independent Test**: Dán một đường dẫn bài báo vào dataset, xác nhận thông tin
bài tự điền và hiển thị ngay không cần tải lại trang.

**Acceptance Scenarios**:

1. **Given** người dùng đã đăng nhập, **When** dán đường dẫn một bài báo, **Then**
   hệ thống tự lấy tiêu đề, tác giả, ngày đăng, chuyên mục, ảnh và lưu luôn.
2. **Given** đường dẫn không thuộc trang báo của tòa soạn, **When** người dùng
   gửi, **Then** hệ thống từ chối.
3. **Given** hệ thống không lấy được thông tin bài, **When** xảy ra lỗi, **Then**
   người dùng vẫn thêm được bằng cách tự nhập tiêu đề — không mất công dán lại.
4. **Given** một đường dẫn đã được thêm trước đó, **When** người dùng dán lại,
   **Then** hệ thống báo trùng và không tạo bản ghi thứ hai.
5. **Given** vừa thêm bài báo xong, **When** người dùng xem lại dataset, **Then**
   bài báo mới hiện ra **ngay** — không phải chờ hết thời gian nhớ tạm.
6. **Given** người chưa đăng nhập, **When** mở tab liên kết bài báo, **Then** vẫn
   xem được danh sách nhưng không thêm được.

---

### User Story 4 - Biết dataset nào được dùng nhiều (Priority: P3)

Mỗi lần ai đó tải file, hệ thống đếm thêm một lượt. Số này hiện trên danh sách
và trang chi tiết, dùng để sắp xếp và để biết đầu tư tiếp vào đâu.

**Why this priority**: Đây là tín hiệu nhu cầu thật, nhưng không chặn việc gì.

**Independent Test**: Tải một dataset, xác nhận số lượt tải tăng và hiện trên
trang danh sách.

**Acceptance Scenarios**:

1. **Given** người dùng đã đăng nhập, **When** bấm tải một file, **Then** file
   được tải về và số lượt tải của dataset tăng thêm một.
2. **Given** người chưa đăng nhập, **When** bấm tải, **Then** hệ thống đưa sang
   trang đăng nhập thay vì trả file.
3. **Given** dataset chưa ai tải, **When** hiển thị, **Then** số lượt tải là 0 —
   không phải trạng thái lỗi hay để trống.
4. **Given** file có tên tiếng Việt có dấu, **When** người dùng tải về, **Then**
   tên file giữ nguyên dấu.

---

### Edge Cases

- **Đường dẫn bài báo chuyển hướng ra ngoài** — hệ thống kiểm tra cả địa chỉ sau
  khi chuyển hướng, không chỉ địa chỉ ban đầu.
- **Trang báo phản hồi chậm** — hệ thống bỏ cuộc sau một khoảng chờ hợp lý và
  chuyển sang cho người dùng tự nhập, không treo vô hạn.
- **Hai người cùng tải một dataset cùng lúc** — số đếm có thể lệch một vài đơn
  vị; chấp nhận được ở quy mô hiện tại vì đây là tín hiệu xu hướng, không phải
  số liệu kế toán.
- **Sửa metadata bằng biểu mẫu dựng lại từ đầu** — thông tin về người và lịch sử
  chỉnh sửa được lấy từ bản ghi hiện có và ghép vào trước khi lưu, nếu không sẽ
  bị xoá sạch.
- **Ghi nhật ký thất bại** — không chặn thao tác chính; thao tác vẫn hoàn tất.

## Requirements *(mandatory)*

### Functional Requirements

**Danh tính và quyền**

- **FR-001**: Hệ thống MUST cho đăng nhập bằng tên đăng nhập và mật khẩu.
- **FR-002**: Mật khẩu MUST được lưu ở dạng đã băm, KHÔNG lưu dạng đọc được.
- **FR-003**: Duyệt danh sách, mở trang chi tiết và xem trước dữ liệu MUST không
  yêu cầu đăng nhập.
- **FR-004**: Đưa dữ liệu lên, sửa metadata, hỏi đáp và tải file MUST yêu cầu
  đăng nhập.
- **FR-005**: Khi bị chặn, hệ thống MUST ghi nhớ nơi người dùng định đến và đưa
  họ tới đó sau khi đăng nhập.
- **FR-006**: Đường dẫn chuyển hướng sau đăng nhập MUST chỉ trỏ tới nơi trong hệ
  thống; địa chỉ ngoài MUST bị loại bỏ.
- **FR-007**: Thông báo đăng nhập thất bại MUST không tiết lộ tên đăng nhập có
  tồn tại hay không.
- **FR-008**: Tài khoản bị vô hiệu hoá MUST không đăng nhập được.
- **FR-009**: Phiên làm việc MUST đủ dài để nhân sự không phải đăng nhập lại
  trong quá trình làm việc thường ngày.

**Gán người thực hiện**

- **FR-010**: Mọi dataset MUST ghi lại ai đưa lên và lúc nào.
- **FR-011**: Mọi lần sửa metadata MUST nối thêm một mục vào lịch sử chỉnh sửa,
  ghi người và thời điểm.
- **FR-012**: Lịch sử chỉnh sửa MUST **chỉ được nối thêm**; thao tác sửa KHÔNG
  được ghi đè hay làm mất mục cũ.
- **FR-013**: Lịch sử MUST hiển thị mới nhất trước.
- **FR-014**: Mọi thời điểm MUST hiển thị tuyệt đối theo ngày, tháng, năm và giờ
  Việt Nam; KHÔNG dùng thời gian tương đối.
- **FR-015**: Hệ thống MUST hiển thị tên người dễ đọc, không phải mã định danh.
- **FR-016**: Mọi thao tác gỡ dataset MUST ghi nhật ký ai gỡ, lúc nào, vì sao.
- **FR-017**: Ghi nhật ký thất bại MUST không chặn thao tác chính.

**Liên kết bài báo (provenance ngược)**

- **FR-018**: Người đã đăng nhập MUST thêm được đường dẫn bài báo vào dataset.
- **FR-019**: Hệ thống MUST tự lấy tiêu đề, tác giả, ngày đăng, chuyên mục và
  ảnh đại diện từ đường dẫn.
- **FR-020**: Hệ thống MUST chỉ chấp nhận đường dẫn thuộc trang báo của tòa soạn,
  và MUST kiểm tra cả địa chỉ sau khi chuyển hướng.
- **FR-021**: Nếu không lấy được thông tin, hệ thống MUST cho người dùng tự nhập
  tiêu đề thay vì bỏ cuộc.
- **FR-022**: Hệ thống MUST từ chối đường dẫn đã được thêm trước đó cho cùng
  dataset.
- **FR-023**: Sau khi thêm bài báo, thông tin mới MUST hiện ra ngay ở mọi nơi
  hiển thị dataset — không được chờ hết thời gian nhớ tạm.
- **FR-024**: Danh sách bài báo MUST xem được mà không cần đăng nhập; chỉ thao
  tác thêm mới yêu cầu đăng nhập.

**Đếm lượt tải**

- **FR-025**: Mỗi lần tải file thành công MUST tăng số lượt tải của dataset.
- **FR-026**: Số lượt tải MUST hiển thị trên danh sách và trang chi tiết, và
  MUST dùng được làm tiêu chí sắp xếp.
- **FR-027**: Dataset chưa ai tải MUST hiển thị số 0, không phải trạng thái lỗi.
- **FR-028**: Tên file tải về MUST giữ nguyên dấu tiếng Việt.
- **FR-029**: Đường dẫn tải file MUST có thời hạn ngắn, không dùng lại được vô
  thời hạn.

**Nhật ký sử dụng**

- **FR-030**: Mọi câu hỏi gửi tới hệ thống hỏi đáp MUST ghi lại kèm **người
  hỏi**, để biết ai cần gì.
- **FR-031**: Khoá dùng để ghi nhận người hỏi MUST là định danh thật của người
  dùng; KHÔNG được dùng giá trị mặc định khiến mọi người gộp làm một.

### Key Entities

- **Tài khoản**: Một nhân sự tòa soạn. Có tên đăng nhập, mật khẩu đã băm, tên
  hiển thị, vai trò, ngày tạo, và trạng thái còn hiệu lực.
- **Phiên làm việc**: Bằng chứng người dùng đã đăng nhập, gắn với tài khoản, có
  thời hạn.
- **Mục lịch sử chỉnh sửa**: Một lần sửa — người thực hiện, thời điểm, tóm tắt.
- **Liên kết bài báo**: Một bài đã dùng dataset — đường dẫn, tiêu đề, tác giả,
  ngày đăng, chuyên mục, ảnh, người thêm, thời điểm thêm.
- **Bộ đếm lượt tải**: Số lượt tải của một dataset và thời điểm tải gần nhất.
- **Bản ghi câu hỏi**: Một lượt hỏi đáp — người hỏi, câu hỏi, tóm tắt trả lời,
  dataset được trích, thời điểm.

**Quyết định còn mở**

- **FR-032**: Liên kết bài báo hiện chỉ **thêm được**, không sửa và không gỡ
  được. Dán nhầm đường dẫn thì bản ghi sai nằm lại vĩnh viễn.
  [NEEDS CLARIFICATION: bổ sung năng lực gỡ liên kết sai, hay chấp nhận và xử lý
  thủ công khi cần?]

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nhân sự đăng nhập **một lần** rồi làm việc bình thường trong nhiều
  tháng mà không bị hỏi lại.
- **SC-002**: **100%** dataset truy được người đưa lên và thời điểm.
- **SC-003**: **100%** lần sửa metadata truy được người thực hiện và thời điểm.
- **SC-004**: **0** trường hợp lịch sử chỉnh sửa bị mất sau khi sửa metadata.
- **SC-005**: **100%** thời điểm hiển thị ở dạng tuyệt đối kèm ngày và giờ.
- **SC-006**: Thêm một liên kết bài báo mất dưới **30 giây**, phần lớn là dán
  đường dẫn.
- **SC-007**: **100%** câu hỏi trong nhật ký truy được người hỏi — không bản ghi
  nào ghi nhận là người dùng vô danh.
- **SC-008**: **0** trường hợp người chưa đăng nhập tải được file.

## Assumptions

- **Retro-spec**: Năng lực mô tả ở đây đã ship và đang chạy production. Spec viết
  theo **hành vi quan sát được của code**.
- **Công cụ nội bộ, tin cậy cao**: Người dùng là nhân sự tòa soạn đã biết nhau.
  Mô hình bảo mật chọn **ma sát thấp** một cách có chủ đích: phiên làm việc rất
  dài, không xác thực hai lớp, không phân quyền theo vai trò. Đây là quyết định,
  không phải thiếu sót. Khi số người dùng tăng đáng kể thì cần xem lại.
- **Quản trị viên cấp và cấp lại mật khẩu**: Người dùng chưa tự đổi mật khẩu
  được. Màn hình đổi mật khẩu là việc đã lên kế hoạch, chưa làm — chấp nhận vì
  hiện chưa có người dùng ngoài nhóm nhỏ ban đầu.
- **Vai trò chưa dùng tới**: Tài khoản có trường vai trò nhưng mọi người đăng
  nhập đều làm được như nhau. Phân quyền theo vai trò chưa cần thiết ở quy mô
  hiện tại.
- **Đếm lượt tải là tín hiệu xu hướng**: Hai người tải cùng lúc có thể làm số
  lệch vài đơn vị. Chấp nhận được — số này để biết dataset nào được quan tâm,
  không phải để đối soát.
- **Liên kết bài báo giới hạn ở trang báo của tòa soạn**: Cố ý, để tránh biến
  tính năng thành công cụ tải nội dung tuỳ ý từ Internet.
- **Phụ thuộc spec khác**: `001` (nơi thông tin nguồn gốc hiển thị) · `002` (nơi
  lịch sử chỉnh sửa được ghi) · `004` (nhật ký câu hỏi).
