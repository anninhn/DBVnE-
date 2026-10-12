# Duyệt nhãn hồ sơ ngữ nghĩa — bộ thử v7

Sinh tự động từ `gold-profiles.json` (đừng sửa file này — sửa JSON hoặc ghi chú ý kiến vào cuối mỗi mục).
Mỗi mục: hình dạng · chủ thể · thời gian · số đo (loại, đơn vị, cộng được) · lưu ý · **chỗ người gắn không chắc**.

Loại số đo: count = đếm · amount = lượng vật lý · money = tiền · rate = tỷ lệ · average = bình quân · index = chỉ số · growth = tốc độ tăng. ✚ = cộng được theo chủ thể.

## 1. `tong-ty-suat-sinh-phan-theo-dia-phuong`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `Địa phương` — loại `province`, tham chiếu `vn-admin-63`, trộn nhiều cấp
- **Thời gian:** cột `Năm` · nhịp `year` · sơ bộ: cột Ghi chú = "Sơ bộ"
  - số đo `Tổng tỷ suất sinh` → *tổng tỷ suất sinh* · rate · số con/phụ nữ · mẫu số: phụ nữ 15–49 tuổi (theo tuổi)
- lưu ý: Cột địa phương trộn CẢ NƯỚC, 6 vùng, 63 tỉnh và Hà Tây (đến 2007)
- lưu ý: Năm 2006 không có số
- Ý kiến duyệt: 

## 2. `dan-so-trung-binh-phan-theo-dia-phuong-gioi-tinh-va-thanh-th`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `Tỉnh, thành phố` — loại `province`, tham chiếu `vn-admin-63`, trộn nhiều cấp
- **Thời gian:** cột `Năm` · nhịp `year` · sơ bộ: cột Ghi chú = "Sơ bộ"
  - số đo `Dân số trung bình` → *dân số trung bình* · count · nghìn người ✚
- lưu ý: Trộn cả nước / vùng / tỉnh; có Hà Tây
- lưu ý: Tên vùng dùng chữ Ð (U+00D0) khác Đ
- Ý kiến duyệt: 

## 3. `so-vu-ly-hon-da-xet-xu-phan-theo-dia-phuong-va-phan-theo-cap`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `Tỉnh, thành phố` — loại `province`, tham chiếu `vn-admin-63`, trộn nhiều cấp
- **Thời gian:** cột `Năm` · nhịp `year`
  - số đo `Tổng số` → *số vụ ly hôn đã xét xử* · count · vụ ✚ · = Cấp tỉnh + Cấp huyện
  - số đo `Cấp tỉnh` → *số vụ ly hôn do tòa án cấp tỉnh xét xử* · count · vụ ✚
  - số đo `Cấp huyện` → *số vụ ly hôn do tòa án cấp huyện xét xử* · count · vụ ✚
- lưu ý: Chỉ vụ ĐÃ XÉT XỬ — không phải mọi vụ ly hôn
- lưu ý: Cấp tỉnh trống 51 dòng (khi đó Tổng số = Cấp huyện?)
- **⚠ không chắc:** sumOf đúng ở dòng Cấp tỉnh trống hay không — để bộ kiểm dữ liệu trả lời
- Ý kiến duyệt: 

## 4. `tong-muc-ban-le-hang-hoa-va-doanh-thu-dich-vu-tieu-dung-theo`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `Tỉnh, thành phố` — loại `province`, tham chiếu `vn-admin-63`, trộn nhiều cấp
- **Thời gian:** cột `Năm` · nhịp `year` · sơ bộ: cột Ghi chú = "Sơ bộ"
  - số đo `Tổng mức bán lẻ hàng hóa và doanh thu dịch vụ tiêu dùng` → *tổng mức bán lẻ hàng hóa và doanh thu dịch vụ tiêu dùng* · money · tỷ đồng ✚ · giá hiện hành
- lưu ý: Giá hiện hành — chưa trừ lạm phát
- Ý kiến duyệt: 

