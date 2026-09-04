# Đề xuất xây dựng nền tảng dữ liệu chung cho tòa soạn

*Bản đề xuất dành cho người đọc không chuyên về kỹ thuật.*

---

## Tóm tắt

Tòa soạn đang có rất nhiều dữ liệu nhưng gần như không dùng lại được: mỗi file nằm một nơi, mỗi bảng trình bày một kiểu, và không ai chắc con số mình đang cầm lấy từ đâu, còn đúng không. Đề xuất này trình bày việc xây dựng một kho dữ liệu chung, nơi mọi dữ liệu được tập trung, chuẩn hoá và mô tả rõ ràng, để bất kỳ phóng viên nào cũng có thể hỏi một câu bằng tiếng Việt tự nhiên và nhận về con số kèm biểu đồ và nguồn gốc kiểm chứng được — trong vài giây thay vì vài giờ. Điều làm cho việc này khả thi ở thời điểm hiện tại, mà vài năm trước không thể, là AI đã đủ tốt để làm thay phần việc tốn công nhất — đọc và dọn những bảng biểu lộn xộn — trong khi con người chỉ cần duyệt lại. Lộ trình đề xuất gồm bốn giai đoạn trong sáu tháng, với một bản chạy thử hoàn chỉnh sau ba tuần để tòa soạn đánh giá trước khi quyết định đầu tư tiếp.

---

## 1. Vấn đề

Phóng viên cần số liệu hằng ngày: kinh tế, dân số, giáo dục, môi trường, ngân sách. Nhưng cách chúng ta đang làm việc với số liệu có bốn điểm nghẽn.

**Dữ liệu phân tán.** File nằm rải rác trong máy cá nhân, hộp thư, các thư mục chia sẻ của từng nhóm. Khi cần một con số, cách phổ biến nhất vẫn là đi hỏi xem "ai đang giữ file đó" — nghĩa là tri thức dữ liệu của tòa soạn phụ thuộc vào trí nhớ của vài cá nhân, và người mới gần như không kế thừa được gì.

**Dữ liệu không dùng lại được ngay.** Phần lớn file số liệu được trình bày để in ra cho đẹp chứ không phải để tra cứu: ô gộp, nhiều tầng tiêu đề, đơn vị ghi lẫn trong tên cột, ghi chú viết tay bên cạnh. Muốn dùng, người ta phải mở ra, hiểu lại cấu trúc, chép số ra chỗ khác — mỗi người làm lại từ đầu, mỗi lần làm lại từ đầu.

**Không kiểm chứng được.** Cùng một chỉ số, hai file cho hai con số khác nhau, và không có cách nào biết bản nào mới hơn, bản nào lấy từ nguồn chính thức, bản nào đã bị chỉnh sửa dọc đường. Số liệu cũng không đứng yên: cơ quan công bố thường đưa ra số sơ bộ rồi mới sửa thành số chính thức — nếu không theo dõi, bài đã đăng sẽ mang con số đã bị nguồn thay đổi mà không ai hay.

**Chi phí ẩn rất lớn.** Thời gian tìm và đối chiếu số liệu là hàng giờ mỗi tuần cho mỗi phóng viên. Nhưng chi phí lớn nhất không phải thời gian — là rủi ro một con số sai lên mặt báo, dẫn đến đính chính và mất uy tín. Với một tờ báo, độ tin của con số không phải chuyện chất lượng, mà là chuyện sống còn.

## 2. Tại sao cần làm

Báo chí dựa trên dữ liệu ngày càng là lợi thế cạnh tranh: tốc độ ra bài phụ thuộc vào tốc độ tra được số đúng, và chiều sâu của bài phụ thuộc vào việc nhìn được xu hướng qua nhiều năm thay vì chỉ một con số rời. Trong khi đó, lượng dữ liệu mở từ các cơ quan thống kê và tổ chức quốc tế đang tăng nhanh — vấn đề không còn là thiếu dữ liệu, mà là dữ liệu có sẵn nhưng nằm ngoài tầm với của người không chuyên.

