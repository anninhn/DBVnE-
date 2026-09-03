# Feature Specification: Discovery Chat ở quy mô vài nghìn dataset

**Feature Branch**: `005-discovery-chat-scale`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "Discovery Chat vận hành đúng ở quy mô vài nghìn dataset. Đọc docs/de-xuat-ama-quy-mo-lon.md làm nguồn: user story U1-U7, acceptance criteria A1-A13 + B1-B3, các quyết định đã chốt ở mục 9, phương án đã loại ở mục 5. Phạm vi gồm chunk 1, 2, 2b, 2c, 3, 4, 5, 7 ở mục 7. Không đưa chi tiết kỹ thuật (tên hàm, tên model embedding, countTokens) vào Requirements — để ở Assumptions."

## Clarifications

### Session 2026-09-03

- Q: Một cột phân loại được coi là "ít giá trị" — tức lưu trọn danh sách để trả lời chắc chắn câu "có Đà Nẵng không" — khi nó có tối đa bao nhiêu giá trị khác nhau? (FR-038) → A: Tối đa 200 giá trị khác nhau. Đo trên 203 cột phân loại của bộ dữ liệu hiện có: median 32, p90 71, cao nhất 100 — ngưỡng 200 phủ trọn bộ hiện tại và dư gấp đôi, đồng thời vẫn cắt dữ liệu cấp xã/phường (~3.300 đơn vị) là chỗ đúng ra phải cắt.

- Q: Khi hệ thống tìm dataset liên quan tới một câu hỏi, nó nên đưa tối đa bao nhiêu dataset vào bước trả lời? (FR-055, SC-006) → A: Tối đa 20 dataset, xếp theo mức liên quan. Gấp 2–3 lần số đáp án đúng thường gặp (2–8), đủ cho recall ≥70% mà không nhồi dataset liên quan mơ hồ làm tụt độ chính xác; ~8.000 token nên vẫn nằm trong ngưỡng SC-001.

- Q: Một cuộc trò chuyện kết thúc và cuộc mới bắt đầu khi nào? (US4, FR-046, SC-010) → A: Chỉ khi người dùng chủ động bắt đầu cuộc mới. Ngữ cảnh giữ nguyên cho tới lúc đó — không tự hết theo thời gian, không mất khi tải lại trang, không để AI tự đoán là đã đổi chủ đề. Đây là cách duy nhất người dùng biết chắc mình đang ở đâu, và là cách duy nhất kiểm được SC-010.

- Q: Khi phóng viên hỏi một câu cần tính toán và hệ thống từ chối, câu trả lời nên chỉ họ làm gì tiếp? (FR-040) → A: Nêu dataset + cột + phạm vi thời gian, kèm đường dẫn mở tab Preview của dataset đó, và nhắc có thể tải file về nếu muốn tự tính hàng loạt. Preview xem được ngay trên trình duyệt nên là bước tiếp theo ít trở ngại nhất; không hứa hẹn gì về tính năng chưa có.

## User Scenarios & Testing *(mandatory)*

Kho dữ liệu vừa tăng từ 17 lên 495 dataset và sẽ còn tăng lên vài nghìn. Chức năng
hỏi đáp được thiết kế cho kho nhỏ nên hiện đã vượt phạm vi mà nó chịu được. Sáu hành
trình dưới đây xếp theo mức thiệt hại nếu không làm.

### User Story 1 - Không nhận con số không kiểm chứng được (Priority: P1)

Phóng viên hỏi một câu cần tính toán trên dữ liệu — "so sánh tốc độ tăng dân số Đà
Nẵng với Hà Nội" — và nhận về một câu trả lời **không chứa con số nào**, thay vào đó
được chỉ đúng dataset, đúng cột, đúng phạm vi thời gian để tự tra.