## 5. `he-so-bat-binh-dang-trong-phan-phoi-thu-nhap-he-so-gini-phan`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `Địa phương` — loại `province`, tham chiếu `vn-admin-63`, trộn nhiều cấp
- **Thời gian:** cột `Năm` · nhịp `year`
  - số đo `Hệ số bất bình đẳng trong phân phối thu nhập (hệ số GINI)` → *hệ số GINI (bất bình đẳng phân phối thu nhập)* · index · không rõ đơn vị · mã: gini_thu_nhap
- lưu ý: Dòng cả nước ghi là "TỔNG SỐ"
- Ý kiến duyệt: 

## 6. `he-so-bat-binh-dang-trong-phan-phoi-thu-nhap-he-so-gini`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `Phân tổ` — loại `region`, tham chiếu `vn-admin-63`, trộn nhiều cấp
- **Thời gian:** cột `Năm` · nhịp `year`
  - số đo `Hệ số bất bình đẳng trong phân phối thu nhập (hệ số GINI)` → *hệ số GINI (bất bình đẳng phân phối thu nhập)* · index · không rõ đơn vị · mã: gini_thu_nhap
- lưu ý: Cột "Phân tổ" TRỘN địa lý (cả nước, 6 vùng) với khu vực thành thị / nông thôn — không phải một loại chủ thể
- lưu ý: Năm cách quãng 2 năm đến 2018
- **⚠ không chắc:** Cách mô tả cột trộn địa lý + thành thị/nông thôn: entity mixedLevels, hay tách thành chiều phụ
- Ý kiến duyệt: 

## 7. `ty-le-ho-ngheo-theo-chuan-ngheo-da-chieu-phan-theo-dia-phuon`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `Địa phương` — loại `province`, tham chiếu `vn-admin-63`, trộn nhiều cấp
- **Thời gian:** cột `Năm` · nhịp `year` · sơ bộ: cột Ghi chú = "Sơ bộ"
  - số đo `Tỷ lệ hộ nghèo` → *tỷ lệ hộ nghèo theo chuẩn nghèo đa chiều* · rate · % · mẫu số: tổng số hộ; chuẩn: chuẩn nghèo đa chiều (2016–2020 và 2022–2025 là hai chuẩn khác nhau); mã: ty_le_ho_ngheo_da_chieu
- lưu ý: Chuỗi nối qua đổi chuẩn nghèo đa chiều — so trước/sau 2021 phải cảnh báo
- **⚠ không chắc:** Năm đổi chuẩn chính xác (2021 hay 2022) — chưa kiểm tài liệu NSO
- Ý kiến duyệt: 

## 8. `ty-le-ho-ngheo-phan-theo-dia-phuong`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `Địa phương` — loại `province`, tham chiếu `vn-admin-63`, trộn nhiều cấp
- **Thời gian:** cột `Năm` · nhịp `year`
  - số đo `Tỷ lệ hộ nghèo` → *tỷ lệ hộ nghèo* · rate · % · mẫu số: tổng số hộ; chuẩn: nhiều chuẩn nối nhau; từ 2020 khớp số chuẩn đa chiều
- lưu ý: Năm thiếu: 2007, 2009, 2011, 2017–2019
- lưu ý: Từ 2020 số khớp dataset chuẩn đa chiều; 2016 lệch hẳn (5,8 vs 9,2) → hai chuẩn khác nhau, KHÔNG cùng mã chỉ tiêu
- **⚠ không chắc:** Chuẩn đo của từng giai đoạn trước 2016
- Ý kiến duyệt: 

## 9. `luong-mua-cac-thang-trong-nam-tai-mot-so-tram-quan-trac`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `Tỉnh, thành phố` — loại `station`, tham chiếu `None`
- **Thời gian:** cột `Năm` · nhịp `month`
  - số đo `Lượng mưa các tháng trong năm tại một số trạm quan trắc` → *lượng mưa tháng tại trạm quan trắc* · amount · mm
