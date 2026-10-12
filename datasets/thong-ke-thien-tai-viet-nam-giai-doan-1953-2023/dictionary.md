# Dictionary

| Column | Type | Dec | Group | Unit | Description |
|--------|------|-----|-------|------|-------------|
| `DisNo.` | string | - | - | - | Mã định danh duy nhất cho từng sự kiện thiên tai hoặc tai nạn. |
| `Historic` | category | - | - | - | Cho biết sự kiện có được coi là lịch sử hay không ('Yes'/'No'). |
| `Classification Key` | category | - | - | - | Mã phân loại chi tiết của sự kiện (ví dụ: nat-met-sto-tro cho thiên tai-khí tượng-bão-xoáy thuận nhiệt đới). |
| `Disaster Group` | category | - | - | - | Nhóm sự kiện chính (ví dụ: 'Natural' cho thiên tai tự nhiên, 'Technological' cho tai nạn công nghệ). |
| `Disaster Subgroup` | category | - | - | - | Nhóm phụ của sự kiện (ví dụ: 'Meteorological' cho khí tượng, 'Hydrological' cho thủy văn). |
| `Disaster Type` | category | - | - | - | Loại sự kiện cụ thể (ví dụ: 'Storm' cho bão, 'Flood' cho lũ lụt). |
| `Disaster Subtype` | category | - | - | - | Loại phụ sự kiện chi tiết hơn (ví dụ: 'Tropical cyclone' cho xoáy thuận nhiệt đới, 'Riverine flood' cho lũ sông). |
| `External IDs` | string | - | - | - | Mã định danh từ các cơ sở dữ liệu bên ngoài (ví dụ: GLIDE, DFO). |
| `Event Name` | string | - | - | - | Tên của sự kiện (nếu có). |
| `ISO` | category | - | - | - | Mã quốc gia theo tiêu chuẩn ISO 3166-1 alpha-3 ('VNM' cho Việt Nam). |
| `Country` | category | - | - | - | Tên quốc gia ('Viet Nam'). |
| `Subregion` | category | - | - | - | Tiểu vùng địa lý ('South-eastern Asia'). |
| `Region` | category | - | - | - | Vùng địa lý ('Asia'). |
| `Location` | string | - | - | - | Mô tả địa điểm cụ thể xảy ra sự kiện. |
| `Origin` | string | - | - | - | Nguyên nhân hoặc nguồn gốc của sự kiện (ví dụ: 'Heavy rain' cho mưa lớn). |
| `Associated Types` | string | - | - | - | Các loại sự kiện liên quan khác xảy ra đồng thời (ví dụ: 'Flood', 'Slide'). |
| `OFDA Response` | category | - | - | - | Cho biết Văn phòng Hỗ trợ Thiên tai Nước ngoài Hoa Kỳ (OFDA) có phản ứng hay không ('Yes'/'No'). |
| `Appeal` | category | - | - | - | Cho biết có lời kêu gọi hỗ trợ quốc tế hay không ('Yes'/'No'). |
| `Declaration` | category | - | - | - | Cho biết có tuyên bố tình trạng khẩn cấp hay không ('No'). |
| `AID Contribution ('000 US$)` | number | - | - | nghìn USD | Tổng số tiền viện trợ quốc tế đóng góp cho sự kiện, tính bằng nghìn đô la Mỹ. |
| `Magnitude` | number | - | - | unknown | Cường độ hoặc quy mô của sự kiện. Đơn vị được chỉ định trong cột 'Magnitude Scale'. |
| `Magnitude Scale` | category | - | - | - | Đơn vị đo lường cường độ sự kiện (ví dụ: 'Kph' cho km/h, 'Km2' cho km vuông, 'm3' cho mét khối, 'Vaccinated' cho số người được tiêm chủng). |
| `Latitude` | number | . | , | độ | Vĩ độ của địa điểm xảy ra sự kiện. |
| `Longitude` | number | . | , | độ | Kinh độ của địa điểm xảy ra sự kiện. |
| `River Basin` | string | - | - | - | Lưu vực sông bị ảnh hưởng bởi sự kiện. |
| `Start Year` | number | - | - | năm | Năm bắt đầu của sự kiện. |
| `Start Month` | number | - | - | tháng | Tháng bắt đầu của sự kiện. |
| `Start Day` | number | - | - | ngày | Ngày bắt đầu của sự kiện. |
| `End Year` | number | - | - | năm | Năm kết thúc của sự kiện. |
| `End Month` | number | - | - | tháng | Tháng kết thúc của sự kiện. |
| `End Day` | number | - | - | ngày | Ngày kết thúc của sự kiện. |
| `Total Deaths` | number | - | - | người | Tổng số người chết do sự kiện. |
| `No. Injured` | number | - | - | người | Số người bị thương do sự kiện. |
| `No. Affected` | number | - | - | người | Số người bị ảnh hưởng trực tiếp bởi sự kiện (không bao gồm người chết, bị thương, mất nhà cửa). |
| `No. Homeless` | number | - | - | người | Số người mất nhà cửa do sự kiện. |
| `Total Affected` | number | - | - | người | Tổng số người bị ảnh hưởng bởi sự kiện (bao gồm người chết, bị thương, mất nhà cửa và các ảnh hưởng khác). |
| `Reconstruction Costs ('000 US$)` | string | - | - | nghìn USD | Chi phí tái thiết ước tính, tính bằng nghìn đô la Mỹ. Cột này hiện không có dữ liệu. |
| `Reconstruction Costs, Adjusted ('000 US$)` | string | - | - | nghìn USD | Chi phí tái thiết đã điều chỉnh theo lạm phát, tính bằng nghìn đô la Mỹ. Cột này hiện không có dữ liệu. |
| `Insured Damage ('000 US$)` | number | - | - | nghìn USD | Thiệt hại được bảo hiểm, tính bằng nghìn đô la Mỹ. |
| `Insured Damage, Adjusted ('000 US$)` | number | - | - | nghìn USD | Thiệt hại được bảo hiểm đã điều chỉnh theo lạm phát, tính bằng nghìn đô la Mỹ. |
| `Total Damage ('000 US$)` | number | - | - | nghìn USD | Tổng thiệt hại kinh tế ước tính, tính bằng nghìn đô la Mỹ. |
| `Total Damage, Adjusted ('000 US$)` | number | - | - | nghìn USD | Tổng thiệt hại kinh tế đã điều chỉnh theo lạm phát, tính bằng nghìn đô la Mỹ. |
| `CPI` | number | . | , | chỉ số | Chỉ số giá tiêu dùng (CPI) được sử dụng để điều chỉnh các giá trị thiệt hại. |
| `Admin Units` | string | - | - | - | Các đơn vị hành chính bị ảnh hưởng, được lưu trữ dưới dạng chuỗi JSON. |
| `Entry Date` | date | - | - | ngày | Ngày sự kiện được nhập vào cơ sở dữ liệu. |
| `Last Update` | date | - | - | ngày | Ngày cuối cùng thông tin về sự kiện được cập nhật. |
