# Dictionary

| Column | Type | Unit | Description |
|--------|------|------|-------------|
| `h3_index` | string | - | Chỉ số H3 đại diện cho một khu vực địa lý cụ thể, thường được sử dụng để phân tích không gian. |
| `destination_station_name` | category | - | Tên ga đến của hành trình, có thể là các ga thuộc hệ thống Metro TP.HCM. |
| `departure_daytime` | date | datetime | Thời điểm khởi hành của chuyến đi, bao gồm ngày và giờ. |
| `TTR` | number | unknown | Tỷ lệ thời gian di chuyển (Travel Time Ratio) hoặc một chỉ số tương tự, phản ánh hiệu quả di chuyển hoặc so sánh thời gian di chuyển giữa các phương thức. |
| `public_time_min` | number | phút | Thời gian di chuyển ước tính bằng phương tiện công cộng đến ga đến, tính bằng phút. |
| `private_time_min` | number | phút | Thời gian di chuyển ước tính bằng phương tiện cá nhân đến ga đến, tính bằng phút. |