- lưu ý: Chủ thể là TRẠM, không phải tỉnh, dù cột tên "Tỉnh, thành phố" và nhiều giá trị trùng tên tỉnh (Vinh, Huế, Hà Nội (Láng))
- lưu ý: Cộng 12 tháng ra lượng mưa năm của trạm được; cộng giữa các trạm thì không
- lưu ý: 690 ô trống
- **⚠ không chắc:** Thời gian 2 cột (Năm + Tháng): schema TimeRole chỉ có một cột — cần hỗ trợ thời gian ghép
- Ý kiến duyệt: 

## 10. `tri-gia-xuat-khau-hang-hoa-phan-theo-khoi-nuoc-phan-theo-nuo`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `Khối nước, nước, vùng lãnh thổ` — loại `country`, tham chiếu `None`, trộn nhiều cấp
- **Thời gian:** cột `Năm` · nhịp `year` · sơ bộ: cột Ghi chú = "Sơ bộ"
  - số đo `Trị giá xuất khẩu hàng hoá` → *trị giá xuất khẩu hàng hóa của Việt Nam sang đối tác* · money · triệu USD ✚ · giá hiện hành
- lưu ý: Cột chủ thể trộn TỔNG SỐ, khối nước CHỒNG LẤN (ASEAN, APEC, EU, OPEC) và từng nước — cộng các khối sẽ đếm trùng
- lưu ý: Chỉ cộng được giữa các nước, không giữa các khối
- Ý kiến duyệt: 

## 11. `thu-nhap-binh-quan-mot-lao-dong-dang-lam-viec-phan-theo-ngan`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `Ngành` — loại `industry`, tham chiếu `vsic-cap-1`, trộn nhiều cấp
- **Thời gian:** cột `Năm` · nhịp `year` · sơ bộ: cột Ghi chú = "Sơ bộ"
  - số đo `Thu nhập bình quân một lao động đang làm việc` → *thu nhập bình quân một lao động đang làm việc (tháng)* · average · nghìn đồng/tháng · giá hiện hành; mẫu số: số lao động đang làm việc
- lưu ý: Dictionary ghi đơn vị "unknown"
- lưu ý: Dòng TỔNG SỐ là bình quân chung, không phải tổng các ngành
- **⚠ không chắc:** Đơn vị nghìn đồng/tháng — suy từ độ lớn (4.849 năm 2018) và cách NSO công bố; dictionary không ghi
- **⚠ không chắc:** Tên bảng tham chiếu ngành (VSIC 2018 cấp 1)
- Ý kiến duyệt: 

## 12. `mot-so-chi-tieu-ve-tai-nan-giao-thong-phan-theo-dia-phuong`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `Địa phương` — loại `province`, tham chiếu `vn-admin-63`, trộn nhiều cấp
- **Thời gian:** cột `Năm` · nhịp `year`
  - số đo `Số Vụ TNGT (Vụ)` → *số vụ tai nạn giao thông* · count · vụ ✚
  - số đo `Số người chết (người)` → *số người chết do tai nạn giao thông* · count · người ✚
  - số đo `Số người bị thương (Người)` → *số người bị thương do tai nạn giao thông* · count · người ✚
- lưu ý: Chỉ 3 năm
- lưu ý: Cả nước 2022: 11.457 vụ → 2023: 22.067 vụ (gần gấp đôi) — nhiều khả năng đổi cách thống kê; không so 2022 với 2023 khi chưa rõ
- **⚠ không chắc:** Lý do 2022 bằng một nửa 2023 — chưa kiểm tài liệu nguồn
- Ý kiến duyệt: 

## 13. `danh-sach-cac-diem-ngap-tai-tp-ho-chi-minh-den-6-2026`
- **Hình dạng:** danh sách bản ghi — KHÔNG tidy: Mỗi sheet là một khu vực (tỉnh cũ trước 7/2025); dòng 0 = tên khu vực, dòng 1 = tóm tắt, dòng 2 = header, dữ liệu từ dòng 3. Gộp 3 sheet, thêm cột khu vực từ tên sheet.
- **Chủ thể:** cột `Địa bàn` — loại `ward`, tham chiếu `None`, trộn nhiều cấp
- **Thời gian:** cố định · nhịp `none` · đến 6/2026
  - chiều `Nguyên nhân`
  - chiều `Mức độ`
