# Phase 1 — Data Model: Discovery Chat ở quy mô vài nghìn dataset

**Ngày**: 2026-09-03 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Ba thực thể mới, hai thực thể sẵn có được mở rộng. Mọi thứ ở đây là **dữ liệu sinh
ra, tái tạo được từ metadata** — nên nằm ở R2, không commit vào git (G3).

---

## Thực thể mới

### 1. RetrievalIndexEntry — một dataset trong chỉ mục tìm kiếm

Một entry cho mỗi dataset đang sống. Lưu trong một object duy nhất trên R2.

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|---|---|---|---|
| `slug` | string | ✓ | Khoá, khớp `datasets/<slug>/` |
| `vector` | number[] | ✓ | Vector ngữ nghĩa của dataset |
| `text` | string | ✓ | Chính text đã dùng để sinh vector — giữ lại để tái tạo và để soi khi kết quả sai |
| `keywords` | string[] | ✓ | Token đã chuẩn hoá (bỏ dấu, lowercase) từ tên + mô tả + tên cột, cho nhánh khớp từ khoá |
| `source_fingerprint` | string | ✓ | Dấu vết của metadata đã dùng để sinh entry này |
| `built_at` | string (ISO) | ✓ | Thời điểm sinh |

**Quy tắc:**

- `text` ghép từ: tên dataset + mô tả + danh mục + tên các cột. **Không** đưa danh
  sách giá trị cột vào — đó là việc của chỉ mục giá trị (R7), nhồi vào đây làm loãng
  tín hiệu chủ đề
- `source_fingerprint` tồn tại để **phát hiện lệch**: so với metadata hiện hành, khác
  nhau nghĩa là entry đã cũ. Không có trường này thì lệch không có triệu chứng — đúng
  rủi ro mà FR-032/FR-033 nhắm tới
- Dataset ở trạng thái đã xoá **không có** entry (FR-033)

**Vòng đời:** dataset được thêm → sinh entry. Metadata sửa → ghi lại entry. Dataset
xoá → bỏ entry. Không có trạng thái trung gian.

---

### 2. ValueIndexEntry — một giá trị và các dataset chứa nó

Chỉ mục nghịch đảo, lưu trong một object riêng trên R2.

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|---|---|---|---|
| `normalized` | string | ✓ | Khoá — giá trị đã chuẩn hoá (bỏ dấu, lowercase, gom biến thể) |
| `display` | string | ✓ | Cách viết để hiện cho người dùng |
| `variants` | string[] | ✓ | Các cách viết thật gặp trong dữ liệu |
| `datasets` | {slug, column}[] | ✓ | Dataset nào, ở cột nào |

**Quy tắc:**

- Cùng một đối tượng ghi nhiều cách phải gom về **một** entry (FR-057): `Qui Nhơn` và
  `Quy Nhơn` → một entry, `variants` giữ cả hai
- Chỉ dựng từ cột phân loại có **≤200 giá trị** (FR-038). Cột nhiều hơn không vào chỉ
  mục — và năng lực tra giá trị phải nói rõ là chưa đủ, không được trả lời "không có"
- `datasets` giữ cả **tên cột**, không chỉ slug: câu trả lời cần nói được "có trong
  cột Tỉnh, thành phố" chứ không chỉ "có trong dataset này"

---

### 3. ConversationTurn — một lượt trong cuộc trò chuyện

Sống ở phía client, gửi kèm mỗi câu hỏi. **Không lưu ở máy chủ.**

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|---|---|---|---|
| `role` | `"user"` \| `"assistant"` | ✓ | Ai nói |
| `content` | string | ✓ | Nội dung |

**Quy tắc:**

- Ngữ cảnh giữ tới khi người dùng chủ động bắt đầu cuộc mới (FR-062) — nên phía client
  phải giữ qua cả việc tải lại trang
- Chỉ dùng để **hiểu** câu hỏi, không dùng để giới hạn phạm vi tìm kiếm (FR-045)
- Không lưu ở máy chủ: log hội thoại đã có sẵn cơ chế riêng (spec 004 FR-017), thêm
  một chỗ lưu nữa là hai nguồn sự thật

---

## Thực thể sẵn có được mở rộng

### 4. ColumnStats — thống kê một cột *(sửa)*

Đang lưu trong `metadata.yaml`, mục `files[].column_stats`.

| Thay đổi | Trước | Sau |
|---|---|---|
| Số giá trị lưu cho cột phân loại | luôn cắt **12** | lưu **đủ** nếu ≤200 giá trị |
| Dấu hiệu danh sách chưa đủ | không có | **bắt buộc** khi >200 |

**Quy tắc:**

- Cột >200 giá trị **phải** mang dấu hiệu chưa đủ. Thiếu dấu hiệu này thì hệ thống sẽ
  trả lời "không có Đà Nẵng" chỉ vì Đà Nẵng không nằm trong phần được lưu — sai theo
  hướng nguy hiểm nhất, vì người dùng tin là đã tra
- 12 giá trị đang lưu hiện nay **không phải** "12 phổ biến nhất" mà gần như ngẫu nhiên
  (mọi tỉnh xuất hiện đúng 30 lần nên thứ tự sắp xếp vô nghĩa) → dữ liệu cũ phải điền
  lại, không dùng lại được

### 5. IndexEntry — một dataset trong danh mục *(sửa)*

Đang lưu ở `datasets/index.json`.

| Thay đổi | Trước | Sau |
|---|---|---|
| `year_range` | có trường, **trống 495/495** | điền cho dataset có chiều thời gian |

**Quy tắc:**

- Chỉ điền khi dataset **thật sự có** chiều thời gian. Dataset không có thì để trống,
  không suy ra một khoảng giả (FR-048)
- Suy từ cột năm của dữ liệu, không suy từ tiêu đề: tiêu đề ghi "2005-2024" nhưng dữ
  liệu chỉ tới 2013 thì phải theo dữ liệu

---

## Quan hệ

```
Dataset (datasets/<slug>/metadata.yaml + dictionary.md)   ← nguồn sự thật
   │
   ├─ 1:1 ─→ RetrievalIndexEntry      (R2, sinh ra, có source_fingerprint)
   ├─ 1:1 ─→ IndexEntry               (git, có year_range)
   └─ 1:n ─→ ValueIndexEntry          (R2, nghịch đảo: n dataset ↔ n giá trị)

ConversationTurn[]                    (client, không lưu máy chủ)
```

**Một nguồn sự thật duy nhất**: `metadata.yaml` + `dictionary.md` trong git. Mọi thứ
còn lại sinh ra từ đó và **phải dựng lại được** chỉ từ đó. Nếu một chỉ mục chứa thông
tin không suy ra được từ metadata thì ranh giới đã sai.

---

## Quy tắc toàn cục

| # | Quy tắc | Từ |
|---|---|---|
| D1 | Mọi chỉ mục tái tạo được hoàn toàn từ metadata trong git | G3 |
| D2 | Chỉ mục không chứa dữ liệu không có trong metadata | D1 |
| D3 | Entry chỉ mục mang dấu vết nguồn để phát hiện lệch | FR-032, FR-033 |
| D4 | Chuẩn hoá giá trị làm **một lần** lúc dựng chỉ mục, không làm ở từng mặt tiền | FR-057 |
| D5 | Danh sách bị cắt **luôn** mang dấu hiệu chưa đủ | FR-038 |
| D6 | Dataset đã xoá không xuất hiện ở bất kỳ chỉ mục nào | FR-033 |
