# Hồ sơ toàn cảnh 34 tỉnh, thành Việt Nam

## Tổng quan

Xây dựng bộ dữ liệu nền dùng chung cho 34 tỉnh, thành (sau sáp nhập), phục vụ sản xuất bài báo data journalism tại VNExpress. Mỗi giai đoạn bổ sung chỉ số mới vào cùng một cấu trúc 34×N.

> **Lưu ý**: "Data Story" là bài báo sử dụng dữ liệu từ database — không nằm trong database.

---

## Lộ trình & KPI

### Tháng 5 — Khởi tạo dataset lõi

| Mục tiêu | Hành động | Output dữ liệu |
|----------|-----------|----------------|
| Xác định kiến trúc database | Thu thập 10-15 dữ liệu lõi của 34 tỉnh, thành (địa giới hành chính, lãnh đạo, dân số, ngân sách, GRDP, FDI…) | File dataset đầu tiên (34 tỉnh × 10 chỉ số × 5 năm) |
| Khởi tạo các dataset lõi | Kết nối dữ liệu trước sáp nhập → bộ dữ liệu theo thời gian tối thiểu 5 năm | Từ điển dữ liệu (mô tả, nguồn, metadata — cập nhật liên tục) |

### Tháng 6 — Chỉ số kinh tế - xã hội

| Mục tiêu | Hành động | Output dữ liệu |
|----------|-----------|----------------|
| Kết nối chỉ số kinh tế - xã hội | Bổ sung dữ liệu Tổng cục Thống kê: Kinh tế (GRDP, ngân sách, FDI), Giáo dục (trường, giáo viên, điểm chuẩn, tỷ lệ chọi), Y tế (bệnh viện, giường bệnh, nhân viên), Lao động - việc làm | Dataset ~30-40 chỉ số |

### Tháng 7 — Chỉ số xếp hạng thường niên

| Mục tiêu | Hành động | Output dữ liệu |
|----------|-----------|----------------|
| Kết nối chỉ số xếp hạng | Thu thập PCI, PAPI, PAR INDEX, SIPAS; chuẩn hóa về 1 bảng ranking theo tỉnh, thành | Dataset ranking 3-5 năm |

### Tháng 8 — Hạ tầng

| Mục tiêu | Hành động | Output dữ liệu |
|----------|-----------|----------------|
| Kết nối dữ liệu hạ tầng | Thu thập: cao tốc, sân bay, cảng biển, khu công nghiệp, dự án đầu tư công | Dataset hạ tầng trọng yếu |

### Tháng 9 — Khí hậu - thiên tai - môi trường

| Mục tiêu | Hành động | Output dữ liệu |
|----------|-----------|----------------|
| Kết nối dữ liệu môi trường | Chỉ số khí hậu (nhiệt độ, lượng mưa, chất lượng không khí), thống kê thiên tai (bão, lũ, sạt lở) & thiệt hại, dữ liệu môi trường cơ bản theo địa phương | Dataset môi trường |

### Tháng 10 — Niên giám thống kê tỉnh thành

| Mục tiêu | Hành động | Output dữ liệu |
|----------|-----------|----------------|
| Kết nối niên giám thống kê | Thu thập niên giám thống kê 34 tỉnh thành, tối thiểu 5 năm | Dataset chi tiết tỉnh thành |

### Tháng 11 — Dữ liệu doanh nghiệp

| Mục tiêu | Hành động | Output dữ liệu |
|----------|-----------|----------------|
| Kết nối dữ liệu doanh nghiệp | Thu thập từ sách trắng: Doanh nghiệp VN (Bộ KH&ĐT), CNTT-TT, Thương mại điện tử (Bộ Công Thương), Logistics | Dataset kinh tế ngành |

### Tháng 12 — Đóng gói v1

| Mục tiêu | Hành động | Output dữ liệu |
|----------|-----------|----------------|
| Hoàn thiện & đóng gói | Hoàn thiện dashboard hồ sơ 34 tỉnh thành; thiết kế quy trình cập nhật dữ liệu định kỳ | Bộ dữ liệu nền dùng chung (v1) + Data dictionary |

---

## Quy ước dữ liệu

- **Đơn vị phân tích**: 34 tỉnh, thành (sau sáp nhập)
- **Chuỗi thời gian**: tối thiểu 5 năm
- **Nguồn chính**: Tổng cục Thống kê, niên giám tỉnh thành, sách trắng ngành, các chỉ số xếp hạng (PCI, PAPI, PAR Index, SIPAS)
- **Từ điển dữ liệu**: cập nhật liên tục mỗi khi bổ sung dữ liệu mới (mô tả, nguồn, metadata)