- lưu ý: Mỗi dòng là một điểm ngập — số liệu sinh bằng ĐẾM theo địa bàn / nguyên nhân / mức độ
- lưu ý: Địa bàn trộn phường mới (TP HCM cũ, BR-VT) với 'Thành phố Thủ Dầu Một'... (cấp huyện cũ, Bình Dương)
- lưu ý: Một ô có thể chứa nhiều phường ("Phường Thông Tây Hội, An Hội")
- lưu ý: Mức độ trống ở sheet Bình Dương
- **⚠ không chắc:** Bảng tham chiếu cấp xã nào khớp (sau 7/2025) — Bình Dương dùng tên cấp huyện cũ nên sẽ không khớp
- Ý kiến duyệt: 

## 14. `thong-ke-thien-tai-viet-nam-giai-doan-1953-2023`
- **Hình dạng:** danh sách bản ghi
- **Chủ thể:** cột `DisNo.` — loại `event`, tham chiếu `None`
- **Thời gian:** cột `Start Year` · nhịp `year`
  - số đo `Total Deaths` → *số người chết* · count · người ✚
  - số đo `Total Affected` → *số người bị ảnh hưởng* · count · người ✚
  - số đo `Total Damage ('000 US$)` → *thiệt hại* · money · nghìn USD ✚ · giá hiện hành
  - số đo `Total Damage, Adjusted ('000 US$)` → *thiệt hại đã điều chỉnh lạm phát* · money · nghìn USD ✚ · giá so sánh
  - chiều `Disaster Type`
  - chiều `Disaster Subtype`
  - chiều `Disaster Group`
- lưu ý: Mỗi dòng một sự kiện — số liệu sinh bằng đếm / cộng theo năm, loại thiên tai
- lưu ý: Địa điểm là văn bản tự do, không quy mã tỉnh trực tiếp được
- lưu ý: Sheet thứ hai là mô tả cột
- lưu ý: Dữ liệu đầu kỳ thưa — số sự kiện tăng theo thời gian một phần do ghi chép tốt hơn
- **⚠ không chắc:** Cột 'Admin Units' (đơn vị hành chính có cấu trúc?) có quy được mã tỉnh không — chưa xem nội dung
- Ý kiến duyệt: 

## 15. `toc-do-tang-truong-grdp-34-tinh-thanh-pho-quy-iii-va-9-thang`
- **Hình dạng:** chuỗi quan sát — KHÔNG tidy: Header dòng 2, dòng 3 là số thứ tự cột (bỏ). Dòng có STT là dòng NHÓM (tỉnh, dạng '01.Thành phố Hà Nội'), các dòng dưới không có STT là chỉ tiêu con (GRDP, 4 khu vực, 'Trong đó: Công nghiệp'). Hai cột số = hai kỳ.
- **Chủ thể:** cột `Tỉnh, thành phố (dòng nhóm)` — loại `province`, tham chiếu `vn-admin-34`
- **Thời gian:** cố định · nhịp `quarter` · quý III/2026 và 9 tháng đầu 2026 (ước tính) · sơ bộ: toàn bộ là ước tính
  - số đo `Quý III (Ước tính)` → *chỉ số phát triển GRDP quý III so cùng kỳ* · index · % (cùng kỳ năm trước = 100) · giá so sánh
  - số đo `9 tháng đầu năm (Ước tính)` → *chỉ số phát triển GRDP 9 tháng so cùng kỳ* · index · % (cùng kỳ năm trước = 100) · giá so sánh
  - chiều `khu vực kinh tế (dòng con)` — tổng: GRDP
