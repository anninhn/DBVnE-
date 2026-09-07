# Contract: `lookupValue` — tra một giá trị ra danh sách dataset chứa nó

**Năng lực** | FR-055, FR-035→FR-038, FR-057 | [data-model.md](../data-model.md)

## Mục đích

Trả lời câu "dataset nào có Đà Nẵng" bằng **dữ liệu**, không bằng suy luận. Đây là
năng lực khiến US3 khả thi: câu hỏi có/không được trả lời chắc chắn, kể cả chiều phủ
định.

## Đầu vào

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `value` | string | ✓ | Giá trị cần tra, cách viết nào cũng được |
| `caller` | string | ✓ | Ai gọi, để ghi nhận (FR-059) |

## Đầu ra

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `found` | boolean | Giá trị có trong chỉ mục hay không |
| `display` | string \| null | Cách viết chuẩn để hiện cho người dùng |
| `variants` | string[] | Các cách viết thật gặp trong dữ liệu |
| `datasets` | `{slug, title, column}[]` | **Đầy đủ**, không phải mẫu (FR-036) |
| `partialColumns` | `{slug, column}[]` | Cột có >200 giá trị nên **không vào chỉ mục** — chỗ này chưa kết luận được |

## Hành vi

1. Chuẩn hoá `value` bằng **cùng** hàm đã dùng lúc dựng chỉ mục (D4)
2. Tra chỉ mục nghịch đảo
3. Trả về đầy đủ danh sách dataset, không cắt
4. Kèm `partialColumns` — những chỗ chưa kết luận được
5. Ghi nhận lượt gọi

## Ca biên — phần quan trọng nhất của hợp đồng này

| Tình huống | Hành vi bắt buộc |
|---|---|
| Giá trị không có trong chỉ mục **và** `partialColumns` rỗng | `found: false` — đây là câu **"không có"** đáng tin |
| Giá trị không có trong chỉ mục **nhưng** `partialColumns` không rỗng | `found: false` kèm `partialColumns` — caller MUST nói "không tìm thấy, nhưng có N cột chưa tra hết", **KHÔNG** nói "không có" |
| Giá trị viết khác cách chuẩn (`Qui Nhơn` khi chuẩn là `Quy Nhơn`) | Vẫn tìm ra, `variants` liệt kê cả hai (FR-057) |
| Giá trị xuất hiện ở hàng trăm dataset | Trả **đầy đủ**. Cắt bớt là vi phạm FR-036 — caller tự quyết hiện bao nhiêu |
| Chỉ mục chưa dựng | Lỗi rõ ràng. **Tuyệt đối không** trả `found: false`, vì đó là nói "không có" khi thực ra là "chưa biết" |

Ba dòng cuối là lý do năng lực này tồn tại. Phân biệt **"không có"** với **"chưa tra
hết"** và **"chưa biết"** là toàn bộ giá trị của nó — gộp ba thứ đó lại thành `false`
là tái tạo đúng cái lỗi mà FR-037 muốn chặn.

## Bất biến

- Cùng đầu vào → cùng đầu ra, bất kể mặt tiền nào gọi (FR-056)
- Không gọi model nào — hoàn toàn là tra chỉ mục
- `found: false` **chỉ** được dùng khi thật sự đã tra hết. Mọi trường hợp khác phải
  nói rõ giới hạn