**Why this priority**: Đây là hành trình duy nhất mà khi hỏng thì **người dùng không
thể phát hiện**. Các hành trình khác hỏng thì phóng viên thấy ngay (chậm, bị chặn,
tìm không ra). Còn một con số bịa trông rất hợp lý sẽ đi thẳng vào bài báo. Hiện hệ
thống có đường để bịa số: khi gắn dataset vào câu hỏi, nó nhận được một ít dòng dữ
liệu thật và có thể suy diễn từ đó như thể đó là toàn bộ dữ liệu.

**Independent Test**: Hỏi 5 câu dạng tính toán (có và không gắn dataset). Kiểm câu
trả lời không chứa chữ số nào ngoài năm và tên cột. Ship riêng được, không phụ thuộc
hành trình nào khác.

**Acceptance Scenarios**:

1. **Given** kho có dataset dân số theo tỉnh, **When** phóng viên hỏi "so sánh tăng
   trưởng dân số Đà Nẵng với Hà Nội", **Then** câu trả lời chỉ ra dataset + cột +
   phạm vi thời gian + đường dẫn xem trước dữ liệu, và **không** đưa ra con số so
   sánh nào
2. **Given** phóng viên đã gắn một dataset vào câu hỏi, **When** hỏi "trung bình mỗi
   năm tăng bao nhiêu", **Then** hệ thống vẫn không tính, mà hướng dẫn cách tự tra