- lưu ý: Chỉ số (110,02 = tăng 10,02%), không phải mức GRDP
- lưu ý: Danh mục 34 tỉnh mới
- lưu ý: Tên tỉnh có tiền tố số và 'Thành phố/Tỉnh'
- lưu ý: 'Trong đó: Công nghiệp' là một phần của khu vực 2 — không cộng
- **⚠ không chắc:** Giá so sánh (constant) — suy từ cách NSO tính chỉ số phát triển; file không ghi
- Ý kiến duyệt: 

## 16. `thong-tin-34-tinhthanh-pho`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `TinhThanh` — loại `province`, tham chiếu `vn-admin-34`
- **Thời gian:** cố định · nhịp `none` · khoảng 7/2025 (số liệu nền của đề án sáp nhập — năm số liệu không ghi)
  - số đo `Danso` → *dân số* · count · người ✚
  - số đo `Dientich` → *diện tích* · amount · km² ✚
  - số đo `SoDVHCcapxa` → *số đơn vị hành chính cấp xã* · count · đơn vị ✚
  - số đo `GRDP` → *GRDP* · money · tỷ đồng ✚ · giá hiện hành
  - số đo `Thungansach` → *thu ngân sách* · money · tỷ đồng ✚ · giá hiện hành
  - số đo `Socangbien` → *số cảng biển* · count · cảng ✚
  - số đo `Sosanbay` → *số sân bay* · count · sân bay ✚
- lưu ý: Năm số liệu không ghi
- lưu ý: Đơn vị không ghi trong file
- lưu ý: Sheet Xaphuongmoi: bảng tương ứng xã cũ → xã mới (tham chiếu, shape records); sheet (chuachuan)Xaphuong: bản nháp chưa chuẩn
- **⚠ không chắc:** Đơn vị GRDP và thu ngân sách (tỷ đồng) — suy từ độ lớn
- **⚠ không chắc:** Năm số liệu
- **⚠ không chắc:** GRDP giá hiện hành — suy đoán
- Ý kiến duyệt: 

## 17. `ranh-gioi-hanh-chinh-cap-phuongxa-tp-ho-chi-minh`
- **Hình dạng:** không gian
- **Chủ thể:** cột `code` — loại `ward`, tham chiếu `vn-ward-2025`
- **Thời gian:** cố định · nhịp `none` · địa giới sau 1/7/2025
  - số đo `areaKm2` → *diện tích phường/xã* · amount · km² ✚
- lưu ý: Là BẢNG THAM CHIẾU cấp xã cho TP HCM mới (gồm cả Bình Dương, BR-VT cũ) — dùng để quy mã, ít khi để hỏi số
- Ý kiến duyệt: 

## 18. `top-bai-viet-co-luot-xem-cao-nhat-tren-vnexpress`
- **Hình dạng:** danh sách bản ghi
- **Chủ thể:** cột `article_id` — loại `article`, tham chiếu `None`
- **Thời gian:** cột `month` · nhịp `month`
  - số đo `total_pageview` → *lượt xem* · count · lượt ✚
  - số đo `total_user` → *số người đọc* · count · người
  - số đo `total_comment` → *số bình luận* · count · bình luận ✚
  - số đo `word_count` → *số chữ* · count · chữ
  - số đo `engage` → *chỉ số tương tác* · rate · không rõ đơn vị
  - chiều `ban`
  - chiều `cate_1_name`
  - chiều `cate_original_name`
  - chiều `author_name`
  - chiều `group`
  - chiều `article_type`
- lưu ý: Chỉ top 100 bài mỗi tháng — không phải toàn bộ bài; mọi tổng / trung bình chỉ đúng trong top
- lưu ý: total_user không cộng được giữa bài (một người đọc nhiều bài)
- lưu ý: Ngày theo kiểu Mỹ m/d/yyyy
- **⚠ không chắc:** Ý nghĩa 'engage' và mã article_type
- Ý kiến duyệt: 

