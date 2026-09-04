# Data Dictionary — 34 Tỉnh Thành Datasets

Nguồn: `250703_34tinhthanh_Cleaned.xlsx` + `Data_TPHCM mới_xã phường.xlsx`

---

## 1. Bảng `entities_catalog` (cập nhật 34 tỉnh)

| Column | Type | Mô tả | Nguồn |
|--------|------|-------|-------|
| entity_id | VARCHAR(50) PK | Mã tỉnh (VD: VN-HCM) | Tự sinh |
| entity_name | VARCHAR(150) | Tên tỉnh mới (VD: "TP Hồ Chí Minh") | `Thongtintinhthanh.TinhThanh` |
| entity_type | VARCHAR(30) | PROVINCE / REGION / NATIONAL | — |
| old_codes | TEXT[] | Mã tỉnh cũ trước sáp nhập | — |
| old_provinces | TEXT | Tỉnh thành phần trước sáp nhập | `Thongtintinhthanh.Truocsapnhap` |
| region | TEXT | Vùng kinh tế | Gán tay |
| admin_center | TEXT | Trung tâm hành chính mới | `Thongtintinhthanh.Trungtamhanhchinhmoi` |
| tags | TEXT[] | Tags từ bảng tags | — |
| created_at | TIMESTAMPTZ | — | — |

---

## 2. Bảng `province_stats` (NEW)

Thống kê chính của 34 tỉnh sau sáp nhập.

| Column | Type | Mô tả | Nguồn | Unit |
|--------|------|-------|-------|------|
| entity_id | VARCHAR(50) FK → entities_catalog | Mã tỉnh | — | — |
| year | INT | Năm dữ liệu (2025) | — | — |
| population | BIGINT | Dân số | `Thongtintinhthanh.Danso` | người |
| area | NUMERIC | Diện tích tự nhiên | `Thongtintinhthanh.Dientich` | km² |
| density | NUMERIC | Mật độ dân số (tính = population/area) | Tính | người/km² |
| num_wards | INT | Số đơn vị hành chính cấp xã | `Thongtintinhthanh.SoDVHCcapxa` | đơn vị |
| grdp | NUMERIC | GRDP | `Thongtintinhthanh.GRDP` | tỷ đồng |
| budget_revenue | NUMERIC | Thu ngân sách | `Thongtintinhthanh.Thungansach` | tỷ đồng |
| seaports | INT | Số cảng biển | `Thongtintinhthanh.Socangbien` | cảng |
| airports | INT | Số sân bay | `Thongtintinhthanh.Sosanbay` | sân bay |
| rank_population | INT | Thứ hạng dân số | `Thongtintinhthanh.ThuhangDanso` | — |
| rank_area | INT | Thứ hạng diện tích | `Thongtintinhthanh.ThuhangDientich` | — |
| rank_grdp | INT | Thứ hạng GRDP | `Thongtintinhthanh.ThuhangGRDP` | — |
| rank_budget | INT | Thứ hạng thu ngân sách | `Thongtintinhthanh.ThuhangThungansach` | — |
| is_merged | BOOLEAN | Có sáp nhập không | `Thongtintinhthanh.Sapnhap` (1/0) | — |
| created_at | TIMESTAMPTZ | — | — | — |

**PK**: `(entity_id, year)`

---

## 3. Bảng `wards` (NEW)

Xã phường mới sau sáp nhập — 3,321 dòng từ 34 tỉnh + 168 chi tiết HCMC.

| Column | Type | Mô tả | Nguồn | Unit |
|--------|------|-------|-------|------|
| id | SERIAL PK | — | — | — |
| entity_id | VARCHAR(50) FK | Mã tỉnh | — | — |
| ward_name | VARCHAR(200) | Tên xã/phường mới | `Xaphuongmoi.Phuongxamoi` / `Data.Tên` | — |
| ward_type | VARCHAR(20) | Xã / Phường / Thị trấn | `Xaphuongmoi.Loai` / `Data.Loại` | — |
| ward_slug | VARCHAR(200) | Slug tên (không dấu) | `(chuachuan)Xaphuong.ward_new_key` | — |
| old_wards | TEXT | Xã phường cũ trước sáp nhập | `Xaphuongmoi.Phuongxacu` / `Data.Sáp nhập toàn bộ từ` | — |
| partial_merge_from | TEXT | Sáp nhập một phần từ | `Data.Sáp nhập một phần từ` | — |
| adjacent | TEXT | Giáp ranh | `Data.Giáp ranh` | — |
| population | BIGINT | Dân số (chỉ HCMC) | `Data.Dân số` | người |
| area | NUMERIC | Diện tích (chỉ HCMC) | `Data.Diện tích` | km² |
| density | NUMERIC | Mật độ (chỉ HCMC) | `Data.Mật độ` | người/km² |
| hq_name | TEXT | Tên trụ sở hành chính | `Data.Trụ sở hành chính 1` | — |
| hq_address | TEXT | Địa chỉ trụ sở | `Data.Địa chỉ trụ sở hành chính 1` | — |
| hq_full_address | TEXT | Địa chỉ đầy đủ | `Data.Full Address 1` | — |
| latitude | NUMERIC | Vĩ độ trụ sở | `Data.Latitude 1` | độ |
| longitude | NUMERIC | Kinh độ trụ sở | `Data.Longitude 1` | độ |
| hq2_name | TEXT | Trụ sở 2 (nếu có) | `Data.Trụ sở hành chính 2` | — |
| hq2_address | TEXT | Địa chỉ trụ sở 2 | `Data.Địa chỉ trụ sở hành chính 2` | — |
| hq2_full_address | TEXT | Địa chỉ đầy đủ 2 | `Data.Full Address 2` | — |
| latitude2 | NUMERIC | Vĩ độ trụ sở 2 | `Data.Latitude 2` | độ |
| longitude2 | NUMERIC | Kinh độ trụ sở 2 | `Data.Longitude 2` | độ |
| hq_note | TEXT | Ghi chú trụ sở | `Data.Ghi chú trụ sở` | — |
| old_dist | TEXT | Huyện cũ | `(chuachuan)Xaphuong.Dist_old` | — |
| old_prov | TEXT | Tỉnh cũ | `(chuachuan)Xaphuong.Prov_old` | — |
| created_at | TIMESTAMPTZ | — | — | — |

