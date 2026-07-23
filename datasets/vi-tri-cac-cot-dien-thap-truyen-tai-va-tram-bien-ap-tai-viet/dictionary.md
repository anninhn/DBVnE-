# Dictionary

| Column | Type | Dec | Group | Unit | Description |
|--------|------|-----|-------|------|-------------|
| `design` | category | - | - | unknown | Kiểu thiết kế của cột điện hoặc tháp truyền tải điện (ví dụ: delta, three-level, asymmetric). |
| `power` | category | - | - | unknown | Loại hình hạ tầng điện lực tại vị trí này (ví dụ: tower - tháp truyền tải, pole - cột điện, transformer - trạm biến áp). |
| `line_attachment` | category | - | - | unknown | Kiểu gắn dây điện vào cột/tháp (ví dụ: anchor - neo, suspension - treo). |
| `operator` | string | - | - | unknown | Tên viết tắt của đơn vị vận hành hạ tầng điện lực. |
| `operator:official` | string | - | - | unknown | Tên chính thức của đơn vị vận hành. |
| `operator:wikidata` | string | - | - | unknown | Mã định danh Wikidata của đơn vị vận hành. |
| `name` | string | - | - | unknown | Tên hoặc mã định danh của cột/tháp/trạm. |
| `source` | string | - | - | unknown | Nguồn dữ liệu bản đồ được sử dụng để xác định vị trí (ví dụ: Bing, Mapbox). |
| `triple_tower` | string | - | - | unknown | Cho biết liệu đây có phải là tháp ba pha hay không. Giá trị 'yes' nếu có. (Dữ liệu rất thưa thớt). |
| `line_arrangement` | category | - | - | unknown | Cách bố trí đường dây điện trên cột/tháp (ví dụ: horizontal - ngang). (Dữ liệu rất thưa thớt). |
| `structure` | category | - | - | unknown | Cấu trúc vật lý của cột/tháp (ví dụ: lattice - giàn thép, tubular - ống). |
| `material` | category | - | - | unknown | Vật liệu chính cấu tạo cột/tháp (ví dụ: steel - thép, metal - kim loại). |
| `addr:housenumber` | string | - | - | unknown | Số nhà của địa điểm. (Dữ liệu rất thưa thớt, chỉ xuất hiện ở một số ít điểm). |
| `addr:street` | string | - | - | unknown | Tên đường của địa điểm. (Dữ liệu rất thưa thớt, chỉ xuất hiện ở một số ít điểm). |
| `amenity` | string | - | - | unknown | Loại tiện ích công cộng tại địa điểm. (Dữ liệu rất thưa thớt, có thể là dữ liệu nhiễu). |
| `line_management` | category | - | - | unknown | Kiểu quản lý đường dây tại điểm này (ví dụ: transition - chuyển tiếp, branch - phân nhánh, split - chia tách). |
| `location:transition` | string | - | - | unknown | Cho biết liệu đây có phải là điểm chuyển tiếp đường dây hay không. Giá trị 'yes' nếu có. (Dữ liệu rất thưa thớt). |
| `voltage` | number | - | - | V | Điện áp của đường dây tại vị trí này. (Dữ liệu rất thưa thớt). |
| `ref` | number | - | - | unknown | Mã tham chiếu nội bộ hoặc số hiệu của cột/tháp. |
| `colour` | category | - | - | unknown | Màu sắc của cột/tháp (ví dụ: gray - xám). (Dữ liệu rất thưa thớt). |
| `height` | number | - | - | mét | Chiều cao của cột/tháp. (Dữ liệu rất thưa thớt). |
| `branch:type` | category | - | - | unknown | Loại phân nhánh đường dây (nếu có). (Dữ liệu rất thưa thớt). |