Nếu không làm gì, mọi thứ sẽ tiếp tục như hiện tại: mỗi phóng viên tự xoay xở, chất lượng số liệu phụ thuộc vào sự cẩn thận của từng người, và tòa soạn không có cách nào bảo đảm một chuẩn chung về nguồn gốc con số trước khi nó lên bài.

## 3. Giải pháp

Đề xuất xây dựng một kho dữ liệu chung, tổ chức như một thư viện có ba tầng — mỗi tầng giải quyết một việc, và chính việc tách ba tầng này là điểm mấu chốt khiến hệ thống vừa dễ dùng vừa đáng tin.

**Tầng một — kho lưu trữ gốc.** Mọi tệp dữ liệu được đưa vào nguyên trạng, không phải chỉnh sửa gì trước: bảng tính lộn xộn, tài liệu, bản đồ, ghi âm — tất cả đều có chỗ. Mỗi tệp được ghi lại ai đưa vào, lúc nào, lấy từ đâu, và không bao giờ bị sửa đè. Tầng này giống phòng hồ sơ gốc của một cơ quan: là nơi đối chiếu cuối cùng khi có tranh cãi về một con số.

**Tầng hai — sổ số liệu đã chuẩn hoá.** Những nguồn số liệu quan trọng được chuyển thành các bảng sạch, thống nhất: mỗi dòng là một quan sát, mỗi con số đi kèm đơn vị, năm, địa bàn, và trạng thái — đã chính thức hay còn sơ bộ. Việc chuyển đổi này do máy làm theo quy tắc cố định, có bộ kiểm tra tự động soát lại (đơn vị có hợp lý không, cộng các tỉnh có khớp số cả nước không, số mới có khác thường so với năm trước không), và những gì máy không chắc thì được đưa cho con người duyệt thay vì đoán. Quan trọng nhất: mỗi nguồn được giữ nguyên vẹn như chính nguồn đó công bố, không trộn số của nguồn này với nguồn kia — khi hai nguồn nói khác nhau về cùng một điều, hệ thống trình cả hai và nói rõ khác biệt, thay vì âm thầm chọn hộ một con số.

**Tầng ba — mục lục thông minh.** Mỗi bộ dữ liệu, mỗi cột số liệu đều có phần mô tả chi tiết: nó đo cái gì, đơn vị gì, phủ những năm nào, lấy từ đâu. Nhờ đó việc tìm kiếm diễn ra theo ý nghĩa chứ không theo tên file — người dùng gõ khái niệm mình cần, hệ thống hiểu và chỉ đúng chỗ.

Trên cùng của ba tầng là một **trợ lý hỏi đáp**: phóng viên hỏi bằng tiếng Việt tự nhiên, ví dụ tỷ lệ hộ nghèo của một tỉnh đã thay đổi thế nào trong mười năm, và nhận về câu trả lời gồm con số, biểu đồ, cảnh báo nếu số còn sơ bộ, kèm một dòng ghi rõ hệ thống đã tra ở bảng nào và một đường dẫn về nguồn gốc. Nguyên tắc cốt lõi, được bảo đảm bằng kỹ thuật chứ không bằng lời hứa: **trợ lý không bao giờ tự nghĩ ra con số**. Mọi con số trong câu trả lời đều được lấy ra từ kho, mọi phép tính đều do máy tính toán trên dữ liệu thật, và phần AI chỉ làm đúng một việc — hiểu câu hỏi và diễn đạt câu trả lời. Nếu kho không có số, hệ thống nói thẳng là không có.

Ba nhóm người dùng được phục vụ theo ba cách: phóng viên hỏi đáp qua trò chuyện; biên tập viên đưa dữ liệu vào qua thao tác kéo thả, với máy đề xuất sẵn phần mô tả và cách dọn bảng để chỉ cần duyệt; người làm phân tích chuyên sâu tải dữ liệu thô về làm việc theo cách riêng.

## 4. Tại sao bây giờ giải pháp mới khả thi

Ý tưởng kho dữ liệu chung không mới — các tòa soạn lớn trên thế giới đã muốn làm từ lâu. Điều thay đổi trong khoảng hai năm gần đây là bốn thứ, cộng lại khiến việc này từ chỗ cần cả một đội kỹ sư trở thành việc một nhóm rất nhỏ làm được.

