-- 34 Tỉnh Thành — Seed Data
-- Chạy trên Supabase SQL Editor sau 001_schema.sql

-- ============================================================
-- 1. SEED 34 TỈNH THÀNH (sau sáp nhập 2025)
-- ============================================================

INSERT INTO entities_catalog (entity_id, entity_name, entity_type, old_codes, region) VALUES
-- Vùng Đông Nam Bộ
('VN-HCM', 'Thành phố Hồ Chí Minh', 'PROVINCE', '{"79"}', 'Đông Nam Bộ'),
('VN-BV', 'Tỉnh Bình Dương', 'PROVINCE', '{"74"}', 'Đông Nam Bộ'),
('VN-DN', 'Thành phố Đà Nẵng', 'PROVINCE', '{"48","49"}', 'Đông Nam Bộ'),
('VN-BRVT', 'Tỉnh Bà Rịa - Vũng Tàu', 'PROVINCE', '{"70","71"}', 'Đông Nam Bộ'),
('VN-BP', 'Tỉnh Bình Phước', 'PROVINCE', '{"70"}', 'Đông Nam Bộ'),
-- Note: Sau sáp nhập, một số tỉnh gộp. Cần cập nhật khi có quyết định chính thức.
-- Tạm seed theo cấu trúc hiện tại, sẽ update khi có data GSO mới.

-- Đông Nam Bộ (tiếp)
('VN-DNai', 'Tỉnh Đồng Nai', 'PROVINCE', '{"60"}', 'Đông Nam Bộ'),
('VN-TN', 'Tỉnh Tây Ninh', 'PROVINCE', '{"72"}', 'Đông Nam Bộ'),

-- Vùng Đồng bằng sông Cửu Long
('VN-CT', 'Thành phố Cần Thơ', 'PROVINCE', '{"92"}', 'Đồng bằng sông Cửu Long'),
('VN-AG', 'Tỉnh An Giang', 'PROVINCE', '{"88","89"}', 'Đồng bằng sông Cửu Long'),
('VN-BL', 'Tỉnh Bạc Liêu', 'PROVINCE', '{"95"}', 'Đồng bằng sông Cửu Long'),
('VN-BN', 'Tỉnh Bến Tre', 'PROVINCE', '{"83"}', 'Đồng bằng sông Cửu Long'),
('VN-KG', 'Tỉnh Kiên Giang', 'PROVINCE', '{"91"}', 'Đồng bằng sông Cửu Long'),
('VN-LA', 'Tỉnh Long An', 'PROVINCE', '{"80"}', 'Đồng bằng sông Cửu Long'),
('VN-DT', 'Tỉnh Đồng Tháp', 'PROVINCE', '{"81"}', 'Đồng bằng sông Cửu Long'),
('VN-ST', 'Tỉnh Sóc Trăng', 'PROVINCE', '{"94"}', 'Đồng bằng sông Cửu Long'),
('VN-TG', 'Tỉnh Tiền Giang', 'PROVINCE', '{"82"}', 'Đồng bằng sông Cửu Long'),
('VN-TV', 'Tỉnh Trà Vinh', 'PROVINCE', '{"86"}', 'Đồng bằng sông Cửu Long'),
('VN-VL', 'Tỉnh Vĩnh Long', 'PROVINCE', '{"87"}', 'Đồng bằng sông Cửu Long'),
('VN-CH', 'Tỉnh Cà Mau', 'PROVINCE', '{"96"}', 'Đồng bằng sông Cửu Long'),
('VN-HG', 'Tỉnh Hậu Giang', 'PROVINCE', '{"93"}', 'Đồng bằng sông Cửu Long'),

