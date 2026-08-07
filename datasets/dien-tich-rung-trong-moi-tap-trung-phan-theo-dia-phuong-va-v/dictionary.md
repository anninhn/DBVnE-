# Dictionary

| Column | Type | Dec | Group | Unit | Description |
|--------|------|-----|-------|------|-------------|
| `scope` | category | - | - | - | Cấp độ tổng hợp dữ liệu: 'province' cho cấp tỉnh, 'region' cho cấp vùng hoặc cả nước. |
| `province` | category | - | - | - | Tên tỉnh/thành phố trực thuộc trung ương. Cột này có giá trị khi dữ liệu ở cấp tỉnh (scope='province') và rỗng khi dữ liệu ở cấp vùng hoặc cả nước. |
| `region` | category | - | - | - | Tên vùng kinh tế - xã hội hoặc 'CẢ NƯỚC'. Cột này có giá trị khi dữ liệu ở cấp vùng hoặc cả nước (scope='region') và rỗng khi dữ liệu ở cấp tỉnh. |
| `year` | number | - | - | năm | Năm thống kê. |
| `metric` | category | - | - | - | Chỉ số thống kê: 'new_planted_forest_area' là diện tích rừng trồng mới tập trung. |
| `value` | number | . | , | nghìn ha | Giá trị diện tích rừng trồng mới tập trung. |
| `unit` | string | - | - | - | Đơn vị của giá trị diện tích rừng. |
| `flag` | category | - | - | - | Cờ chỉ trạng thái dữ liệu, ví dụ 'preliminary' cho dữ liệu sơ bộ. Các giá trị rỗng có thể là dữ liệu chính thức. |