**Thứ nhất, AI đã đọc được bảng biểu lộn xộn.** Phần việc đắt nhất của mọi dự án dữ liệu xưa nay là dọn dữ liệu bằng tay — chính vì nó mà các dự án kiểu này thường chết giữa chừng. Nay AI đọc được một bảng tính trình bày tuỳ hứng, hiểu được cấu trúc của nó và đề xuất cách chuyển thành bảng sạch; con người chỉ nhìn kết quả và bấm duyệt hoặc sửa. Chi phí dọn một file giảm từ hàng giờ xuống vài phút.

**Thứ hai, cách kết hợp AI với dữ liệu đã trưởng thành.** Bài học lớn của giai đoạn đầu là không thể để AI trả lời số liệu từ trí nhớ của nó — nó sẽ bịa. Cách làm đã được kiểm chứng hiện nay là tách bạch: AI hiểu câu hỏi và tìm đúng chỗ, còn con số được lấy nguyên vẹn từ dữ liệu thật, có khâu kiểm tra tự động đối chiếu từng con số trong câu trả lời với dữ liệu gốc trước khi hiển thị. Rủi ro bịa số được loại bỏ bằng thiết kế, không phụ thuộc vào việc AI "ngoan" hay không.

**Thứ ba, chi phí hạ tầng đã xuống gần bằng không.** Ở quy mô một tòa soạn, toàn bộ hệ thống chạy trên các dịch vụ lưu trữ và công cụ xử lý dữ liệu miễn phí hoặc rất rẻ, không cần máy chủ riêng, không cần đội vận hành. Chi phí đáng kể duy nhất là phí sử dụng AI, ước tính vài triệu đồng mỗi tháng khi cả tòa soạn cùng dùng.

**Thứ tư, nguồn dữ liệu chính thức đã mở kênh cho máy.** Nhiều cơ quan thống kê trong và ngoài nước nay cung cấp dữ liệu qua kênh tự động: máy lấy về được toàn bộ, cập nhật được định kỳ, không ai phải gõ lại số bằng tay. Điều này biến việc phủ hàng trăm bảng số liệu chính thức từ bất khả thi thành công việc của vài tuần.

## 5. Lộ trình đề xuất

Nguyên tắc của lộ trình: làm một lát cắt hoàn chỉnh trước, mở rộng sau. Thay vì xây từng phần nền móng trong nhiều tháng rồi mới biết người dùng có cần không, giai đoạn đầu tiên làm cho một mảng số liệu chạy trọn vẹn từ đầu đến cuối — để câu hỏi quan trọng nhất, "phóng viên có tin và có dùng không", được trả lời sớm nhất và rẻ nhất.

**Giai đoạn 1 — Bản chạy thử hoàn chỉnh (3 tuần).** Chọn một mảng số liệu chính thức, đưa trọn vào kho qua cả ba tầng, và mở trợ lý hỏi đáp cho một nhóm nhỏ ba đến năm phóng viên dùng thật. Tiêu chí đánh giá: mọi con số trả ra khớp tuyệt đối với nguồn, và phần lớn câu hỏi trong phạm vi mảng đó được trả lời mà không cần ai trợ giúp. Đây là điểm quyết định: kết quả giai đoạn này là căn cứ để tòa soạn duyệt hoặc dừng các giai đoạn sau.

**Giai đoạn 2 — Độ phủ và độ tin (tháng thứ 2–3).** Mở rộng ra toàn bộ nguồn số liệu chính thức chủ lực. Hoàn thiện bộ kiểm tra chất lượng tự động và cơ chế theo dõi khi nguồn sửa số: mỗi lần cập nhật, hệ thống ghi lại con số cũ thay vì ghi đè, và báo cho tác giả những bài đã dùng con số vừa bị sửa — việc mà hiện nay không có công cụ nào làm cho tòa soạn. Mở cho khoảng mười lăm phóng viên.

