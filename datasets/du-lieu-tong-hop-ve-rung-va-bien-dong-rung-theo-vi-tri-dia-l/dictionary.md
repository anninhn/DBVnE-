# Dictionary

| Column | Type | Dec | Group | Unit | Description |
|--------|------|-----|-------|------|-------------|
| `latitude` | number | . | , | độ | Vĩ độ của điểm dữ liệu. |
| `longitude` | number | . | , | độ | Kinh độ của điểm dữ liệu. |
| `area_ha` | number | . | , | ha | Diện tích của khu vực được phân tích (có thể là một ô lưới hoặc một vùng). |
| `forest_baseline_ha` | number | . | , | ha | Diện tích rừng tại thời điểm cơ sở (baseline) của khu vực. |
| `pct_of_forest` | number | - | - | % | Tỷ lệ phần trăm diện tích rừng so với tổng diện tích khu vực. |
| `gi_z` | number | - | - | unknown | Giá trị Z-score của thống kê Getis-Ord Gi*, thường dùng trong phân tích điểm nóng (hotspot analysis) để xác định các khu vực có giá trị cao hoặc thấp tập trung. |
| `cluster_class` | category | - | - | - | Phân loại cụm dựa trên phân tích không gian, ví dụ: 'not significant' (không đáng kể), 'hot spot p<0.01' (điểm nóng với p-value < 0.01). |
| `mean_year` | number | . | , | năm | Năm trung bình của sự kiện hoặc dữ liệu được ghi nhận trong khu vực, có thể liên quan đến biến động rừng. |
| `province` | category | - | - | - | Tên tỉnh/thành phố của khu vực. |
| `district` | category | - | - | - | Tên huyện/quận của khu vực. |