## 19. `hien-trang-rung-cac-tinh-thanh-viet-nam-giai-doan-2005-2024-3`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `Tỉnh thành` — loại `province`, tham chiếu `vn-admin-63`, trộn nhiều cấp
- **Thời gian:** cột `Năm` · nhịp `year`
  - số đo `Tổng diện tích rừng` → *tổng diện tích rừng* · amount · ha ✚ · = Diện tích rừng tự nhiên + Diện tích rừng trồng; mã: dien_tich_rung
  - số đo `Diện tích rừng tự nhiên` → *diện tích rừng tự nhiên* · amount · ha ✚ · mã: dien_tich_rung_tu_nhien
  - số đo `Diện tích rừng trồng` → *diện tích rừng trồng* · amount · ha ✚ · mã: dien_tich_rung_trong
  - số đo `Tỷ lệ che phủ rừng` → *tỷ lệ che phủ rừng* · rate · % · mẫu số: diện tích tự nhiên; mã: ty_le_che_phu_rung
- lưu ý: Đơn vị HA (không phải nghìn ha như dataset GSO cùng chủ đề)
- lưu ý: Dòng cả nước ghi "Toàn quốc"; không có dòng vùng
- lưu ý: Số thập phân dùng dấu chấm (khác CSV NSO dùng dấu phẩy)
- lưu ý: Có thể có tỉnh không phân biệt (65 giá trị chủ thể)
- **⚠ không chắc:** Đơn vị ha — dictionary? (suy từ độ lớn 12.616.699 cả nước)
- **⚠ không chắc:** sumOf có khớp đúng không (rừng tự nhiên + trồng = tổng) — để bộ kiểm trả lời
- Ý kiến duyệt: 

## 20. `hien-trang-rung-phan-theo-dia-phuong-va-vung-2008-2024`
- **Hình dạng:** chuỗi quan sát — KHÔNG tidy: Chủ thể nằm ở HAI cột: 'province' (scope=province) hoặc 'region' (scope=region, gồm CẢ NƯỚC). Ghép thành một cột chủ thể theo scope.
- **Chủ thể:** cột `province | region (theo scope)` — loại `province`, tham chiếu `vn-admin-63`, trộn nhiều cấp
- **Thời gian:** cột `year` · nhịp `year`
  - số đo `total_forest_area_nghin_ha` → *tổng diện tích rừng* · amount · nghìn ha ✚ · mã: dien_tich_rung
  - số đo `natural_forest_nghin_ha` → *diện tích rừng tự nhiên* · amount · nghìn ha ✚ · mã: dien_tich_rung_tu_nhien
  - số đo `planted_forest_nghin_ha` → *diện tích rừng trồng* · amount · nghìn ha ✚ · mã: dien_tich_rung_trong
  - số đo `new_planting_nghin_ha` → *diện tích rừng trồng mới* · amount · nghìn ha ✚
  - số đo `forest_cover_pct` → *tỷ lệ che phủ rừng* · rate · % · mẫu số: diện tích tự nhiên; mã: ty_le_che_phu_rung
- lưu ý: Tên cột tiếng Anh
- lưu ý: new_planting trống 654 dòng
- **⚠ không chắc:** Hai dataset rừng có cùng mã chỉ tiêu không — để dữ liệu phân xử (số trùng năm sau quy đơn vị)
- Ý kiến duyệt: 

## 21. `quy-hoach-he-thong-cang-hang-khong-viet-nam-2030-2050`
- **Hình dạng:** danh sách bản ghi
- **Chủ thể:** cột `Tên Cảng hàng không` — loại `facility`, tham chiếu `None`
- **Thời gian:** cố định · nhịp `none` · quy hoạch: mốc 2030 và 2050 nằm trong tên cột
  - số đo `Công suất thiết kế dự kiến 2030` → *công suất thiết kế dự kiến 2030* · amount · triệu hành khách/năm ✚
  - số đo `Công suất thiết kế dự kiến 2050` → *công suất thiết kế dự kiến 2050* · amount · triệu hành khách/năm ✚
  - số đo `Diện tích đất dự kiến đến 2030 (ha)` → *diện tích đất dự kiến đến 2030* · amount · ha ✚
  - số đo `Diện tích đất dự kiến đến 2050 (ha)` → *diện tích đất dự kiến đến 2050* · amount · ha ✚
  - số đo `Ước tính chi phí đầu tư 2030 (tỷ đồng)` → *ước tính chi phí đầu tư đến 2030* · money · tỷ đồng ✚ · giá hiện hành
  - số đo `Ước tính chi phí đầu tư 2050 (tỷ đồng)` → *ước tính chi phí đầu tư đến 2050* · money · tỷ đồng ✚ · giá hiện hành
  - chiều `Quy mô, cấp sân bay`
  - chiều `Nhóm Sân bay`
