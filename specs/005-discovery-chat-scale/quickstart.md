# Quickstart — kiểm chứng Discovery Chat ở quy mô vài nghìn dataset

**Ngày**: 2026-09-03 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Tài liệu này để **chứng minh feature chạy đúng**, không phải hướng dẫn cách viết code.
Mỗi kịch bản gắn với success criteria cụ thể trong spec.

## Điều kiện trước

```bash
node --version    # cần 22+
python3 --version # cần 3.13+ cho script xử lý dữ liệu
```

`.env.local` cần có (đã có sẵn từ trước): `GEMINI_API_KEY`, `GITHUB_TOKEN`,
`GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `R2_*`, `AUTH_SECRET`, và
`PLATFORM_USER`/`PLATFORM_PASS` nếu chạy script cần đăng nhập.

Dự án **không có test framework**. Cổng kiểm chứng là `typecheck`, `lint`, bộ đo, và
các kịch bản tay dưới đây (xem `research.md` § R11).

## Cổng tự động

```bash
npm run typecheck
npm run lint
```

Cả hai phải sạch trước khi chạy bộ đo.

---

## Kịch bản 1 — Không nhận con số không kiểm chứng được (US1 → SC-007, SC-013)

Kịch bản quan trọng nhất, vì đây là lỗi **người dùng không tự phát hiện được**.

```bash
npm run eval:chat
```

Bộ đo phải có ít nhất 3 câu dạng tính toán (một câu có gắn dataset). Kiểm trong báo
cáo ở `eval/reports/<ngày>.json`:

| Kiểm | Đạt khi |
|---|---|
| Câu hỏi tính toán trả về con số | **0 câu** |
| Câu hỏi tính toán nêu được dataset + cột + phạm vi + đường dẫn xem trước | 100% |
| Câu từ chối hứa hẹn tính năng chưa có | 0 câu |

Kiểm tay thêm một ca mà bộ đo khó phủ:

1. Mở trang hỏi đáp, **gắn** dataset dân số theo tỉnh
2. Hỏi: *"trung bình mỗi năm tăng bao nhiêu người"*
3. **Kỳ vọng**: không có con số nào trong câu trả lời; có đường dẫn xem trước dữ liệu
4. **Thất bại nếu**: xuất hiện bất kỳ con số nào ngoài năm — kể cả con số đúng, vì nó
   được tính từ dữ liệu không đại diện

---

## Kịch bản 2 — Chi phí không tăng theo số dataset (US2 → SC-001, SC-002)

```bash
# Hỏi một câu, đọc số token trong log dev server
npm run dev
# rồi hỏi qua UI, xem dòng token trong log
```

| Kiểm | Đạt khi |
|---|---|
| Token input mỗi câu hỏi | **≤ 15.000** |
| Lượt gọi GitHub API mỗi câu hỏi | **≤ 30** |

Kiểm phần "không tăng theo số lượng": nhân đôi số entry trong chỉ mục (dựng chỉ mục
trên một bản sao có dataset lặp), hỏi lại **cùng** câu hỏi, so số token. Chênh lệch
phải **dưới 10%**.

Đây là cách duy nhất kiểm được SC-001 mà không phải chờ kho thật lên vài nghìn.

---

## Kịch bản 3 — Trang danh mục không bị ảnh hưởng (US2 → SC-003)

1. Mở trang danh mục ở một tab
2. Ở tab khác, hỏi liên tiếp 10 câu, không nghỉ
3. Trong lúc đó tải lại trang danh mục vài lần

**Kỳ vọng**: trang danh mục luôn tải bình thường. **Thất bại nếu** nó lỗi hoặc chậm
bất thường — nghĩa là hạn mức nhà cung cấp đang bị chia sẻ tới mức xung đột.

---

## Kịch bản 4 — Câu hỏi theo giá trị, cả hai chiều (US3 → SC-008)

Dùng dataset khí hậu chỉ có 17 trạm quan trắc — có Đà Nẵng, **không có** Cần Thơ.

| Hỏi | Kỳ vọng |
|---|---|
| "có dữ liệu nhiệt độ Đà Nẵng không" | **Có**, kèm tên dataset và tên cột |
| "có dữ liệu nhiệt độ Cần Thơ không" | **Không có** — nói thẳng |
| "có dữ liệu nhiệt độ Qui Nhơn không" | **Có** (dữ liệu ghi cả `Qui Nhơn` và `Quy Nhơn`) |

Chiều phủ định là chiều khó. **Thất bại nếu** câu Cần Thơ nhận được câu trả lời mơ hồ
kiểu "dataset này có dữ liệu theo tỉnh nên có thể có Cần Thơ" — đó chính là suy luận
từ tên cột mà US3 tồn tại để loại bỏ.

Thêm một ca cho danh sách bị cắt: chọn một dataset có cột >200 giá trị, hỏi về một giá
trị không nằm trong phần được lưu. **Kỳ vọng**: nói rõ là chưa tra hết, **không** nói
"không có".

---

## Kịch bản 5 — Cuộc trò chuyện nhiều lượt (US4 → SC-010)

```
Lượt 1: "có dữ liệu về chỉ số giá tiêu dùng không"
Lượt 2: "còn năm 2023 thì sao"                      → phải hiểu là CPI năm 2023
Lượt 3: "so với xuất khẩu thì thế nào"              → phải tìm dataset XUẤT KHẨU
```

Lượt 3 là phép thử thật: nó phải **thoát khỏi** nhóm dataset CPI của hai lượt trước
(FR-045). **Thất bại nếu** hệ thống trả lời "không có dữ liệu xuất khẩu" — nghĩa là
ngữ cảnh đang bị dùng để giới hạn phạm vi thay vì để hiểu câu hỏi.

Kiểm thêm ranh giới cuộc trò chuyện:

1. Tải lại trang giữa lượt 2 và 3 → ngữ cảnh **vẫn còn** (FR-062)
2. Bấm "Trò chuyện mới" rồi hỏi "còn năm 2023 thì sao" → hệ thống **không** hiểu
   "còn" là gì, vì đã là cuộc mới

---

## Kịch bản 6 — Chỉ mục theo kịp thay đổi (SC-009, FR-032, FR-033)

Đây là rủi ro **im lặng** nặng nhất của cả đợt.

```bash
# 1. Upload một dataset test
node --env-file=.env.local tools/bulk-upload-nso.mjs --dir <thư-mục-test> --apply --limit 1
```

| Bước | Kỳ vọng |
|---|---|
| Hỏi về dataset vừa upload | Tìm được, **trong vòng 5 phút** |
| Sửa tiêu đề dataset qua form Edit, hỏi lại | Nêu tiêu đề **mới**, không nêu tiêu đề cũ |
| Xoá hẳn dataset, hỏi lại | **Không** còn được nêu |

Kiểm cơ chế phát hiện lệch:

```bash
node --env-file=.env.local tools/build-retrieval-index.mjs
```

Chạy không có `--apply` phải **báo ra danh sách entry lệch** (dấu vết nguồn khác
metadata hiện hành) trước khi sửa gì. Nếu nó báo "không có gì lệch" trong khi bạn vừa
sửa metadata bằng tay thì cơ chế phát hiện đang không hoạt động — và đó là lỗi nghiêm
trọng hơn cả việc lệch, vì nó làm mất khả năng biết mình đang lệch.

---

## Kịch bản 7 — Phạm vi thời gian (US5 → SC-011)

```bash
node --env-file=.env.local tools/build-retrieval-index.mjs --apply
```

| Kiểm | Đạt khi |
|---|---|
| Dataset dạng bảng có phạm vi thời gian | **≥ 90%** |
| Dataset không có chiều thời gian | **không** hiện phạm vi giả |
| Lọc theo khoảng thời gian | chỉ trả dataset phủ khoảng đó |

Ca đáng kiểm riêng: dataset mà **tiêu đề ghi một khoảng nhưng dữ liệu ngắn hơn** — ví
dụ tiêu đề "2005-2024" mà chỉ tiêu thứ hai dừng ở 2016. Phạm vi phải theo **dữ liệu**,
không theo tiêu đề.

---

## Kịch bản 8 — Hạn mức (FR-054, FR-061)

Tạm hạ hạn mức xuống mức nhỏ để kiểm mà không phải hỏi 500 câu:

| Kiểm | Kỳ vọng |
|---|---|
| Hết hạn mức **cá nhân** | Thông báo nói rõ là hạn mức của bạn, gợi ý chờ |
| Hết hạn mức **hệ thống** | Thông báo **khác**, gợi ý báo người phụ trách |

Hai thông báo giống nhau là thất bại: người dùng không biết nên chờ hay đi báo.

---

## Kịch bản 9 — Chất lượng tìm kiếm (US6 → SC-004, SC-005, SC-006)

```bash
npm run eval:chat
```

Bộ đo phải có **≥25 câu**, mỗi câu ghi rõ danh sách dataset đúng.

| Chỉ số | Ngưỡng | Mốc hiện tại |
|---|---|---|
| `success_rate` | ≥ 87,5% | 87,5% |
| tỷ lệ nêu đúng (precision) | ≥ 95% | **chưa có** |
| tỷ lệ tìm được (recall) | **≥ 70%** | **chưa có** |

**Không có mốc chất lượng tìm kiếm nào tồn tại**, dù báo cáo cũ có in ra hai con số
100% và 42,9%. Cả 8 câu trong gold set cũ để `expected_dataset_slugs` rỗng, mà với
danh sách rỗng thì:

- công thức cho `accuracy = 1` **luôn luôn** → con số 100% không mang thông tin gì
- công thức cho `recall = 1` khi câu trả lời **không nêu dataset nào** → con số 42,9%
  thực chất là "3 trên 7 câu trả lời rằng không có dataset phù hợp"

Thêm nữa, hai chỉ số trong code **bị đặt tên đảo**: field `accuracy` tính theo công
thức recall, field `recall` tính theo công thức precision (`scripts/eval-chat.mjs`
dòng 228 và 232). Sửa tên là việc của T010.

Vì vậy phải chạy bộ đo **sau khi curate 25 câu có đáp án** nhưng **trước khi sửa code
xử lý** — đó mới là mốc thật (T013).

---

## Thứ tự chạy khi kiểm toàn bộ

```
typecheck + lint
   ↓
Kịch bản 9 trên code CHƯA sửa   → lấy mốc thật
   ↓
Kịch bản 1  (US1 — chặn con số bịa, ship trước tất cả)
   ↓
Kịch bản 7  (US5 — phạm vi thời gian, độc lập)
Kịch bản 4  (US3 — giá trị cột, độc lập)
   ↓
Kịch bản 2, 3, 6, 9  (US2 + US6 — tầng tra cứu)
   ↓
Kịch bản 5  (US4 — cuộc trò chuyện)
   ↓
Kịch bản 8  (hạn mức, sau khi chi phí đã giảm)
```