**Index**: `(entity_id)`, `(ward_type)`, `(ward_slug)`

---

## 4. Bảng `leadership` (NEW)

Lãnh đạo 34 tỉnh sau sáp nhập.

| Column | Type | Mô tả | Nguồn | Unit |
|--------|------|-------|-------|------|
| id | SERIAL PK | — | — | — |
| entity_id | VARCHAR(50) FK | Mã tỉnh | — | — |
| role | VARCHAR(30) | 'bí thư' / 'chủ tịch' | — | — |
| title | VARCHAR(200) | Chức danh đầy đủ | `Lanhdao.ChucDanhBithu` / `ChucDanhChutich` | — |
| name | VARCHAR(100) | Họ tên | `Lanhdao.HoTenBithu` / `HoTenChutich` | — |
| photo_url | TEXT | URL ảnh | `Lanhdao.AnhBithu` / `AnhChutich` | — |
| deputies | TEXT | Danh sách phó | `Lanhdao.CacPhobithu` / `CacPhochutich` | — |
| created_at | TIMESTAMPTZ | — | — | — |

**Index**: `(entity_id)`, `(role)`

---

## 5. Các bảng hiện có (giữ nguyên)

- `resources` — tài nguyên đính kèm (PDF, CSV, JSON...)
- `resource_versions` — version history
- `indicator_metadata` — định nghĩa indicators
- `tags` — controlled vocabulary

---

## Mapping tỉnh → entity_id

| Tỉnh (Excel) | entity_id | old_provinces |
|---|---|---|
| TP HCM | VN-HCM | TP HCM, Bình Dương, Bà Rịa - Vũng Tàu |
| Hà Nội | VN-HN | Không sáp nhập |
| Hải Phòng | VN-HP | Hải Phòng, Hải Dương |
| Đà Nẵng | VN-DN | Đà Nẵng, Quảng Nam |
| Cần Thơ | VN-CT | Cần Thơ, Sóc Trăng, Hậu Giang |
| An Giang | VN-AG | An Giang, Kiên Giang |
| Bắc Ninh | VN-BNH | Bắc Ninh, Bắc Giang |
| Cà Mau | VN-CH | Cà Mau, Bạc Liêu |
| Đồng Nai | VN-DNai | Đồng Nai, Bình Phước |
| Đồng Tháp | VN-DT | Đồng Tháp, Tiền Giang |
| Vĩnh Long | VN-VL | Vĩnh Long, Bến Tre, Trà Vinh |
| Tây Ninh | VN-TN | Tây Ninh, Long An |
| Hưng Yên | VN-HY | Hưng Yên, Thái Bình |
| Ninh Bình | VN-NA | Ninh Bình, Nam Định, Hà Nam |
| Phú Thọ | VN-PT | Phú Thọ, Vĩnh Phúc, Hoà Bình |
| Tuyên Quang | VN-TQ | Tuyên Quang, Hà Giang |
| Lào Cai | VN-LC | Lào Cai, Yên Bái |
| Gia Lai | — (mới) | Gia Lai, Bình Định |
| Đắk Lắk | — (mới) | Đăk Lăk, Phú Yên |
| Lâm Đồng | — (mới) | Lâm Đồng, Đắk Nông, Bình Thuận |
| Quảng Ngãi | VN-QN | Quảng Ngãi, Kon Tum |
| Khánh Hòa | VN-KH | Khánh Hòa, Ninh Thuận |
| Quảng Trị | — (mới) | Quảng Trị, Quảng Bình |
| Nghệ An | VN-VH | Không sáp nhập |
| Thanh Hoá | VN-HH | Không sáp nhập |
| Hà Tĩnh | — (mới) | Không sáp nhập |
| TP Huế | — (mới) | Không sáp nhập |
| Quảng Ninh | — (mới) | Không sáp nhập |
| Thái Nguyên | — (mới) | Thái Nguyên, Bắc Kạn |
| Lạng Sơn | — (mới) | Không sáp nhập |
| Điện Biên | VN-DB | Không sáp nhập |
| Lai Châu | VN-LC | Không sáp nhập |
| Sơn La | VN-SL | Không sáp nhập |
| Cao Bằng | — (mới) | Không sáp nhập |

> **Ghi chú**: Các tỉnh "mới" (chưa có entity_id) cần được gán mã mới trong migration.