- lưu ý: Cột chi phí TRỘN cách viết số: '9200', '161.6', '9.325', '11.695' — dấu chấm lúc là thập phân lúc là hàng nghìn; KHÔNG dùng được khi chưa làm sạch
- lưu ý: Công suất dùng dấu phẩy thập phân
- lưu ý: Một sân bay (Thủ đô thứ 2) thiếu toạ độ và tỉnh
- lưu ý: Nhóm Sân bay trống 17 dòng
- **⚠ không chắc:** Đơn vị công suất (triệu hành khách/năm) — suy từ độ lớn, không ghi trong file
- **⚠ không chắc:** Giá trị thật của cột chi phí
- Ý kiến duyệt: 

## 22. `diem-thi-tot-nghiep-thpt-quoc-gia`
- **Hình dạng:** danh sách bản ghi
- **Chủ thể:** cột `SOBAODANH` — loại `person`, tham chiếu `None`
- **Thời gian:** cột `year` · nhịp `year`
  - số đo `Toán` → *điểm Toán* · average · điểm (thang 10)
  - số đo `Ngữ văn` → *điểm Ngữ văn* · average · điểm (thang 10)
  - số đo `Ngoại ngữ` → *điểm Ngoại ngữ* · average · điểm (thang 10)
  - số đo `(các môn còn lại)` → *điểm từng môn* · average · điểm (thang 10)
  - chiều `Tỉnh thành`
  - chiều `mã môn ngoại ngữ`
- lưu ý: Mỗi dòng một thí sinh — số liệu sinh bằng gộp (trung bình, phân phối, tỷ lệ đạt) theo tỉnh / năm / môn
- lưu ý: 429 MB — phải đọc theo luồng và gộp trước
- lưu ý: Điểm trống = không thi môn đó, KHÔNG phải điểm 0
- lưu ý: Môn mới (Tin học, Công nghệ, GD KT&PL) chỉ có từ chương trình 2025
- lưu ý: Mã tỉnh theo sở GD (63 cũ) dù câu hỏi có thể theo 34
- **⚠ không chắc:** Kind cho điểm: average không hẳn đúng (là giá trị đo của một cá nhân) — có thể cần kind riêng 'score'
- **⚠ không chắc:** Các năm có trong file — chỉ đọc 256 KB đầu (2021)
- Ý kiến duyệt: 

## 23. `thu-tuc-hanh-chinh-theo-linh-vuc-va-co-quan-quan-ly`
- **Hình dạng:** chuỗi quan sát
- **Chủ thể:** cột `Tên lĩnh vực` — loại `other`, tham chiếu `None`
- **Thời gian:** cố định · nhịp `none` · sau sáp nhập bộ ngành 2025
  - số đo `Số lượng thủ tục` → *số thủ tục hành chính* · count · thủ tục ✚
  - chiều `Cơ quan quản lý sau sáp nhập`
  - chiều `Cơ quan quản lý lĩnh vực trước sáp nhập`
- lưu ý: Một ô cơ quan có thể chứa NHIỀU bộ ("Bộ Xây dựng Bộ Quốc phòng Bộ C…") — đếm theo bộ phải tách
- lưu ý: Tên lĩnh vực có trùng (266 giá trị / 272 dòng)
- lưu ý: Có thể có dòng tổng (1 dòng trống số lượng)
- **⚠ không chắc:** Có dòng tổng ở cuối hay không
- Ý kiến duyệt: 
