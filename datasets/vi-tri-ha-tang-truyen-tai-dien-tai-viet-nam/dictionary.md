# Dictionary

| Column | Type | Dec | Group | Unit | Description |
|--------|------|-----|-------|------|-------------|
| `design` | category | - | - | unknown | Kiểu thiết kế của cột điện hoặc tháp truyền tải điện (ví dụ: delta, three-level, asymmetric). |
| `power` | category | - | - | unknown | Loại hạ tầng điện lực tại vị trí này (ví dụ: tower - tháp, pole - cột, transformer - trạm biến áp). |
| `line_attachment` | category | - | - | unknown | Kiểu gắn đường dây điện vào cấu trúc (ví dụ: suspension - treo, anchor - neo). |
| `operator` | string | - | - | unknown | Tên viết tắt của đơn vị vận hành hạ tầng điện lực. |
| `operator:official` | string | - | - | unknown | Tên chính thức của đơn vị vận hành hạ tầng điện lực. |
| `operator:wikidata` | string | - | - | unknown | Mã định danh Wikidata của đơn vị vận hành. |
| `name` | string | - | - | unknown | Tên hoặc mã định danh nội bộ của cột/tháp điện. |
| `source` | string | - | - | unknown | Nguồn dữ liệu được sử dụng để số hóa vị trí này (ví dụ: Bing, Mapbox). |
| `triple_tower` | boolean | - | - | unknown | Cho biết liệu đây có phải là tháp ba pha hay không ('yes'/'no'). |
| `line_arrangement` | category | - | - | unknown | Cách bố trí đường dây điện trên cấu trúc (ví dụ: horizontal - ngang). |
| `structure` | category | - | - | unknown | Kiểu cấu trúc của cột/tháp điện (ví dụ: lattice - giàn, tubular - ống). |
| `material` | category | - | - | unknown | Vật liệu chính của cấu trúc (ví dụ: steel - thép, metal - kim loại). |
| `addr:housenumber` | string | - | - | unknown | Số nhà của địa chỉ liên quan đến vị trí này (nếu có). |
| `addr:street` | string | - | - | unknown | Tên đường của địa chỉ liên quan đến vị trí này (nếu có). |
| `amenity` | category | - | - | unknown | Loại tiện ích công cộng tại vị trí này (nếu có). |
| `line_management` | category | - | - | unknown | Cách quản lý đường dây điện tại điểm này (ví dụ: split - chia tách, transition - chuyển tiếp). |
| `location:transition` | boolean | - | - | unknown | Cho biết liệu đây có phải là vị trí chuyển tiếp đường dây hay không ('yes'/'no'). |
| `voltage` | number | - | - | Volt | Điện áp của đường dây điện đi qua hoặc kết nối tại điểm này. |
| `ref` | string | - | - | unknown | Mã tham chiếu hoặc số hiệu nội bộ của cấu trúc. |
| `colour` | string | - | - | unknown | Màu sắc của cấu trúc. |
| `height` | number | - | - | mét | Chiều cao của cấu trúc cột/tháp điện. |
| `branch:type` | category | - | - | unknown | Loại nhánh của đường dây điện tại điểm này (ví dụ: split - chia tách). |