**Giai đoạn 3 — Mở kho cho cả tòa soạn (tháng thứ 4–5).** Bật tính năng tự đưa dữ liệu vào: bất kỳ ai cũng kéo thả được file của mình, máy đề xuất cách dọn và mô tả, người đưa chỉ duyệt. Thêm nguồn số liệu thứ hai để kiểm chứng cách hệ thống xử lý khi hai nguồn nói khác nhau. Bổ sung trang tra cứu trực quan cho người thích tự xem biểu đồ và bảng thay vì hỏi đáp.

**Giai đoạn 4 — Mở rộng sang tài liệu (từ tháng thứ 6).** Khi phần số liệu đã vững, mở rộng sang những gì kho đã chứa sẵn ở tầng một: tìm kiếm trong tài liệu văn bản, trích dẫn từ ghi âm phỏng vấn, và gợi ý đề tài khi hệ thống phát hiện biến động bất thường trong số liệu. Phạm vi cụ thể của giai đoạn này sẽ được quyết định dựa trên những gì người dùng thực sự hỏi trong các giai đoạn trước, không quyết định trước.

## 6. Nguồn lực cần thiết

Về con người, cần một người xây dựng chính làm toàn thời gian, một biên tập viên dành khoảng một ngày mỗi tuần cho việc duyệt chất lượng — duyệt đơn vị đo, duyệt cách dọn bảng, duyệt mô tả — và nhóm phóng viên dùng thử. Đáng nói thẳng: phần duyệt của con người là chỗ quyết định chất lượng của cả hệ thống, nhiều hơn phần công nghệ; cam kết thời gian này cần được coi là điều kiện của dự án chứ không phải việc làm thêm.

Về chi phí vận hành, giai đoạn thử nghiệm dưới một triệu đồng mỗi tháng; khi phục vụ cả tòa soạn, khoảng ba đến sáu triệu đồng mỗi tháng, chủ yếu là phí sử dụng AI. Không cần mua máy chủ, không cần thuê đội vận hành.

Về thời gian, sáu tháng từ lúc bắt đầu đến khi phục vụ toàn tòa soạn — với ba tuần đầu là mốc đánh giá đầu tiên.

## 7. Rủi ro và giới hạn — nói thẳng

**Giới hạn cần nói rõ với người dùng ngay từ đầu:** hệ thống bảo đảm con số nó trả ra có thật trong nguồn, tại đúng vị trí nó chỉ; hệ thống không bảo đảm con số đó đúng với ý người hỏi — vì một câu hỏi có thể được hiểu theo nhiều cách. Đây là lý do mọi câu trả lời đều hiển thị rõ "đã tra ở đâu, theo cách hiểu nào", để người hỏi tự kiểm được trong một cái liếc mắt. Trách nhiệm biên tập cuối cùng vẫn thuộc về con người — công cụ làm cho việc kiểm chứng nhanh hơn nhiều lần, không thay thế nó.

**Rủi ro về thói quen:** công cụ chỉ có giá trị nếu phóng viên đổi thói quen tra cứu. Giai đoạn một với nhóm nhỏ chính là phép thử cho điều này trước khi đầu tư tiếp — nếu nhóm thử không quay lại dùng lần thứ hai, đó là tín hiệu dừng lại xem xét, và thiết kế lộ trình cho phép dừng ở đó với chi phí tối thiểu.

**Rủi ro về duy trì:** chất lượng kho phụ thuộc việc duyệt đều đặn của con người. Hệ thống được thiết kế để việc này luôn hiện rõ — có danh sách chờ duyệt, có số đo mức phủ — để sự bỏ bê nếu xảy ra sẽ nhìn thấy được, thay vì âm thầm làm chất lượng xuống dốc.

---

## Đề nghị

Duyệt triển khai giai đoạn 1: ba tuần, một người làm chính, chi phí không đáng kể. Sau ba tuần, tòa soạn có trong tay một bản chạy thật để tự trả lời câu hỏi quan trọng nhất — không phải "hệ thống này có xây được không", mà "phóng viên của chúng ta có dùng nó không" — trước khi quyết định bất kỳ khoản đầu tư nào lớn hơn.
