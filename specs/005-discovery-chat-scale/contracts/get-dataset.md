# Contract: `getDataset` — lấy toàn bộ thông tin mô tả của một dataset

**Năng lực** | FR-055, FR-038, FR-047, FR-056→FR-058 | [data-model.md](../data-model.md)

## Mục đích

Trả về mọi thứ cần để **trả lời** về một dataset: mô tả, các cột, ý nghĩa, đơn vị,
danh sách giá trị của các chiều phân loại, phạm vi thời gian. Đây là đầu vào cho bước
sinh câu trả lời.

## Đầu vào

| Tham số | Kiểu | Bắt buộc | Mặc định | Ghi chú |
|---|---|---|---|---|
| `slugs` | string[] | ✓ | — | Một hoặc nhiều slug. Nhận nhiều để lấy 20 dataset trong một lượt |
| `includeValues` | boolean | | true | Có kèm danh sách giá trị các chiều phân loại hay không |
| `caller` | string | ✓ | — | Ai gọi, để ghi nhận (FR-059) |

**Ràng buộc:**

- `slugs` rỗng → lỗi
- `slugs` quá 50 phần tử → lỗi. Trên mức đó là dùng sai năng lực: cần nhiều hơn thế
  thì phải lọc trước bằng `searchDatasets`

## Đầu ra

Mỗi dataset trả về:

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `slug` | string | |
| `title`, `description`, `category`, `source` | string | |
| `yearRange` | `{from, to}` \| null | `null` khi dataset không có chiều thời gian — **không** bịa khoảng (FR-048) |
| `rowCount` | number | |
| `columns` | array | Mỗi cột: `name`, `type`, `unit`, `description`, `decimalChar`, `groupChar` |
| `columns[].values` | object \| undefined | Chỉ có với chiều phân loại: `{ list, total, complete }` |
| `columns[].values.complete` | boolean | `false` nghĩa là danh sách **bị cắt** — caller MUST KHÔNG kết luận một giá trị không tồn tại (D5) |
| `notFound` | string[] | Slug không tồn tại hoặc đã xoá |

## Hành vi

1. Đọc metadata + dictionary của từng slug
2. Bỏ dataset đã xoá, đưa slug đó vào `notFound` — **không** báo lỗi cả lượt vì một
   slug hỏng
3. Nếu `includeValues`, kèm danh sách giá trị các chiều phân loại kèm cờ `complete`
4. Ghi nhận lượt gọi

## Ca biên

| Tình huống | Hành vi bắt buộc |
|---|---|
| Một slug không tồn tại, các slug khác ổn | Trả dataset ổn, slug hỏng vào `notFound`. Không đánh sập cả lượt |
| Dataset không có dictionary | `columns: []`, không lỗi |
| Cột phân loại có >200 giá trị | `values.complete: false`, `values.list` là phần được lưu, `values.total` là số thật |
| Dataset không có chiều thời gian | `yearRange: null` |
| Nguồn metadata tạm không truy cập được | Lỗi rõ ràng, không trả dữ liệu một phần như thể đã đủ |

## Bất biến

- Cùng đầu vào → cùng đầu ra, bất kể mặt tiền nào gọi (FR-056)
- Số **giữ nguyên dạng thô** như trong file; `decimalChar`/`groupChar` cho caller biết
  cách đọc. Năng lực này **không** chuyển đổi số — chuyển ở đây thì mỗi mặt tiền nhận
  một dạng khác nhau, đúng cái FR-057 muốn tránh
- `complete: false` là thông tin **bắt buộc dùng**, không phải để trang trí: bỏ qua nó
  là nguồn của câu trả lời "không có Đà Nẵng" sai
