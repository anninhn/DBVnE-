# Insight Harness — prototype luồng

Prototype để **hiểu luồng hoạt động** của harness tìm insight + gợi ý đề tài, trước khi làm thật.
**Toàn bộ số liệu là giả lập** — không trích, không dùng cho bài.

Phương pháp đầy đủ: [PHUONG-PHAP.md](PHUONG-PHAP.md).

Mở:

```bash
python3 -m http.server 4322 --directory prototypes/insight-demo
```

rồi vào <http://localhost:4322>. Không build, không dependency.

## Xem gì — 4 tab

1. **Hỏi dữ liệu (AMA)** — luồng chính, giả lập trang `/hoi-du-lieu`:
   hỏi → **Bước 1** tìm theo metadata, trả thẻ dataset có ô chọn → bấm "Phân tích insight" →
   **Bước 2** harness chạy (dòng tiến trình suy ra từ chính vết chạy) → **Bước 3** thẻ kết quả,
   phóng viên gắn nhãn (Đạt / Hiển nhiên / Sai số / Diễn giải quá đà).
   Nếu không tìm thấy dataset → **Bước 1b** gợi ý góc khác: dữ liệu gần đúng · đặt lại câu hỏi · thẻ "cần dữ liệu gì".
2. **Bản tin sáng** — CMS pageview + quét báo chí thị trường (chỉ tít + sapo) → cụm chủ đề →
   tìm dataset → harness tìm góc KHÁC bài đã đăng. Kèm bảng "nóng nhưng kho chưa có dữ liệu",
   cộng dồn số ngày để ưu tiên bổ sung kho.
3. **Xem cách tính** — vết chạy đầy đủ của từng thẻ (AI ⇄ tools → rào chắn → người kiểm).
   Mở từ nút "Xem cách tính →" ở chat hoặc bản tin.
4. **Tổng kết đánh giá** — bảng mà bước B3 sẽ sinh ra, áp ngưỡng ≥ 3 thẻ đạt, phủ ≥ 2/3 chế độ.

## 3 kịch bản chat

| Câu hỏi | Nhánh | Kết cục |
|---|---|---|
| Thu nhập và mức sinh khác nhau thế nào giữa các vùng? | Tìm thấy dataset | Thẻ đạt |
| Tỉnh nào chi cho y tế thấp bất thường so với thu nhập? | Tìm thấy dataset | Rào chắn bắt số không khớp tool |
| Người trẻ có đang rời Hà Nội về quê không? | Không tìm thấy | Gợi ý góc khác → thẻ đạt (dữ liệu gần đúng) hoặc thẻ "cần dữ liệu gì" |

## 7 vết chạy (tab Xem cách tính)

| # | Chế độ | Kết cục | Minh hoạ điều gì |
|---|---|---|---|
| 1 | Chủ động | Đạt | Quan hệ đổi chiều giữa vùng (thu nhập × mức sinh), qua đủ rào chắn |
| 2 | Phóng viên hỏi | Rào chắn loại | AI viết số không khớp tool → validator bằng code bắt được |
| 3 | Bám tin nóng | Người kiểm loại | Đúng số nhưng hiển nhiên → rào chắn code không bắt được |
| 4 | Phóng viên hỏi | Cần dữ liệu | Không có di cư theo tuổi → thẻ "cần dữ liệu gì" |
| 5 | Chủ động | Đạt | Khoảng cách vùng nới rộng, có cảnh báo câu chữ |
| 6 | Bám tin nóng | Cần dữ liệu | Tin nhân sự — kho không có loại dữ liệu này |
| 7 | Góc thay thế | Đạt | Từ câu hỏi không có dữ liệu, đi đường vòng bằng dữ liệu gần đúng |

## File

- `scenarios.js` — vết chạy giả lập (thay bằng log chạy thật ở B3)
- `chat.js` — giả lập AMA: tìm metadata → chọn dataset → harness → thẻ
- `brief.js` — giả lập bản tin sáng
- `charts.js` — biểu đồ SVG tự vẽ
- `app.js` — phát lại từng bước, thẻ kết quả, tổng kết
