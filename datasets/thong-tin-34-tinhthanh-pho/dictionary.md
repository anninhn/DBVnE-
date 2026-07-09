# Dictionary

| Column | Type | Unit | Description |
|--------|------|------|-------------|
| `TinhThanh` | string | - | Tên của tỉnh/thành phố hiện tại được phân tích. |
| `Truocsapnhap` | string | - | Liệt kê các tỉnh/thành phố hiện tại sẽ được sáp nhập để hình thành một đơn vị hành chính mới theo kịch bản đề xuất. Nếu 'Không sáp nhập', tỉnh/thành phố đó không thay đổi. |
| `Trungtamhanhchinhmoi` | string | - | Trung tâm hành chính được đề xuất cho đơn vị hành chính mới sau khi sáp nhập, hoặc trung tâm hành chính hiện tại nếu không sáp nhập. |
| `Danso` | number | người | Tổng dân số của tỉnh/thành phố. |
| `Dientich` | number | km2 | Tổng diện tích tự nhiên của tỉnh/thành phố. |
| `SoDVHCcapxa` | number | đơn vị | Số lượng đơn vị hành chính cấp xã (xã, phường, thị trấn) của tỉnh/thành phố. |
| `GRDP` | number | unknown | Tổng sản phẩm trên địa bàn (GRDP) của tỉnh/thành phố. |
| `Thungansach` | number | unknown | Tổng thu ngân sách nhà nước trên địa bàn của tỉnh/thành phố. |
| `Socangbien` | number | cảng | Số lượng cảng biển trên địa bàn tỉnh/thành phố. |
| `Sosanbay` | number | sân bay | Số lượng sân bay trên địa bàn tỉnh/thành phố. |
| `Sapnhap` | boolean | - | Chỉ thị liệu tỉnh/thành phố có thuộc diện sáp nhập (1) hay không (0) theo kịch bản đề xuất. |
| `ThuhangDanso` | number | - | Thứ hạng của tỉnh/thành phố về dân số so với các tỉnh/thành phố khác trong dataset. |
| `ThuhangDientich` | number | - | Thứ hạng của tỉnh/thành phố về diện tích so với các tỉnh/thành phố khác trong dataset. |
| `ThuhangGRDP` | number | - | Thứ hạng của tỉnh/thành phố về GRDP so với các tỉnh/thành phố khác trong dataset. |
| `ThuhangThungansach` | number | - | Thứ hạng của tỉnh/thành phố về thu ngân sách so với các tỉnh/thành phố khác trong dataset. |