3. **Given** câu hỏi vừa mang tính tìm kiếm vừa mang tính tính toán ("có dữ liệu nào
   cho thấy Đà Nẵng tăng nhanh hơn Hà Nội không"), **When** xử lý, **Then** phần tìm
   kiếm được trả lời đầy đủ, phần tính toán được nói rõ là chưa hỗ trợ

---

### User Story 2 - Tìm được dataset mà không bị chặn hạn mức (Priority: P1)

Phóng viên hỏi liên tục trong lúc làm bài, không bị chặn giữa buổi vì hết hạn mức
câu hỏi trong ngày, và việc hỏi đáp không làm trang danh mục ngừng hoạt động.

**Why this priority**: Chi phí mỗi câu hỏi hiện tăng tuyến tính theo số dataset, nên
hạn mức phải giữ thấp. Nghiêm trọng hơn: mỗi câu hỏi kéo theo hơn một nghìn lượt truy
cập nguồn metadata, chỉ vài câu hỏi rải rác là chạm trần của nhà cung cấp — và khi
chạm trần thì **trang danh mục cũng ngừng hoạt động** vì dùng chung hạn mức.

**Independent Test**: Hỏi 10 câu liên tiếp, đo lượng dữ liệu nạp mỗi câu và kiểm
trang danh mục vẫn truy cập được trong suốt quá trình. Ship riêng được.

**Acceptance Scenarios**:

1. **Given** kho có 495 dataset, **When** phóng viên hỏi một câu, **Then** lượng dữ
   liệu nạp vào mỗi câu hỏi không phụ thuộc tổng số dataset trong kho
2. **Given** 5 phóng viên hỏi trong cùng 5 phút, **When** họ hỏi, **Then** không ai
   bị lỗi và trang danh mục vẫn tải bình thường
3. **Given** kho tăng thêm dataset, **When** hỏi lại cùng câu hỏi, **Then** chi phí
   mỗi câu hỏi không tăng theo
4. **Given** câu hỏi dùng từ đồng nghĩa với tên dataset ("lạm phát" trong khi dataset
   tên "Chỉ số giá tiêu dùng"), **When** xử lý, **Then** dataset đúng vẫn được tìm ra

---

### User Story 3 - Biết dataset có chứa địa bàn mình cần (Priority: P2)

Phóng viên hỏi "có dữ liệu nhiệt độ Đà Nẵng không" và nhận câu trả lời **chắc chắn**
— có hoặc không — chứ không phải suy đoán.

**Why this priority**: Hiện hệ thống không nhìn thấy giá trị bên trong cột, nên nó
suy từ tên cột: thấy cột "Tỉnh, thành phố" thì kết luận hẳn có đủ 63 tỉnh. Suy luận
đó đúng với dataset phủ toàn quốc nhưng **sai với dataset phủ một phần** — ví dụ
dataset khí hậu chỉ có 17 trạm quan trắc: có Đà Nẵng, không có Cần Thơ. Phóng viên
tải file về mới biết thiếu, mất thời gian và mất lòng tin.

**Independent Test**: Chuẩn bị 10 cặp câu hỏi có/không trên các dataset phủ một phần
địa bàn. Kiểm cả hai chiều đều đúng. Ship riêng được sau khi dữ liệu giá trị cột đầy đủ.

**Acceptance Scenarios**:

1. **Given** dataset khí hậu chỉ có 17 trạm quan trắc trong đó có Đà Nẵng, **When**
   hỏi "có dữ liệu nhiệt độ Đà Nẵng không", **Then** trả lời có, kèm tên dataset
2. **Given** cùng dataset đó không có Cần Thơ, **When** hỏi "có dữ liệu nhiệt độ Cần
   Thơ không", **Then** trả lời **không có**, thay vì suy đoán là có
3. **Given** câu hỏi nêu một địa bàn, **When** xử lý, **Then** trả về **đầy đủ** các
   dataset chứa địa bàn đó, không phải một mẫu vài cái

---

### User Story 4 - Hỏi tiếp mà không phải nhắc lại ngữ cảnh (Priority: P2)

Phóng viên hỏi nhiều câu liên tiếp về cùng một hướng điều tra, mỗi câu chỉ cần nói
phần mới.

**Why this priority**: Hiện mỗi câu hỏi hoàn toàn độc lập — hệ thống không giữ gì từ
câu trước. Hỏi "còn năm 2023 thì sao?" là nó không hiểu "còn" là còn cái gì. Phóng
viên phải viết lại câu hỏi đầy đủ mỗi lượt, làm gián đoạn công việc.

**Independent Test**: Chạy 5 cuộc trò chuyện 3 lượt, trong đó lượt 2 và 3 dùng đại từ
hoặc lược ngữ cảnh. Kiểm hệ thống hiểu đúng. Ship riêng được.

**Acceptance Scenarios**:

1. **Given** lượt 1 hỏi về chỉ số giá tiêu dùng, **When** lượt 2 hỏi "còn năm 2023
   thì sao", **Then** hệ thống hiểu là hỏi chỉ số giá tiêu dùng năm 2023
2. **Given** hai lượt đầu đều về dân số, **When** lượt 3 chuyển hẳn sang chủ đề xuất
   khẩu, **Then** hệ thống tìm dataset xuất khẩu, **không** bị giới hạn trong nhóm
   dataset dân số của hai lượt trước
3. **Given** một cuộc trò chuyện đã có nhiều lượt, **When** phóng viên bắt đầu cuộc
   trò chuyện mới, **Then** ngữ cảnh cũ không ảnh hưởng tới cuộc mới

---

### User Story 5 - Biết dataset phủ khoảng thời gian nào (Priority: P3)

Phóng viên biết ngay dataset có dữ liệu từ năm nào tới năm nào, và lọc được theo
khoảng thời gian.

**Why this priority**: Câu hỏi đầu tiên của mọi bài báo dữ liệu là "có số liệu năm
nào". Hiện thông tin này không được ghi cho bất kỳ dataset nào, dù đã có chỗ để ghi.
Xếp P3 vì phóng viên vẫn tìm được dataset rồi tự xem, chỉ là mất thêm một bước.

**Independent Test**: Kiểm phạm vi thời gian được ghi cho các dataset dạng bảng, và
lọc theo khoảng thời gian trả về đúng. Ship riêng được, không phụ thuộc gì.

**Acceptance Scenarios**:

1. **Given** dataset có cột năm, **When** xem dataset đó, **Then** phạm vi thời gian
   được hiển thị
2. **Given** phóng viên hỏi "có dữ liệu nào về dân số từ 2015 không", **When** xử lý,
   **Then** chỉ dataset phủ khoảng đó được nêu
3. **Given** dataset không có chiều thời gian, **When** xem, **Then** không hiện
   phạm vi thời gian giả

---

### User Story 6 - Đo được chất lượng trả lời có tốt lên hay không (Priority: P3)

Người phụ trách kho chạy được một bộ câu hỏi chuẩn và so sánh kết quả giữa các lần
thay đổi, để biết một thay đổi làm tốt lên hay tệ đi.

**Why this priority**: Bộ đo hiện có 8 câu và **không câu nào ghi đáp án đúng là
dataset nào**, nên con số chất lượng đang tính trên cơ sở yếu. Không có thước thì mọi
thay đổi ở năm hành trình trên đều không chứng minh được. Xếp P3 vì nó không phải
hành trình của phóng viên, nhưng **phải làm trước** các hành trình khác về mặt thứ tự.

**Independent Test**: Chạy bộ đo hai lần trên cùng một phiên bản, kết quả ổn định.
Ship riêng được và không ảnh hưởng người dùng.

**Acceptance Scenarios**:

1. **Given** bộ câu hỏi chuẩn có ít nhất 25 câu, **When** chạy bộ đo, **Then** mỗi
   câu được so với danh sách dataset đúng đã ghi trước
2. **Given** một thay đổi vừa được áp dụng, **When** chạy lại bộ đo, **Then** so
   sánh được với lần chạy trước theo từng chỉ số
3. **Given** bộ câu hỏi chuẩn, **When** kho thêm dataset mới, **Then** bộ đo vẫn chạy
   được mà không phải viết lại

---

### Edge Cases

- **Dataset vừa upload**: phóng viên upload xong hỏi ngay — hệ thống phải tìm được nó,
  không được bỏ sót vì dữ liệu tìm kiếm chưa cập nhật
- **Dataset vừa sửa hoặc xoá**: hệ thống không được nêu tên cũ hoặc dataset đã xoá
- **Không có dataset nào phù hợp**: nói thẳng là chưa có, không cố nêu dataset gần
  gần cho có
- **Câu hỏi vô nghĩa hoặc ngoài chủ đề**: trả lời không tìm thấy, không bịa
- **Dataset phủ một phần địa bàn**: đã nêu ở US3 — không được suy từ tên cột
- **Cùng một địa bàn viết khác nhau trong dữ liệu** (ví dụ "Qui Nhơn" và "Quy Nhơn"):
  câu hỏi nêu một cách viết vẫn phải tìm ra dataset
- **Nhiều dataset trùng tên**: phải phân biệt được trong câu trả lời, không nêu chung
  một tên khiến phóng viên không biết chọn cái nào
- **Kho rỗng hoặc nguồn metadata tạm không truy cập được**: báo lỗi rõ ràng, không
  trả lời như thể kho không có gì
- **Cùng một câu hỏi hỏi từ hai mặt tiền khác nhau**: phải ra cùng đáp án. Nếu lệch
  thì một trong hai mặt tiền đang tự xử lý dữ liệu theo cách riêng — đó là lỗi

## Requirements *(mandatory)*

Đánh số tiếp từ FR-028 của spec 004 để không trùng. **Số thứ tự là định danh, không
phải thứ tự đọc** — nhóm "Năng lực tra cứu dùng chung" đứng đầu vì nó chi phối các
nhóm còn lại, dù đánh số sau.

### Năng lực tra cứu dùng chung

Các năng lực dưới đây phải là **năng lực có tên, có đầu vào và đầu ra xác định**, chứ
không phải các bước bên trong một luồng trả lời. Lý do: cùng một câu hỏi có thể đến
từ nhiều mặt tiền khác nhau (trang hỏi đáp trên web hôm nay; công cụ riêng của data
journalist về sau), và cả hai phải cho **cùng một đáp án**.

- **FR-055**: Hệ thống MUST cung cấp các năng lực tra cứu sau, mỗi năng lực gọi được
  **độc lập** với các năng lực khác:
  - tìm dataset liên quan tới một câu hỏi — trả về **tối đa 20 dataset**, xếp theo
    mức liên quan giảm dần
  - lấy toàn bộ thông tin mô tả của một dataset (gồm các cột, ý nghĩa, đơn vị, danh
    sách giá trị của các chiều phân loại)
  - tra một giá trị cụ thể (ví dụ một địa bàn) ra danh sách dataset chứa nó
- **FR-056**: Mỗi năng lực MUST cho **cùng một kết quả** với cùng một đầu vào, bất kể
  mặt tiền nào gọi nó.
- **FR-057**: Các quy tắc đọc dữ liệu MUST được xử lý **bên trong** năng lực, không
  để mỗi mặt tiền tự xử lý — cụ thể: định dạng số của từng dataset, việc một cột địa
  bàn có thể chứa nhiều cấp hành chính lẫn nhau, và việc cùng một đối tượng được ghi
  bằng nhiều cách viết khác nhau.
- **FR-058**: Thêm một mặt tiền mới MUST KHÔNG đòi sửa lại các năng lực tra cứu.
- **FR-059**: Mỗi lần một năng lực được gọi MUST được ghi nhận kèm người gọi, để giữ
  được dấu vết ai tra cứu gì.
- **FR-060**: Năng lực MUST từ chối rõ ràng khi người gọi không có quyền, thay vì trả
  về kết quả rỗng.

### Chọn dataset để trả lời

- **FR-029**: Lượng dữ liệu nạp vào mỗi câu hỏi MUST không tăng theo tổng số dataset
  trong kho.
- **FR-030**: Hệ thống MUST tìm được dataset đúng khi câu hỏi dùng **từ đồng nghĩa**
  với tên dataset.
- **FR-031**: Hệ thống MUST tìm được dataset đúng khi câu hỏi nêu **tên riêng chính
  xác** (địa bàn, mã ngành, tên trạm).
- **FR-032**: Dataset **vừa được thêm** MUST tìm được qua hỏi đáp mà không cần thao
  tác thủ công nào.
- **FR-033**: Dataset **vừa sửa** MUST không còn được nêu theo thông tin cũ; dataset
  **đã xoá** MUST không còn được nêu.
- **FR-034**: Khi không dataset nào phù hợp, hệ thống MUST nói thẳng là chưa có.

### Trả lời theo giá trị dữ liệu

- **FR-035**: Hệ thống MUST trả lời được dataset có chứa một **giá trị cụ thể** hay
  không (ví dụ một địa bàn), dựa trên dữ liệu thật chứ không suy từ tên cột.
- **FR-036**: Với câu hỏi nêu một giá trị cụ thể, hệ thống MUST trả về **đầy đủ** các
  dataset chứa giá trị đó.
- **FR-037**: Hệ thống MUST trả lời đúng cả chiều **phủ định** — dataset không chứa
  giá trị được hỏi thì phải nói là không có.
- **FR-038**: Danh sách giá trị của một chiều phân loại MUST được lưu **đầy đủ** khi
  chiều đó có **tối đa 200 giá trị khác nhau**; chiều có nhiều hơn 200 MUST được lưu
  một phần kèm **dấu hiệu cho biết danh sách chưa đủ**, để không ai kết luận sai rằng
  một giá trị không tồn tại chỉ vì nó không nằm trong phần được lưu.

### Không đưa ra con số không kiểm chứng được

- **FR-039**: Câu hỏi cần **tính toán trên dữ liệu** MUST KHÔNG nhận về con số nào.
- **FR-040**: Với câu hỏi loại đó, hệ thống MUST chỉ ra dataset, cột và phạm vi thời
  gian, kèm **đường dẫn xem trước dữ liệu** của dataset đó, và MUST nhắc rằng có thể
  tải file về nếu muốn tự tính hàng loạt.
- **FR-063**: Câu từ chối MUST KHÔNG hứa hẹn về tính năng chưa có.
- **FR-041**: FR-039 MUST đúng cả khi người dùng đã gắn một dataset vào câu hỏi.
- **FR-042**: Hệ thống MUST KHÔNG kết luận về phạm vi hoặc nội dung toàn bộ dataset
  dựa trên một phần dữ liệu.
- **FR-043**: Câu hỏi vừa tìm kiếm vừa tính toán MUST được trả lời phần tìm kiếm đầy
  đủ, phần tính toán MUST được nói rõ là chưa hỗ trợ.

### Hội thoại nhiều lượt

- **FR-044**: Hệ thống MUST hiểu câu hỏi tiếp theo dựa trên các lượt trước trong cùng
  một cuộc trò chuyện.
- **FR-045**: Ngữ cảnh các lượt trước MUST chỉ dùng để **hiểu** câu hỏi, MUST KHÔNG
  dùng để **giới hạn** phạm vi tìm kiếm.
- **FR-046**: Người dùng MUST có cách **chủ động** bắt đầu cuộc trò chuyện mới, và
  cuộc mới MUST KHÔNG mang theo ngữ cảnh của cuộc trước.
- **FR-062**: Ngữ cảnh cuộc trò chuyện MUST được giữ cho tới khi người dùng chủ động
  bắt đầu cuộc mới — MUST KHÔNG tự hết theo thời gian, MUST KHÔNG mất khi tải lại
  trang, và hệ thống MUST KHÔNG tự quyết định rằng người dùng đã đổi chủ đề.

### Phạm vi thời gian

- **FR-047**: Dataset có chiều thời gian MUST được ghi phạm vi thời gian.
- **FR-048**: Dataset không có chiều thời gian MUST KHÔNG hiện phạm vi thời gian.
- **FR-049**: Người dùng MUST lọc được dataset theo khoảng thời gian.

### Đo chất lượng

- **FR-050**: Bộ câu hỏi chuẩn MUST có ít nhất **25 câu**, mỗi câu ghi rõ **danh sách
  dataset đúng**.
- **FR-051**: Bộ câu hỏi chuẩn MUST bao gồm: câu hỏi theo giá trị (cả hai chiều
  có/không), câu hỏi tính toán, và cuộc trò chuyện nhiều lượt.
- **FR-052**: Bộ đo MUST cho so sánh được kết quả giữa các lần chạy theo từng chỉ số.

### Hạn mức và chi phí

- **FR-053**: Hoạt động hỏi đáp MUST KHÔNG làm các trang khác của hệ thống ngừng hoạt
  động.
- **FR-054**: Hạn mức MUST được nới lên **500 câu mỗi người mỗi ngày** và **5.000 câu
  toàn hệ thống mỗi ngày** (hiện 100 và 1.200).
- **FR-061**: Hai loại từ chối do hạn mức MUST có thông báo khác nhau — hết hạn mức
  cá nhân và hết hạn mức hệ thống — để người dùng biết là chờ hay báo người phụ trách.

### Key Entities

- **Dataset catalog entry**: một dataset trong kho — tên, mô tả, chủ đề, nguồn, phạm
  vi thời gian, các cột và ý nghĩa từng cột
- **Column value set**: danh sách giá trị thật của một chiều phân loại trong một
  dataset (ví dụ 71 địa bàn, 17 trạm quan trắc), kèm dấu hiệu cho biết đã đủ hay chưa
- **Retrieval index**: dữ liệu phục vụ việc chọn dataset liên quan tới câu hỏi; phải
  luôn khớp với catalog entry hiện hành
- **Value index**: tra cứu ngược từ một giá trị (tên địa bàn) sang các dataset chứa nó
- **Cuộc trò chuyện**: một loạt câu hỏi đáp liên tiếp; các lượt trước dùng để hiểu
  câu hỏi sau
- **Gold question**: một câu hỏi chuẩn kèm danh sách dataset đúng, dùng để đo chất lượng
- **Question intent**: phân loại câu hỏi thành *tìm kiếm* hoặc *tính toán* hoặc cả hai
- **Retrieval capability**: một năng lực tra cứu có tên, đầu vào và đầu ra xác định
  (tìm dataset / lấy mô tả dataset / tra giá trị); là đơn vị mà mọi mặt tiền dùng chung
- **Surface**: một cách người dùng tiếp cận các năng lực trên — hôm nay là trang hỏi
  đáp trên web; về sau có thể là công cụ riêng của data journalist

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Chi phí mỗi câu hỏi **không tăng** khi số dataset trong kho tăng — đo
  cùng một câu hỏi trước và sau khi kho lớn thêm, chênh lệch dưới 10%
- **SC-002**: Chi phí mỗi câu hỏi giảm ít nhất **8 lần** so với hiện tại
- **SC-003**: Không lần nào hoạt động hỏi đáp làm trang danh mục không truy cập được,
  trong đợt thử 50 câu hỏi liên tiếp của nhiều người
- **SC-004**: Tỷ lệ câu hỏi được trả lời thành công **≥ 87,5%** (không thấp hơn mức
  hiện tại)
- **SC-005**: Trong các dataset được nêu, tỷ lệ nêu đúng **≥ 95%**
- **SC-006**: Tỷ lệ tìm hết dataset đúng **≥ 70%** (mức hiện tại 42,9%)
- **SC-007**: **100%** câu hỏi dạng tính toán không nhận về con số nào
- **SC-008**: Câu hỏi theo giá trị trả lời đúng **cả hai chiều** có/không trên
  **≥ 95%** trường hợp thử
- **SC-009**: Dataset vừa thêm tìm được qua hỏi đáp trong vòng **5 phút**
- **SC-010**: Mạch hội thoại 3 lượt, lượt thứ 3 hiểu đúng tham chiếu tới lượt 1 trên
  **≥ 90%** trường hợp thử
- **SC-011**: Phạm vi thời gian được ghi cho **≥ 90%** dataset dạng bảng
- **SC-012**: Phóng viên thấy chữ đầu tiên của câu trả lời trong vòng **4 giây**
- **SC-013**: Gọi trực tiếp năng lực tra cứu với cùng câu hỏi cho **cùng danh sách
  dataset** như câu trả lời trên trang hỏi đáp, trên **100%** trường hợp thử — chứng
  minh không mặt tiền nào tự xử lý dữ liệu theo cách riêng

## Assumptions

### Quyết định đã chốt (2026-09-03)

- **Bộ câu hỏi chuẩn làm trước mọi thay đổi khác** — không có thước đo thì không
  chứng minh được thay đổi có làm tốt lên. Việc này cần người phụ trách kho tự quyết
  đáp án đúng, không tự động hoá được
- **Hội thoại nhiều lượt nằm trong phạm vi đợt này** (US4)
- **Bỏ việc đưa một ít dòng dữ liệu thật vào câu hỏi, thay bằng danh sách giá trị
  của các cột** — vừa an toàn hơn vì không còn con số để suy diễn, vừa trả lời được
  câu hỏi theo giá trị. Kéo theo: US3 là điều kiện tiên quyết của US1
- **Kho sẽ tăng lên vài nghìn dataset** — nên cách chọn dataset phải có chi phí không
  phụ thuộc số lượng ngay từ đầu, không làm giải pháp chỉ đúng tới 1.000 rồi làm lại
- **Hạn mức nới lên 500 câu/người/ngày và 5.000 câu/hệ thống/ngày** (FR-054). Chọn
  mức này vì nó **hạ** trần chi phí xấu nhất so với hôm nay chứ không nâng: hiện
  1.200 câu × chi phí cao = khoảng $73/ngày, sau khi sửa 5.000 câu × chi phí thấp =
  khoảng $25/ngày. Dùng thực tế thì thấp hơn nhiều — vẫn giữ trần vì nó là cái phanh
  khi có lỗi gọi lặp, không phải để giới hạn người dùng
- **Việc tra cứu viết thành năng lực dùng chung, không viết thành các bước bên trong
  luồng trả lời** (FR-055→FR-060). Ba lý do:
  1. Ba quy tắc đọc dữ liệu khó — định dạng số của từng dataset, cột địa bàn trộn
     nhiều cấp hành chính, cùng một đối tượng ghi nhiều cách — nếu để mỗi mặt tiền tự
     xử lý thì sẽ xử lý khác nhau và lệch nhau, mà lệch kiểu này **không có triệu
     chứng** để phát hiện
  2. Data journalist cần dùng kho từ công cụ riêng của họ (đã ghi trong
     `docs/proposal-clean-slate-3-layer.md`). Nếu năng lực đã tách sẵn thì thêm mặt
     tiền là việc nhỏ; nếu không thì phải viết lại
  3. Năng lực tính toán trên dữ liệu (U7, Phase 3e) khi thêm vào sẽ là **một năng lực
     nữa**, không phải một đợt viết lại

### Ràng buộc kỹ thuật đã đo (chi tiết ở `docs/de-xuat-ama-quy-mo-lon.md`)

- Cách làm hiện tại nạp toàn bộ metadata mọi dataset vào mỗi câu hỏi: 202.876 token,
  $0,061/câu, và hơn 1.000 lượt truy cập nguồn metadata mỗi lần hết cache
- Trần của nhà cung cấp là 5.000 lượt/giờ, dùng chung với trang danh mục → khoảng 5
  lần hết cache là chạm trần
- Cách chọn dataset bằng cách cho AI đọc danh mục rút gọn: chi phí tăng tuyến tính,
  ở 2.000 dataset còn tệ hơn cách hiện tại → đã loại
- Cách chọn dataset dự kiến: kết hợp tìm theo ngữ nghĩa và tìm theo từ khoá chính xác;
  chi phí prompt không phụ thuộc số dataset. Model và cách lưu vector đã kiểm là dùng
  được trên hạ tầng hiện tại, chi phí một lần không đáng kể
- Dữ liệu giá trị cột hiện chỉ lưu 12 giá trị mỗi cột, và 12 giá trị đó không phải
  "phổ biến nhất" mà gần như ngẫu nhiên → phải nâng và điền lại cho các dataset đã có
- Trường phạm vi thời gian đã có sẵn chỗ lưu nhưng đang trống toàn bộ

### Phạm vi

- **Câu hỏi tính toán trên dữ liệu (so sánh, tăng trưởng, tổng, xếp hạng) NGOÀI phạm
  vi.** Đợt này chỉ đảm bảo hệ thống **từ chối cho tử tế** và chỉ đúng đường. Việc
  tính toán thật thuộc Phase 3e trong roadmap, dùng cơ chế gọi công cụ để số liệu
  luôn đến từ engine chứ không từ AI
- Ba ràng buộc dữ liệu mà Phase 3e sẽ phải xử lý đã ghi lại trong tài liệu đề xuất
  (định dạng số kiểu Việt Nam, cột trộn nhiều cấp hành chính, giá trị chưa chuẩn hoá)
- **Việc index danh mục phình to khi kho lên vài nghìn dataset NGOÀI phạm vi** — đó là
  việc của luồng danh mục, không phải luồng hỏi đáp
- **Mặt tiền thứ hai NGOÀI phạm vi đợt này.** Spec này chỉ yêu cầu các năng lực tra
  cứu **độc lập với mặt tiền** (FR-056, FR-058) và chứng minh bằng SC-013; nó KHÔNG
  yêu cầu xây thêm mặt tiền nào. Trong đợt này chỉ có một mặt tiền là trang hỏi đáp
  trên web. Việc mở năng lực ra cho công cụ ngoài là spec riêng về sau, và khi đó nó
  chỉ là lớp vỏ mỏng bọc các năng lực đã có
- Không thêm hạ tầng lưu trữ mới; dùng đúng những gì hệ thống đang có
- Bộ đo chất lượng đã tồn tại và chạy được; đợt này mở rộng bộ câu hỏi, không viết lại

### Phụ thuộc

- Người phụ trách kho phải curate bộ câu hỏi chuẩn (US6) trước khi các hành trình
  khác đo được
- US1 phụ thuộc US3: bỏ dữ liệu mẫu chỉ an toàn khi đã có danh sách giá trị cột thay thế
- US4 phụ thuộc US2: viết lại câu hỏi theo ngữ cảnh chỉ có ý nghĩa khi việc chọn
  dataset đã chạy trên cơ chế mới
