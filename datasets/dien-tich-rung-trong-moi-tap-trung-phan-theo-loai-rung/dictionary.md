# Dictionary

| Column | Type | Dec | Group | Unit | Description |
|--------|------|-----|-------|------|-------------|
| `scope` | category | - | - | - | Phạm vi dữ liệu, ở đây là toàn quốc. |
| `year` | number | - | - | năm | Năm thống kê. |
| `metric` | category | - | - | - | Loại số liệu: giá trị tuyệt đối ('absolute') hoặc chỉ số so với năm trước ('index_relative_to_previous_year'). |
| `forest_type` | category | - | - | - | Loại rừng trồng: tổng cộng ('total'), rừng sản xuất ('production'), rừng phòng hộ ('protection'), rừng đặc dụng ('special_use'). |
| `value` | number | - | - | phụ thuộc cột `unit` | Giá trị số liệu, đơn vị được chỉ định trong cột `unit`. |
| `unit` | category | - | - | - | Đơn vị của giá trị số liệu (`value`): 'nghìn ha' cho giá trị tuyệt đối hoặc 'index (năm trước = 100)' cho chỉ số tăng trưởng. |
| `flag` | string | - | - | - | Cờ hoặc ghi chú đặc biệt cho dữ liệu (ví dụ: 'preliminary' - số liệu sơ bộ). |
