# Dictionary

| Column | Type | Dec | Group | Unit | Description |
|--------|------|-----|-------|------|-------------|
| `Chỉ tiêu` | category | - | - | - | Chỉ tiêu thống kê về y tế, bao gồm số giường bệnh, giường bệnh bình quân trên 1 vạn dân, số bác sĩ và bác sĩ bình quân trên 1 vạn dân. |
| `Năm` | number | - | - | năm | Năm thống kê dữ liệu. |
| `Ghi chú` | string | - | - | - | Ghi chú về tính chất của dữ liệu, ví dụ 'Sơ bộ' cho dữ liệu chưa chính thức. |
| `Số giường bệnh và số bác sĩ` | number | , | . | unknown | Giá trị thống kê tương ứng với từng chỉ tiêu theo từng năm. Đơn vị cụ thể (ví dụ: nghìn giường, giường, nghìn người, người) được xác định bởi cột 'Chỉ tiêu'. |
| `Chỉ số phát triển (Năm trước = 100) (%)` | number | , | . | % | Chỉ số phát triển của giá trị thống kê so với năm trước đó (lấy năm trước làm 100%). |