-- Vùng Đồng bằng sông Hồng
('VN-HN', 'Thành phố Hà Nội', 'PROVINCE', '{"01"}', 'Đồng bằng sông Hồng'),
('VN-HP', 'Thành phố Hải Phòng', 'PROVINCE', '{"31"}', 'Đồng bằng sông Hồng'),
('VN-HY', 'Tỉnh Hưng Yên', 'PROVINCE', {"33","34"}', 'Đồng bằng sông Hồng'),
('VN-NA', 'Tỉnh Ninh Bình', 'PROVINCE', '{"18"}', 'Đồng bằng sông Hồng'),
('VN-TH', 'Tỉnh Thái Bình', 'PROVINCE', '{"20"}', 'Đồng bằng sông Hồng'),
('VN-HM', 'Tỉnh Hải Dương', 'PROVINCE', '{"30"}', 'Đồng bằng sông Hồng'),
('VN-BNH', 'Tỉnh Bắc Ninh', 'PROVINCE', '{"35"}', 'Đồng bằng sông Hồng'),

-- Vùng Trung du và Miền núi phía Bắc
('VN-BG', 'Tỉnh Bắc Giang', 'PROVINCE', '{"24","06"}', 'Trung du và miền núi phía Bắc'),
('VN-TQ', 'Tỉnh Tuyên Quang', 'PROVINCE', '{"08","09"}', 'Trung du và miền núi phía Bắc'),
('VN-PT', 'Tỉnh Phú Thọ', 'PROVINCE', '{"25","02"}', 'Trung du và miền núi phía Bắc'),
('VN-DB', 'Tỉnh Điện Biên', 'PROVINCE', '{"11"}', 'Trung du và miền núi phía Bắc'),
('VN-LC', 'Tỉnh Lai Châu', 'PROVINCE', '{"12"}', 'Trung du và miền núi phía Bắc'),
('VN-SL', 'Tỉnh Sơn La', 'PROVINCE', '{"14"}', 'Trung du và miền núi phía Bắc'),
('VN-YB', 'Tỉnh Yên Bái', 'PROVINCE', '{"06","07"}', 'Trung du và miền núi phía Bắc'),

-- Vùng Bắc Trung Bộ
('VN-VH', 'Tỉnh Nghệ An', 'PROVINCE', '{"40","42"}', 'Bắc Trung Bộ'),
('VN-HH', 'Tỉnh Thanh Hóa', 'PROVINCE', '{"38"}', 'Bắc Trung Bộ'),
('VN-QB', 'Tỉnh Quảng Bình', 'PROVINCE', '{"44"}', 'Bắc Trung Bộ'),

-- Vùng Nam Trung Bộ
('VN-QN', 'Tỉnh Quảng Ngãi', 'PROVINCE', '{"49","52"}', 'Nam Trung Bộ'),
('VN-KH', 'Tỉnh Khánh Hòa', 'PROVINCE', '{"56"}', 'Nam Trung Bộ'),
('VN-BTh', 'Tỉnh Bình Thuận', 'PROVINCE', '{"60"}', 'Nam Trung Bộ'),
('VN-NT', 'Tỉnh Ninh Thuận', 'PROVINCE', '{"58"}', 'Nam Trung Bộ');

-- Thực thể vùng
INSERT INTO entities_catalog (entity_id, entity_name, entity_type) VALUES
('REG-DNB', 'Đông Nam Bộ', 'REGION'),
('REG-DBSCL', 'Đồng bằng sông Cửu Long', 'REGION'),
('REG-DBSH', 'Đồng bằng sông Hồng', 'REGION'),
('REG-TDMNPB', 'Trung du và miền núi phía Bắc', 'REGION'),
('REG-BTBo', 'Bắc Trung Bộ', 'REGION'),
('REG-NTBo', 'Nam Trung Bộ', 'REGION'),
('REG-TNguyen', 'Tây Nguyên', 'REGION');

-- Quốc gia
INSERT INTO entities_catalog (entity_id, entity_name, entity_type) VALUES
('NAT-VN', 'Việt Nam', 'NATIONAL');

-- ============================================================
-- 2. SEED INDICATOR METADATA
-- ============================================================

INSERT INTO indicator_metadata (key, name_vi, unit, description, source, category) VALUES
-- Kinh tế vĩ mô
('grdp', 'GRDP', 'tỷ đồng', 'Tổng sản phẩm trên địa bàn tỉnh', 'Tổng cục Thống kê', 'vĩ mô'),
('grdp_growth', 'Tốc độ tăng trưởng GRDP', '%', 'Tốc độ tăng trưởng GRDP so với năm trước', 'Tổng cục Thống kê', 'vĩ mô'),
('population', 'Dân số', 'người', 'Dân số trung bình', 'Tổng cục Thống kê', 'vĩ mô'),
('population_density', 'Mật độ dân số', 'người/km²', 'Dân số trên đơn vị diện tích', 'Tổng cục Thống kê', 'vĩ mô'),
('budget_revenue', 'Thu ngân sách', 'tỷ đồng', 'Tổng thu ngân sách nhà nước trên địa bàn', 'Bộ Tài chính', 'vĩ mô'),
('budget_expenditure', 'Chi ngân sách', 'tỷ đồng', 'Tổng chi ngân sách nhà nước trên địa bàn', 'Bộ Tài chính', 'vĩ mô'),
('fdi_capital', 'Vốn FDI thực hiện', 'triệu USD', 'Vốn đầu tư trực tiếp nước ngoài thực hiện', 'Tổng cục Thống kê', 'vĩ mô'),
('fdi_projects', 'Số dự án FDI', 'dự án', 'Số dự án đầu tư trực tiếp nước ngoài còn hiệu lực', 'Tổng cục Thống kê', 'vĩ mô'),
('area', 'Diện tích', 'km²', 'Diện tích tự nhiên', 'Tổng cục Thống kê', 'vĩ mô'),
('grdp_per_capita', 'GRDP bình quân đầu người', 'triệu đồng', 'GRDP chia cho dân số trung bình', 'Tổng cục Thống kê', 'vĩ mô'),

-- Giáo dục
('schools_primary', 'Trường tiểu học', 'trường', 'Số trường tiểu học', 'Tổng cục Thống kê', 'giáo dục'),
('teachers_primary', 'Giáo viên tiểu học', 'người', 'Số giáo viên tiểu học', 'Tổng cục Thống kê', 'giáo dục'),

-- Y tế
('hospitals', 'Bệnh viện', 'cơ sở', 'Số bệnh viện', 'Tổng cục Thống kê', 'y tế'),
('hospital_beds', 'Giường bệnh', 'giường', 'Số giường bệnh', 'Tổng cục Thống kê', 'y tế');

-- ============================================================
-- 3. SEED TAGS
-- ============================================================

INSERT INTO tags (slug, name, category) VALUES
-- Loại dữ liệu
('vi-mo', 'Vĩ mô', 'lĩnh vực'),
('giao-duc', 'Giáo dục', 'lĩnh vực'),
('y-te', 'Y tế', 'lĩnh vực'),
('ha-tang', 'Hạ tầng', 'lĩnh vực'),
('khi-hau', 'Khí hậu', 'lĩnh vực'),
('xep-hang', 'Xếp hạng', 'lĩnh vực'),
('lao-dong', 'Lao động', 'lĩnh vực'),
('doanh-nghiep', 'Doanh nghiệp', 'lĩnh vực'),
('quy-hoach', 'Quy hoạch', 'loại tài liệu'),
('bao-cao', 'Báo cáo', 'loại tài liệu'),
('phong-van', 'Phỏng vấn', 'loại tài liệu'),
('sach-trang', 'Sách trắng', 'loại tài liệu'),
('nien-giam', 'Niên giám', 'nguồn'),
('gso', 'Tổng cục Thống kê', 'nguồn'),
('bo-tai-chinh', 'Bộ Tài chính', 'nguồn'),
('pci', 'PCI', 'nguồn'),
('papi', 'PAPI', 'nguồn'),
('geojson', 'GeoJSON', 'định dạng'),
('csv', 'CSV', 'định dạng'),
('pdf', 'PDF', 'định dạng');
