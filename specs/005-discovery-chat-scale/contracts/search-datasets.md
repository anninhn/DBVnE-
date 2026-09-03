# Contract: `searchDatasets` — tìm dataset liên quan tới một câu hỏi

**Năng lực** | FR-055, FR-029→FR-031, FR-056→FR-058 | [data-model.md](../data-model.md)

## Mục đích

Nhận một câu hỏi bằng tiếng Việt tự nhiên, trả về các dataset liên quan nhất, xếp
theo mức liên quan giảm dần. Không trả lời câu hỏi — chỉ chọn.

## Đầu vào

| Tham số | Kiểu | Bắt buộc | Mặc định | Ghi chú |
|---|---|---|---|---|
| `query` | string | ✓ | — | Câu hỏi đã hiểu đầy đủ trong ngữ cảnh. Nếu đến từ cuộc trò chuyện nhiều lượt thì phần viết lại đã xong **trước** khi gọi năng lực này |
| `limit` | number | | 20 | Số dataset tối đa trả về |
| `filters` | object | | — | `category`, `yearFrom`, `yearTo`, `format` — ràng buộc **cứng**, không phải gợi ý |
| `caller` | string | ✓ | — | Ai gọi, để ghi nhận (FR-059) |

**Ràng buộc:**

- `query` rỗng hoặc chỉ khoảng trắng → lỗi, không trả danh sách rỗng (phân biệt "không
  có câu hỏi" với "không tìm thấy gì")
- `limit` > 50 → cắt về 50. Trên mức đó thì kết quả không còn ý nghĩa mà chỉ làm nặng
  lượt trả lời
- `filters` áp **sau** khi tính điểm, **trước** khi cắt `limit` — nếu áp sau khi cắt
  thì lọc theo năm sẽ trả về ít hơn `limit` một cách vô lý

## Đầu ra

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `results` | array | Mỗi phần tử: `slug`, `title`, `score`, `matchedBy` |
| `results[].score` | number | 0–1, đã chuẩn hoá |
| `results[].matchedBy` | `"semantic"` \| `"keyword"` \| `"both"` | Nhánh nào tìm ra — để soi khi kết quả sai |
| `indexBuiltAt` | string (ISO) | Chỉ mục dựng lúc nào — để biết kết quả có cũ không |
| `total` | number | Số dataset khớp trước khi cắt `limit` |

## Hành vi

1. Chuẩn hoá `query` (bỏ dấu, lowercase) — dùng cùng hàm chuẩn hoá với chỉ mục (D4)
2. Chạy **song song** hai nhánh: vector ngữ nghĩa và khớp từ khoá
3. Chuẩn hoá điểm mỗi nhánh về [0,1], cộng có trọng số, gộp trùng
4. Áp `filters` như ràng buộc cứng
5. Cắt `limit`, trả về
6. Ghi nhận lượt gọi kèm `caller`, `query`, số kết quả

**Bắt buộc chạy cả hai nhánh** (FR-030, FR-031): vector bắt được từ đồng nghĩa
("lạm phát" ↔ "Chỉ số giá tiêu dùng"), từ khoá bắt được tên riêng chính xác
("Đà Nẵng", mã ngành). Bỏ một nhánh là mất một loại câu hỏi.

## Ca biên

| Tình huống | Hành vi bắt buộc |
|---|---|
| Không dataset nào đạt ngưỡng liên quan | `results: []`, `total: 0` — **không** hạ ngưỡng để có kết quả cho đẹp |
| Chỉ mục chưa dựng hoặc đọc thất bại | Lỗi rõ ràng, **không** im lặng rơi về danh sách rỗng — rỗng và lỗi là hai chuyện khác nhau |
| Chỉ mục cũ hơn metadata | Vẫn trả kết quả, kèm `indexBuiltAt` để caller biết |
| `query` chỉ có từ dừng ("có không", "thế nào") | `results: []` — không đoán |
| Dataset đã xoá | Không bao giờ xuất hiện (D6) |

## Bất biến

- **Cùng đầu vào → cùng đầu ra**, bất kể mặt tiền nào gọi (FR-056)
- Không đọc gì từ ngữ cảnh cuộc trò chuyện — caller phải viết lại câu hỏi trước
- Không gọi model sinh văn bản. Chỉ gọi model embedding cho câu hỏi
- Thêm mặt tiền mới không đòi sửa hợp đồng này (FR-058)
