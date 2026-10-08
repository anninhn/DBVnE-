# Thiết kế harness insight v6 — định tuyến: luồng chuẩn + khám phá, pilot từng bậc

> Trạng thái: **đã duyệt hướng** (Ninh, 2026-10-08). Thay phần kiến trúc điều phối của
> `PHUONG-PHAP.md` (v5). Những phần v5 vẫn giữ nguyên giá trị được ghi rõ ở mục 9.
>
> Cách đọc: mục 1–3 là **vì sao**, mục 4–7 là **cái gì**, mục 8 là **làm theo thứ tự nào**.

---

## 1. Bối cảnh: những gì đã đo khi chạy lát 1 (2026-10-08)

Lát 1 là một **vòng lặp agent**: GLM 5.3 (qua Claude Code headless) tự quyết gọi tool nào,
code chỉ phục vụ. Chạy thật trên câu "thu nhập × mức sinh giữa các tỉnh":

| Đo được | Giá trị | Ghi chú |
|---|---|---|
| Bước đề xuất chỉ tiêu | ~20–25 giây | `find_measures` mở 12 dataset cho mỗi khái niệm |
| Bước phân tích | 52–74 giây, **8 lượt gọi model** | describe ×2 → plan → check ×2 → detector → submit (bị trả lại) → submit |
| Khởi động `claude -p` | 2–8 giây mỗi lần | Mỗi bước một tiến trình mới |
| Token một lần phân tích | ~33 nghìn vào (25 nghìn từ cache), ~2,6 nghìn ra | Kết quả `describe_dataset` dài |
| Thẻ bị rào chắn trả lại | 1–2 lần mỗi phiên | Thiếu trường `kind`; số "0" không có trong kết quả |

Những lỗi chất lượng đã gặp thật:

| Lỗi | Ví dụ | Lớp gây lỗi |
|---|---|---|
| Bỏ sót dataset đúng | "Tổng tỷ suất sinh" hạng 2 theo ngữ nghĩa, **hạng 55** sau khi trộn | Trộn điểm tìm kiếm (đã sửa bằng RRF) |
| Chọn dataset sai nghĩa | Gemini chọn "Chênh lệch thu nhập giữa các nhóm" (không có mức chung) | Để model chọn cả dataset |
| So chữ sai nghĩa | "tử vong trẻ sơ sinh" → "đăng ký khai sinh"; "di cư" → không ra gì | So chữ không hiểu đồng nghĩa, bỏ từ 2 chữ cái |
| Nhận định mô tả sai | "ĐBSCL sinh thấp nhất nước" (sai — Đông Nam Bộ thấp nhất) | Không có tool trả thứ hạng; rào chắn không kiểm câu so sánh nhất |
| Văn bản nói quá | "Mức tin cậy cao ở ĐBSCL" khi ĐBSCL không có quan hệ | Văn bản trả lời không qua rào chắn |
| Thẻ khó hiểu | r, p, độ dốc −0,000197, "nhóm con" | Thẻ hiển thị thống kê thô |

**Kết luận:** phần lớn các bước của lát 1 là **tất định** — code tự làm được — nhưng đang
bắt model quyết, nên chậm và dễ sai. Model chỉ thật sự cần ở vài điểm.

---

## 2. Nguyên tắc (theo các bài kỹ thuật Anthropic đã công bố)

Đây là **cách áp** các nguyên tắc vào bài toán này, không phải thiết kế Anthropic công bố cho nó.

| Nguyên tắc | Nguồn | Áp vào harness |
|---|---|---|
| Phân biệt *workflow* (nhánh code định sẵn) và *agent* (LLM tự điều khiển); bắt đầu từ cái đơn giản nhất, chỉ thêm phức tạp khi cần | Building effective agents ✅ | Câu hỏi có cấu trúc → workflow. Câu hỏi mở → agent. Làm workflow trước |
| Mẫu: chuỗi prompt, định tuyến, chạy song song, điều phối–thợ, đánh giá–tối ưu | Building effective agents ✅ | Định tuyến + chuỗi prompt + chạy song song |
| Thiết kế tool kỹ như prompt; **poka-yoke** — đổi tham số để khó dùng sai | Building effective agents ✅ | Số do code chèn → lỗi sai số không thể xảy ra |
| Kiểm tra tốt nhất là **luật rõ ràng**; LLM làm giám khảo "không chắc chắn lắm" | Claude Agent SDK ✅ | Rào chắn bằng code; "hiển nhiên" để phóng viên gắn nhãn |
| Code "chính xác, ghép được, dùng lại vô hạn" | Claude Agent SDK ✅ | Chế độ khám phá: agent viết code trên API đã kiểm định |
| Bộ test đại diện lấy từ cách người dùng thật dùng | Claude Agent SDK ✅ | Log phiên + nhãn phóng viên → ca kiểm tra |
| Tool là hợp đồng giữa hệ tất định và không tất định; ít tool, có ý nghĩa; cho Claude Code đọc log để sửa tool | Writing tools for agents 🔎 | Gộp 8 tool nhỏ thành 3–4 tool lớn |
| Ngữ cảnh là ngân sách có hạn; ít tool không chồng chéo; nén lịch sử | Context engineering 🔎 | Kết quả tool gọn; nén tóm tắt phiên |
| Agent viết code gọi tool, dữ liệu trung gian ở sandbox | Code execution with MCP 🔎 | Chế độ khám phá |

✅ = đã mở bài gốc · 🔎 = qua tóm tắt / kết quả tìm kiếm

---

## 3. Ba phương án đã cân nhắc

| | A · Lát 1 hiện tại | B · v6 pipeline | **C · Định tuyến (đã chọn)** |
|---|---|---|---|
| Kiểu | Agent, vòng gọi tool | Workflow, AI ở 3 điểm | Định tuyến: workflow + agent khám phá |
| Tool | 8 tool nhỏ | Pipeline gọi hàm trực tiếp | 3–4 tool lớn + API cho code |
| Lượt gọi model / câu | ~11 + 2 lần khởi động | 3 | 3 (luồng chuẩn); tuỳ (khám phá) |
| Câu hỏi ngoài thư viện họ | AI tự xoay xở, không kiểm soát | Không làm được | Agent ghép hàm đã kiểm |
| Lỗi số | Bắt sau, nộp lại | Không thể xảy ra | Không thể xảy ra |
| Cải tiến | Theo cảm nhận | Theo cảm nhận | Từ log thật + nhãn phóng viên |
| Độ phức tạp | Trung bình | Thấp | Cao nhất — nên làm **từng bậc** |

**Chọn C, làm từng bậc** (mục 8): bậc đầu chính là B; chế độ khám phá chỉ thêm khi log cho
thấy cần.

---

## 4. Kiến trúc tổng thể

```
Phóng viên hỏi
   ↓
[AI] Định tuyến + hiểu câu hỏi ─────────────────────────────┐
   │ câu có cấu trúc                                         │ câu mở
   ↓                                                         ↓
LUỒNG CHUẨN (workflow)                              KHÁM PHÁ (agent, bậc sau)
 [code] Danh mục chỉ tiêu → ứng viên + dữ kiện       agent viết code ghép các hàm
 [AI]   Chọn chỉ tiêu đúng nghĩa → chip cho PV sửa   đã kiểm định, trong sandbox
 [code] Chạy MỌI bộ dò phù hợp, song song            kết quả có result_id
 [code] Xếp hạng phát hiện
   ↓                                                         ↓
[code] Rào chắn bằng luật (BH theo phiên, lặp lại, so sánh nhất, câu chữ)
   ↓
[AI] Viết lời — văn có chỗ trống, CODE điền số
   ↓
Thẻ góc bài xếp hạng ──→ phóng viên gắn nhãn
   ↓
[vòng cải tiến] log phiên + nhãn → ca kiểm tra → Claude Code đọc log, đề xuất sửa tool
```

Model vẫn là GLM 5.3 qua Claude Code headless, chạy local (quyết định v4–v5 giữ nguyên).

---

## 5. Thành phần — luồng chuẩn

### 5.1 Định tuyến + hiểu câu hỏi (AI, 1 lần)

Đầu ra là JSON có cấu trúc, không phải văn:

```json
{
  "luong": "chuan | kham_pha | hoi_lai",
  "khai_niem": ["thu nhập", "mức sinh"],
  "cap": "province",
  "nam": { "tu": null, "den": null, "uu_tien_moi_nhat": true },
  "danh_muc_tinh": "63 | 34 | khong_ro",
  "ho_goi_y": ["quan_he_theo_vung"],
  "hoi_lai": null
}
```

- `hoi_lai` có giá trị khi câu hỏi mơ hồ (tên tỉnh giữ nguyên nhưng ranh giới đổi sau sáp
  nhập; không rõ cấp địa lý) → hỏi phóng viên, chưa chạy.
- **Câu hỏi tiếp** cũng đi qua bước này và được dịch thành **thao tác** trên pipeline:
  `doi_danh_muc(34)`, `bo_nam_so_bo`, `them_kiem_soat(chỉ tiêu)`, `xem_ngoai_le`,
  `doi_nam(2018)`. Pipeline chạy lại, không cần agent.
- Câu không dịch được thành thao tác nào → `luong = kham_pha` (hoặc, trước khi có khám phá:
  nói rõ chưa làm được + gợi ý thao tác gần nhất).

### 5.2 Danh mục chỉ tiêu (code, dựng sẵn)

**Xem lại quyết định v5 "không dựng kho"** — danh mục này **chỉ chứa thông tin về cột đo,
không chép dữ liệu**; dữ liệu vẫn đọc tại chỗ khi phân tích.

Mỗi dòng của danh mục = một cột đo (× tổ hợp chiều có giá trị "Tổng số"):
`slug, tên cột, đơn vị, cấp địa lý, số tỉnh, danh mục 63/34, năm có số, nhóm con?, cộng được?, vector`.

- Đo 2026-10-08: ~7.000 chuỗi cấp tỉnh, ~29.000 chuỗi tổng (tính theo tổ hợp chiều thực có).
- Tìm **thẳng ở cấp cột đo** (vector + từ khoá, trộn RRF) — giải quyết cả hai lỗi: `find_measures`
  phải mở 12 dataset, và tìm ở cấp dataset làm lỡ dataset đúng.
- Cập nhật khi upload / sửa / xoá dataset, cùng mẫu `syncDatasetIndexes(slug)`.
- **Phương án dự phòng nếu chưa muốn dựng:** giữ cách hiện tại (`listCandidates` mở dataset)
  + cache kết quả trên đĩa. Chậm hơn ở lần đầu, không thêm thứ phải duy trì.

### 5.3 Chọn chỉ tiêu đúng nghĩa (AI, 1 lần) + chip cho phóng viên

- AI nhận danh sách ứng viên (đã có dữ kiện), trả về **id các chỉ tiêu đúng nghĩa** cho từng
  khái niệm. Code xếp hạng theo luật cấu trúc (đã có trong `measures.ts::rankSelected`):
  dùng được → số chung trước nhóm con → tổ hợp có ≥ 2 năm chung, cùng danh mục tỉnh.
- Giao diện hiện **chip** cho mỗi khái niệm (chỉ tiêu đề xuất · số tỉnh · năm), bấm để đổi
  sang phương án khác; "không dùng" kèm lý do nằm trong menu của chip.
- **Phân tích tự chạy ngay** với đề xuất (chưa chốt — mục 10). Đổi chip → chạy lại; phần tính
  là code nên mất vài giây.

### 5.4 Thư viện họ giả thuyết (code, chạy song song)

Code lọc các họ chạy được với **hình dạng dữ liệu** đã chọn, chạy **tất cả**, không để AI đoán.

| Hình dạng dữ liệu | Họ | Trạng thái 2026-10-08 |
|---|---|---|
| Một chỉ tiêu theo thời gian | Thay đổi, xu hướng, điểm gãy | ✓ `trend_break` |
| | Kỷ lục, "lần đầu kể từ", chuỗi liên tiếp | một phần |
| | Mùa vụ (số liệu tháng) | mới |
| Một chỉ tiêu, nhiều tỉnh, một năm | Xếp hạng, nổi bật (đầu / cuối) | mới |
| | Ngoại lệ | mới |
| | Chênh lệch, độ đồng đều | mới |
| | Quy mô, tỷ trọng | mới |
| Hai chỉ tiêu | Quan hệ theo vùng | ✓ `region_reversal` |
| | Quan hệ có kiểm soát biến thứ ba | mới |
| Thiếu dữ liệu | Thẻ "cần dữ liệu gì" | ✓ |

Bộ phân loại dựa trên hội tụ giữa Bradshaw (7 angles) và QuickInsights / Calliope / FactWatcher
— xem `docs/lit-review-ho-gia-thuyet-bao-chi-du-lieu.md`.

**Mỗi họ theo cùng một khuôn bốn phần** — thêm họ mới không phải sửa luồng:

1. **Đầu vào:** hình dạng dữ liệu nhận (một chuỗi / một lát cắt tỉnh / hai chỉ tiêu…).
2. **Phép tính + kiểm ý nghĩa:** theo cách QuickInsights làm cho từng loại insight; hoán vị
   khi mẫu nhỏ; mỗi phép thử cộng vào bộ đếm phiên.
3. **Ngưỡng "đáng viết":** khi nào là phát hiện (vd quan hệ rõ: ≥ 8 tỉnh, |r| ≥ 0,3, p ≤ 0,1).
4. **Mẫu câu diễn giải:** câu tiếng Việt thường sinh từ kết quả, có chỗ trống cho số
   (vd `{r}` → "quan hệ ngược chiều mức vừa"). Bảng dịch: |r| < 0,3 yếu · 0,3–0,6 vừa ·
   ≥ 0,6 chặt; p ≤ 0,05 "khó do ngẫu nhiên"; p > 0,1 "có thể do ngẫu nhiên".

### 5.5 Xếp hạng phát hiện (code)

Từ mọi kết quả của các họ, giữ **phát hiện** (vượt ngưỡng đáng viết) và xếp theo:

1. Qua rào chắn thống kê (BH theo phiên).
2. Lặp lại theo thời gian.
3. Độ mạnh hiệu ứng.
4. Không thuộc danh sách hiển nhiên (vd hai chỉ tiêu cùng họ, quan hệ theo định nghĩa —
   tương tự "Easily Inferable Insights" của QuickInsights).
5. Có năm gần đây.

Trả tối đa 3 phát hiện; phần còn lại vào "Xem cách tính".

### 5.6 Viết lời (AI, 1 lần) — số do code chèn

- AI nhận **các phát hiện đã xếp hạng** (đã có câu diễn giải từ mẫu) và viết tít + đoạn ngắn,
  **dùng chỗ trống** `{f1.r_dbsh}` thay vì chép số.
- Code điền số, rồi kiểm: không còn số nào trong văn mà không đến từ chỗ trống; không có từ
  nhân quả; không nói về cá nhân khi dữ liệu cấp tỉnh; mọi câu so sánh nhất ("cao nhất",
  "thấp nhất") phải trích một kết quả xếp hạng.
- Áp cho **cả thẻ lẫn văn bản trả lời** — đóng lỗ hổng "văn bản không qua rào chắn".
- Không còn vòng nộp lại thẻ vì sai số.

### 5.7 Rào chắn bằng luật (code)

| Luật | Trạng thái |
|---|---|
| Số chỉ đến từ chỗ trống do code điền | mới (thay "khớp số" của lát 1) |
| Nguồn là dataset đã dùng | ✓ |
| Kiểm độ phủ: mọi khái niệm có chỉ tiêu | ✓ (`plan_analysis`) — chuyển thành bước của pipeline |
| BH trên mọi phép thử từ đầu phiên | mới |
| Lặp lại theo thời gian cho thẻ quan hệ | ✓ (`windows_agree`) |
| Câu so sánh nhất phải có kết quả xếp hạng | mới |
| Câu chữ: không nhân quả, không nói về cá nhân | mới |
| Nói rõ danh mục 63 / 34 | ✓ (prompt) → chuyển thành luật |

### 5.8 Giao diện

Đã duyệt bản phác (2026-10-08):

- Một ô hỏi. Tiến trình gộp 3 dòng ("Hiểu câu hỏi · Chọn chỉ tiêu · N phép phân tích ·
  M phát hiện"), không liệt kê từng tool.
- Chip chỉ tiêu sửa được ngay dưới câu hỏi.
- Thẻ: nhãn họ + danh mục tỉnh + năm · tít · đoạn diễn giải tiếng Việt thường · biểu đồ (vd
  r theo vùng, cột lệch hai phía; vùng dưới 8 tỉnh tô nhạt) · huy hiệu độ tin cậy có lý do
  ("✓ lặp lại năm 2018", "⚠ 2024 là số sơ bộ") · "Nên kiểm thêm" · nút Xem cách tính / Chép
  kèm nguồn / Đạt / Hiển nhiên / Sai.
- Gợi ý hỏi tiếp = các thao tác pipeline làm được (34 tỉnh, bỏ năm sơ bộ, ngoại lệ, kiểm soát).

### 5.9 Hiệu năng

- 3 lượt gọi model ngắn thay vì ~11; phần tính gần như tức thời.
- ~~Giữ một tiến trình Claude Code sống suốt phiên~~ — **bỏ sau bậc 0**: khởi động chỉ ~1 giây,
  không nhanh hơn rõ rệt (mục 13).
- Danh mục chỉ tiêu dựng sẵn → bỏ bước mở 12 dataset / khái niệm.
- Stream từng phần: chip hiện trước, thẻ hiện sau.
- **Mục tiêu: thẻ đầu tiên sau ~15 giây** (hiện 75–100 giây). Đây là **ước tính, chưa đo** —
  bậc 0 đo trước khi cam kết.

---

## 6. Thành phần — chế độ khám phá (bậc sau)

Cho câu hỏi mở mà luồng chuẩn không dịch được thành họ / thao tác nào.

- Agent (GLM qua Claude Code) **viết code** ghép các hàm đã kiểm định của thư viện:
  `slice`, các bộ dò, `rank`, `outliers`, `join_by_province`… Không có hàm tự tính tự do trên
  dữ liệu thô ngoài API.
- Code chạy trong **sandbox**; dữ liệu trung gian ở lại sandbox, chỉ kết quả có `result_id`
  đi ra (theo "Code execution with MCP").
- Mọi phép thử cộng vào bộ đếm phiên; đầu ra đi qua đúng rào chắn và bước viết lời của luồng chuẩn.
- **Điều kiện bật:** log cho thấy phóng viên hay hỏi câu luồng chuẩn không làm được.
- **Cần đo trước:** GLM viết code đúng API đến đâu; cách dựng sandbox an toàn trên máy local.

---

## 7. Vòng cải tiến từ log

- Mỗi phiên đã được log (`data/insight/sessions/`). Thêm vào log: phát hiện được hiển thị,
  nhãn phóng viên gắn (Đạt / Hiển nhiên / Sai), chip phóng viên đã đổi.
- **Ca kiểm tra tự sinh từ log**, không soạn tay (đúng quyết định trước đó: không làm bộ đánh
  giá soạn sẵn):
  - Chip bị phóng viên đổi → ca kiểm tra cho bước chọn chỉ tiêu.
  - Thẻ bị gắn "Sai" / "Hiển nhiên" → ca kiểm tra cho họ / luật xếp hạng / danh sách hiển nhiên.
- Định kỳ cho **Claude Code đọc log** và đề xuất sửa tool, ngưỡng, mẫu câu (theo
  "Writing tools for agents").
- Đã có sẵn: `src/lib/insight/cases.ts` + `GET /api/insight/selfcheck` (4 ca từ lỗi thật).

---

## 8. Lộ trình pilot từng bậc

Mỗi bậc **dùng được độc lập**; chỉ sang bậc sau khi có lý do từ bậc trước.

| Bậc | Nội dung | Xong khi | Điều kiện sang bậc sau |
|---|---|---|---|
| **0 · Đo** ✅ 2026-10-09 | Đo một lượt gọi GLM ngắn khi giữ tiến trình Claude Code sống (`--input-format stream-json`); đo thời gian dựng danh mục chỉ tiêu | Có số thật cho mục tiêu 15 giây | Luôn sang bậc 1; số đo quyết định có dùng tiến trình sống không |
| **1 · Luồng chuẩn** ✅ 2026-10-09 (mục 16) | Định tuyến + hiểu câu hỏi (**gọi hai lần song song + luật hậu kiểm**, mục 15); danh mục chỉ tiêu dựng sẵn — **lộ đúng điều quyết định** (nhóm con, năm thật có số, 63/34); **module luật dùng chung** sinh prompt + bộ kiểm; **thang xác minh dùng chung**; chip; chạy song song 2 họ đang có; xếp hạng; viết lời có chỗ trống; rào chắn mới (BH, so sánh nhất, câu chữ); UI mới | Câu "thu nhập × mức sinh" ra thẻ dễ hiểu, không vòng nộp lại, đo được thời gian | Phóng viên dùng thử thấy luồng ổn |
| **2 · Mở rộng thư viện họ** | Thêm theo thứ tự: xếp hạng & ngoại lệ → chênh lệch → quy mô/tỷ trọng → kỷ lục đầy đủ → kiểm soát biến thứ ba → mùa vụ. **Hợp đồng cho danh sách** (chỉ tiêu sinh bằng đếm / gộp) + **bảng địa lý cấp xã** và luật "địa lý phải khớp tham chiếu" (mục 15) | Mỗi họ có đủ khuôn bốn phần + ca kiểm tra; ít nhất 1 danh sách (vd điểm ngập) vào danh mục | Song song với nghiên cứu họ giả thuyết |
| **2b · Đọc file không đồng nhất** | Đưa cách đọc (mô tả JSON + bộ thực thi + bản mô tả file + thang xác minh) từ `bench/` vào thư viện dùng chung; thêm thao tác **xoay năm-thành-cột → dòng**, header nhiều tầng, hai bảng cạnh nhau; lưu cách đọc đã xác minh; dùng trước tiên qua skill chuẩn hoá chạy local | 4 file XLSX có cách đọc đã xác minh và chỉ tiêu vào danh mục | Có thể làm song song bậc 2 |
| **3 · Vòng cải tiến** | Log nhãn + chip đổi; ca kiểm tra tự sinh; quy trình cho Claude Code đọc log | Có ca kiểm tra đầu tiên sinh từ log | Bật ngay khi có phóng viên dùng thử |
| **2c · Hồ sơ ngữ nghĩa** (mục 17 — làm TRƯỚC bậc 2) | Schema hồ sơ (hình dạng, chủ thể + bảng tham chiếu, nhịp thời gian, loại số đo, cộng được, mẫu số, chuẩn đo); AI đề xuất + code kiểm bằng dữ liệu; viết lại 2 họ theo hình dạng + điều kiện cần; phạm vi trả lời suy từ điều kiện | Hồ sơ đã xác minh cho một bộ đa dạng (NSO, 4 XLSX, GeoJSON, danh sách); 2 họ chạy trên ≥ 2 loại chủ thể | Bộ đánh giá chống overfit (mục 17.5) qua |
| **4 · Khám phá** | Agent viết code trên API, sandbox | GLM viết code đúng API trên vài câu mở thật | ~~Chỉ làm khi log cho thấy cần~~ → **kéo lên sau 2c** (mục 17.3 D): làn bao phủ cho dữ liệu không đồng nhất |
| *Sau* | Remote MCP cho client của phóng viên (tool lớn `analyze(question)`); deploy | — | Chưa quyết |

**Song song (không chặn):** cấu phần nghiên cứu họ giả thuyết — gắn nhãn mẫu bài báo dữ liệu
VnExpress để ưu tiên các họ và tìm họ đặc thù Việt Nam (lit review mục 6).

---

## 9. Giữ nguyên từ v5

- Phóng viên dẫn dắt; không có agent tự quét kho.
- Chạy local; GLM 5.3 qua Claude Code headless; app không gọi endpoint Coding bằng SDK.
- Đọc tại chỗ bằng bộ đọc của platform (`getDatasetBySlug`, `getObject`, `parseCSV`,
  `parseNumberWithSchema`); bảng chuẩn hoá địa lý 63/34 + bí danh (`geo.ts`).
- Xử lý 63 / 34 tỉnh: nhận diện ý định, gộp chỉ tiêu cộng được, cảnh báo khi không gộp được.
- File điểm thi 450 MB: đọc theo luồng, gộp tỉnh × năm × môn, cache.
- Không đặt trần token / lượt; chỉ chống kẹt vòng.
- Trạng thái phiên lưu ra đĩa; `session_id` dùng chung với phiên Claude Code.
- Sửa tìm kiếm Discovery: RRF (từ khoá 0,3) + dự phòng chỉ từ khoá; Discovery `temperature 0`
  và `reason` phải nói dataset đo gì.

---

## 10. Quyết định

**Đã chốt (2026-10-08):**
- Hướng C: định tuyến giữa luồng chuẩn và khám phá, làm từng bậc theo mục 8.
- Bản phác giao diện kết quả (chip + thẻ có diễn giải + biểu đồ + huy hiệu + hỏi tiếp).

**Còn mở — chốt khi bắt đầu bậc 1:**
1. Danh mục chỉ tiêu **dựng sẵn** (mục 5.2), hay phương án dự phòng (mở dataset + cache)? — *Bậc 0 đề xuất dựng sẵn: 1,5 giây, 33 lượt embedding (mục 13.3).*
2. Phân tích **tự chạy ngay** với chỉ tiêu đề xuất, hay chờ phóng viên xác nhận?

---

## 11. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Thư viện họ hẹp → nhiều câu không trả lời được | Báo rõ + gợi ý thao tác gần nhất; log để ưu tiên họ mới; bậc 4 khi cần |
| Luật xếp hạng / danh sách hiển nhiên sai → thẻ đúng số nhưng vô vị | Nhãn "Hiển nhiên" từ phóng viên → ca kiểm tra → chỉnh luật |
| Mục tiêu 15 giây không đạt | Bậc 0 đo trước; stream từng phần để thấy kết quả sớm |
| Danh mục chỉ tiêu lệch với dataset sau khi sửa | Cập nhật theo slug ở hook upload/sửa/xoá; selfcheck so ngẫu nhiên vài slug |
| Vùng xám điều khoản khi tự động hoá Claude Code bằng gói subscription | Chỉ một người dùng (Ninh), chạy local; xem lại khi deploy |
| GLM viết code kém (bậc 4) | Đo trước khi bật; API hẹp, rõ, có ví dụ |

---

## 12. Nguồn

- Anthropic — [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) ✅
- Anthropic — [Building agents with the Claude Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) ✅
- Anthropic — [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) 🔎 (đường dẫn chưa xác nhận)
- Anthropic — [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) 🔎
- Anthropic — [Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) 🔎
- Lit review họ giả thuyết: `docs/lit-review-ho-gia-thuyet-bao-chi-du-lieu.md`
- Thiết kế v5 (phần dữ liệu, 63/34, đọc tại chỗ): `prototypes/insight-demo/PHUONG-PHAP.md`

---

## 13. Kết quả bậc 0 (đo 2026-10-09)

Script: `prototypes/insight-demo/bench/bench-llm-latency.mjs`. GLM 5.3 qua Claude Code, không tool, 3 lời gọi đúng của luồng chuẩn (hiểu câu hỏi · chọn chỉ tiêu với 45 ứng viên thật · viết lời có chỗ trống), mỗi cách chạy 2 lần.

### 13.1 Độ trễ

| Lời gọi | Mỗi lượt một tiến trình | Tiến trình sống | Token ra |
|---|---|---|---|
| Hiểu câu hỏi | 5,5 · 5,9 giây | 7,0 · 4,2 giây | 186–390 |
| Chọn chỉ tiêu | 7,8 · 12,7 giây | 14,8 · 9,6 giây | 457–897 |
| Viết lời | 6,5 · 3,6 giây | 3,8 · 3,3 giây | 119–205 |
| **Tổng 3 lời gọi** | **19,7 · 22,3 giây** | **25,6 · 17,1 giây** | |

- Khởi động một tiến trình `claude -p` chỉ tốn **~1 giây** (đo riêng: sự kiện `init` ở giây thứ 1). Giữ tiến trình sống **không nhanh hơn rõ rệt** — chênh lệch nằm trong độ dao động của model.
- Thời gian bị chi phối bởi **số token đầu ra**: GLM sinh ~35–65 token/giây. "Chọn chỉ tiêu" chậm nhất vì model liệt kê rất nhiều id (lên tới ~30 id cho khái niệm "thu nhập").
- Độ dao động giữa hai lần chạy cùng lời gọi: tới ~2 lần.

### 13.2 Chất lượng (phát hiện phụ, quan trọng cho bậc 1)

- **Định tuyến không ổn định:** cùng câu "thu nhập và mức sinh giữa các tỉnh", 2/4 lần model trả `kham_pha` thay vì `chuan`.
- **Tách khái niệm sai:** 4/4 lần có khái niệm không phải chỉ tiêu ("vùng", "tương quan", "quan hệ thu nhập - mức sinh"); 1 lần trả `cap: region`, 1 lần `danh_muc_tinh: khong_ro`.
- 1/6 lần trả JSON bọc trong khối ```json — bộ đọc phải bóc.
- Chọn chỉ tiêu cho "mức sinh" ổn định 4/4 (`b01`, `b05`).

### 13.3 Danh mục chỉ tiêu

| Đo | Giá trị |
|---|---|
| Cột đo trong toàn kho (488 CSV) | **1.027** |
| … ở dataset cấp tỉnh (≥ 50 tỉnh) | 329 |
| … dùng được ngay, không phải chọn phân tổ | 295 |
| Thời gian dựng (đọc + đo dữ kiện, từ file đã tải về máy) | **~1,5 giây** |
| Lượt gọi embedding nếu nhúng theo lô 32 | **33** |

Con số ~29.000 "chuỗi" đo trước đây tính theo tổ hợp giá trị chiều; danh mục chỉ cần nhúng **theo cột đo** (1.027), nên rẻ hơn nhiều so với dự kiến.

### 13.4 Hệ quả cho bậc 1

1. **Không dùng tiến trình sống.** Lợi ích ~1 giây/lượt không đáng thêm độ phức tạp (quản lý vòng đời, ngữ cảnh dồn giữa các lượt). Giữ mỗi lời gọi một tiến trình `claude -p` — đơn giản, cô lập.
2. **Dựng danh mục chỉ tiêu** (quyết định mở 10.1): rẻ — 1,5 giây, 33 lượt embedding — và thay bước mở 12 dataset / khái niệm (đo trước đây: 7–20 giây).
3. **Giảm token ra** là đòn bẩy tốc độ chính:
   - Chọn chỉ tiêu: lọc sẵn ứng viên không dùng được trước khi gửi, chỉ yêu cầu **tối đa 3 id** mỗi khái niệm.
   - Hiểu câu hỏi: khuôn JSON gọn hơn.
4. **Làm chắc bước định tuyến trước khi tin nó:** thêm ví dụ trong prompt; code hậu kiểm (khái niệm phải là thứ đo được — loại "vùng", "tương quan"; nếu ≥ 2 khái niệm đo được và có họ phù hợp → luồng chuẩn bất kể model nói gì).
5. **Mục tiêu thời gian chỉnh lại:** 3 lời gọi hiện ~17–26 giây. Với bước 2–3, ước tính **~12–18 giây tới thẻ đầu tiên** — vẫn là ước tính, đo lại ở bậc 1. Mục tiêu "15 giây" ở 5.9 giữ làm đích, không phải cam kết.

---

## 14. Dữ liệu không đồng nhất — cách đọc chưa xác minh → đã xác minh

### 14.1 Tidy không phải bản chép, mà là góc nhìn

- **Mô hình logic** harness dùng: *(địa phương, thời gian, chỉ tiêu, các chiều) → giá trị*. Bộ dò, danh mục chỉ tiêu, phép ghép tỉnh × năm và rào chắn truy nguồn đều cần mô hình này — đó là "hợp đồng giữa hệ tất định và không tất định".
- **Không chép file sang tidy.** File gốc giữ nguyên; mỗi file có một **cách đọc** (script / mô tả đọc) — bộ đọc áp cách đọc lên file gốc để tạo góc nhìn tidy khi cần.

Các cách đã cân nhắc:

| Cách | Làm gì | Vì sao không chọn làm duy nhất |
|---|---|---|
| A. Chuyển hẳn sang tidy trước khi lưu | Như `nso_pxweb_to_tidy.py` | Phải xử lý trước mọi file; bản dùng tách khỏi bản gốc |
| B. File gốc + cách đọc đã xác minh | Bộ đọc áp cách đọc lúc cần | **Chọn** cho file dùng lại nhiều lần |
| C. Đọc thô mỗi lần hỏi | AI viết code đọc file mỗi câu hỏi | **Chọn** làm cửa vào cho file mới — nhưng mỗi lần một kiểu, chậm, không dựng được danh mục, không ghép được |
| D. Mô hình khối giàu (chuẩn thống kê) | Tidy + mã, đơn vị, thuộc tính chuẩn | Chỉ đáng khi trao đổi dữ liệu ra ngoài |

### 14.2 Vòng đời của một file

```
Upload ──► file lưu nguyên như vậy, chưa có cách đọc
   │
   ▼ lần đầu có người hỏi tới
CÁCH ĐỌC CHƯA XÁC MINH — harness (chế độ khám phá) tự viết cách đọc, trả lời NGAY,
   │  kèm nhãn "cách đọc chưa xác minh"; cách đọc được lưu lại
   ▼ xác minh (tự động, trong nền)
   ├─ đạt mọi kiểm tra ─────────────────────────────► CÁCH ĐỌC ĐÃ XÁC MINH
   └─ không chắc ─► hỏi chính người đang hỏi, ngay trong câu trả lời:
                    "Có đúng là số trong file không?" + vài dòng đọc ra cạnh file gốc
                    ├─ đúng ─► CÁCH ĐỌC ĐÃ XÁC MINH
                    └─ sai  ─► bỏ cách đọc, lần sau đọc lại
CÁCH ĐỌC ĐÃ XÁC MINH ──► chỉ tiêu vào danh mục ──► luồng chuẩn, ghép được, lần nào cũng ra cùng số
```

**Không ai phải chờ ai.** Người hỏi luôn có câu trả lời ngay; xác minh chỉ ảnh hưởng **những lần hỏi sau**. Không có hàng chờ duyệt, không có người duyệt trung tâm (đúng quyết định trước: hàng chờ duyệt làm phân mảnh).

### 14.3 Xác minh tự động

1. **Hợp đồng dữ liệu** (cùng luật với danh mục chỉ tiêu).
2. **Đọc hai lần độc lập rồi so** — hai lời gọi AI, diễn đạt khác nhau, viết hai cách đọc riêng; chạy cả hai; ra **cùng một bảng** thì gần như chắc đúng (mẫu "chạy song song, bỏ phiếu" — Building effective agents).
3. **Kiểm tổng** khi file có dòng "Cả nước" / "Tổng số" và chỉ tiêu cộng được.

Giai đoạn đầu: log mọi lần xác minh tự động + mọi lần phóng viên bảo "sai" → biết máy đọc sai ở kiểu nào, chỉnh skill / hàm hỗ trợ.

### 14.4 Liên hệ

- Chế độ khám phá (mục 6, bậc 4) có thêm vai trò: **cửa vào cho file mới**.
- Skill chuẩn hoá chạy local (Claude Code + hướng dẫn + script hỗ trợ + kiểm hợp đồng) là phiên bản sớm của việc viết cách đọc.

### 14.5 Thử nghiệm "đọc hai lần độc lập" trên 4 file XLSX (2026-10-09)

Script: `prototypes/insight-demo/bench/xlsx-two-readings.mjs`. Bản mô tả file (10 dòng đầu + 3 dòng cuối mỗi sheet) → GLM viết **hai cách đọc** từ hai lời nhắc khác nhau → code thực thi → so + kiểm hợp đồng. Cách đọc ở thử nghiệm này là **mô tả JSON** (sheet, dòng header, vai trò cột) do code thực thi, không phải code do AI viết.

| File · sheet | Hai cách đọc | Đúng thật? | Ai bắt được |
|---|---|---|---|
| Điểm ngập · 3 sheet cùng cấu trúc | Khớp — cùng xếp chồng thành 1 bảng, **159 dòng** | ✓ (mô tả dataset ghi 159 điểm) | — |
| Thiên tai · `Data` | Khớp — danh sách 335 sự kiện | ✓ | — |
| Thiên tai · `Column Description` | Khớp — nhận là **từ điển dữ liệu** | ✓ | — |
| GRDP · `RANK…` | Khớp — nhận là **bảng suy ra** | ✓ | — |
| **GRDP · `TĐ`** | **Khớp — nhưng cả hai sai**: 238 dòng | ✗ — bảng **lồng nhau** (dòng tỉnh, dưới là 6 dòng khu vực kinh tế); đúng phải là 34 tỉnh × 6 khu vực | **Kiểm hợp đồng** (địa lý chỉ khớp 34/238) — bỏ phiếu KHÔNG bắt được |
| 34 tỉnh · `Thongtintinhthanh` | Khớp — 34 dòng, đạt hợp đồng | ✓ | — |
| 34 tỉnh · 2 sheet lãnh đạo | Khớp | ✓ | — |
| 34 tỉnh · 3 sheet xã phường | "Lệch" — nhưng dữ liệu giống hệt, chỉ khác gọi cột phường là địa lý hay văn bản | ✓ | Báo động nhầm của bộ so |

Thời gian: 4–20 giây mỗi cách đọc, hai cách chạy song song.

**Bài học:**

1. **Đọc hai lần độc lập không đủ.** Hai lần đọc dùng chung đầu vào (cùng bản mô tả 10 dòng) nên **sai giống nhau** — bỏ phiếu chỉ bắt được *bất đồng*, không bắt được *điểm mù chung*. **Kiểm hợp đồng là lớp bắt lỗi thật**; bỏ phiếu là lớp phụ.
2. **Bản mô tả file phải cho thấy cấu trúc lặp**, không chỉ 10 dòng đầu: lấy mẫu cả giữa file, đánh dấu dòng có ô số trống (dấu hiệu dòng nhóm), đếm số mẫu lặp.
3. **Khuôn cách đọc thiếu thao tác "dòng nhóm"** (điền tên nhóm xuống các dòng con) — đúng kiểu `nso_pxweb_to_tidy.py` đã xử lý cho 128 file NSO. Danh sách thao tác cần lấy từ kinh nghiệm của script đó.
4. **Bộ so phải so dữ liệu, không so cách gọi tên vai trò**: so toàn bộ ô; khác biệt về vai trò cột báo riêng, không tính là lệch.
5. **Không đồng nhất không chỉ là bố cục, mà là *loại dữ liệu*.** 9/13 sheet là **danh sách** (mỗi dòng một điểm ngập, một sự kiện, một người, một xã) chứ không phải bảng số liệu thống kê. Hợp đồng hiện tại (cột số theo tỉnh × năm) không áp dụng cho chúng. Cần **hợp đồng thứ hai cho danh sách**, với chỉ tiêu sinh ra bằng đếm / gộp (vd "số điểm ngập theo phường và nguyên nhân", "số sự kiện thiên tai theo năm và loại") — để danh sách cũng vào được danh mục và luồng chuẩn.

**Điều chỉnh xác minh tự động (14.3):** thứ tự tin cậy là **hợp đồng dữ liệu → kiểm cấu trúc (số dòng hợp lý, địa lý khớp, tổng khớp) → bỏ phiếu**. Bỏ phiếu khớp mà hợp đồng không đạt → *không* xác minh; hỏi người đang hỏi.

#### Lần chạy 2 — sau khi sửa 3 điểm (2026-10-09)

Đã sửa: (1) bản mô tả file lộ cấu trúc lặp — lấy mẫu đầu / giữa / cuối, mẫu dòng N/T (có số / chỉ chữ), nhãn lặp lại ≥ 3 lần; (2) khuôn cách đọc có thao tác **dòng nhóm** (`dong_nhom`: nhãn nhóm điền xuống dòng con); (3) bộ so **so dữ liệu**, khác biệt vai trò cột báo riêng.

| File · sheet | Kết quả |
|---|---|
| **GRDP · `TĐ`** | ✓ **Đúng**: cả hai cách đọc nhận bảng lồng nhau — **204 dòng = 34 tỉnh × 6 dòng con** (GRDP, 4 khu vực kinh tế, "trong đó công nghiệp"), tỉnh là nhãn nhóm, dòng con thành chiều; đạt hợp đồng; hai cách đọc khớp. Chạy lại toàn bộ 4 file: vẫn đúng |
| Điểm ngập, 34 tỉnh · `Thongtintinhthanh`, GRDP · `RANK`, thiên tai · từ điển | Vẫn đúng, khớp |
| 3 sheet xã phường | Dữ liệu **khớp**; chỉ khác gọi cột phường là địa lý hay văn bản → không còn báo động nhầm |
| Thiên tai · `Data` | **Lệch thật** — một cách đọc chỉ khai 16/46 cột. Nguyên nhân: bản mô tả chỉ in 16 cột đầu mỗi dòng. Bộ so bắt được → trường hợp này sẽ hỏi người đang hỏi |
| 34 tỉnh · `Lanhdao` | **Lệch thật, nhỏ** — một cách đọc bỏ 2 cột chữ, cách kia giữ. Khác biệt về phán đoán, bộ so bắt được |

**Việc còn lại (nhỏ):** bản mô tả in **đủ dòng header** (cắt ở ~60 cột, kèm số cột thật); quy định chỉ được `bo` cột STT / cột trống — không bỏ cột có nội dung.

**Nhận xét:** sau khi sửa, hai cách đọc lệch nhau **chỉ ở chỗ đầu vào thật sự thiếu hoặc mơ hồ** — đúng là lúc nên hỏi người. Lỗi "sai giống nhau" ở lần 1 do bản mô tả và khuôn cách đọc, không phải do bỏ phiếu — nhưng vẫn giữ thứ tự tin cậy hợp đồng → cấu trúc → bỏ phiếu.

#### Lần chạy 3 — sau 2 việc nhỏ (2026-10-09)

Đã sửa thêm: bản mô tả in **đủ cột** (tới 60, kèm số cột thật); luật "chỉ bỏ cột STT / cột trống, khai đủ mọi cột có nội dung" + bước code kiểm luật này; quy tắc **xếp chồng sheet cùng cấu trúc** đưa vào phần dùng chung của cả hai lời nhắc (trước đó chỉ lời nhắc B có — lỗi của lời nhắc); bộ so so **theo từng sheet** (cắt bảng xếp chồng theo sheet).

**Kết quả: 13/13 sheet — hai cách đọc khớp dữ liệu**; không vi phạm luật cột; GRDP vẫn đúng (204 dòng, 34 tỉnh); thiên tai khai đủ 46 cột; điểm ngập cả hai cùng xếp chồng.

Còn lại chỉ là **khác biệt vai trò cột** (không ảnh hưởng dữ liệu đọc ra): cột tên xã / phường gọi là địa lý hay văn bản; vài cột của file thiên tai gọi là chiều hay văn bản. Khác biệt này **sẽ quan trọng** khi đưa danh sách vào danh mục (vai trò địa lý quyết định ghép được hay không) — cần bảng địa lý **cấp xã** (kho đã có dataset ranh giới cấp xã) và luật: cột địa lý phải khớp bảng địa lý thì mới được gọi là địa lý.

**Giới hạn:** 4 file, 13 sheet; mỗi file chạy 3 lần qua các phiên bản. Đủ để thấy cách làm chạy được và các lỗi đều do bản mô tả / khuôn cách đọc / lời nhắc — chưa đủ để nói tỷ lệ đúng trên file lạ.

---

## 15. Bài học từ thử nghiệm đọc file và cải tiến cho kiến trúc tổng thể (2026-10-09)

### 15.1 Hướng đã chốt cho dữ liệu không đồng nhất

**Đọc thô làm cửa vào (cách C) + cách đọc đã xác minh làm trạng thái ổn định (cách B).** Không phải "C thuần": C thuần (mỗi lần hỏi đọc lại) làm mỗi câu hỏi hiểu file một kiểu, không dựng được danh mục, không ghép được dataset, số có thể khác nhau giữa các lần — đúng các vấn đề đã đo. File chưa có cách đọc → đọc thô, trả lời ngay kèm nhãn "cách đọc chưa xác minh"; cách đọc qua xác minh → lưu, dùng cố định.

### 15.2 Năm bài học → năm cải tiến

| # | Bài học | Cải tiến kiến trúc |
|---|---|---|
| 1 | **Lỗi đến từ thứ đưa cho model, không phải suy luận của model.** Cả 3 vòng sửa đều ở bản mô tả file (10 dòng, 16 cột), khuôn cách đọc (thiếu "dòng nhóm"), lời nhắc (luật chỉ có ở một lời nhắc). Sửa xong, GLM đọc đúng 13/13 sheet | **Công cụ "nhìn" dữ liệu là thành phần hạng nhất.** Với file: bản mô tả lộ cấu trúc (mẫu N/T, nhãn lặp, đủ cột). Với harness phân tích: danh mục chỉ tiêu và `describe_dataset` phải lộ điều quyết định đúng sai (nhóm con, năm thật có số, 63/34) |
| 2 | **Bỏ phiếu chỉ bắt bất đồng; luật bắt điểm mù chung.** Vòng 1: hai cách đọc khớp mà cùng sai (GRDP 238 dòng) — chỉ hợp đồng bắt được | **Thang xác minh dùng chung toàn hệ thống:** luật / hợp đồng → kiểm cấu trúc → hai lần độc lập → hỏi người đang hỏi. Áp ngay cho **bước định tuyến** (bậc 0: lệch 2/4 lần) — gọi hai lần song song + luật hậu kiểm |
| 3 | **Luật chép rải rác vào prompt sẽ lệch nhau** (quy tắc xếp chồng chỉ có ở lời nhắc B) | **Một bộ luật, hai bên dùng:** mỗi luật khai một lần trong một module → sinh phần hướng dẫn của prompt **và** làm bộ kiểm bằng code |
| 4 | **Không đồng nhất còn là loại dữ liệu:** 9/13 sheet là danh sách (điểm ngập, sự kiện, xã, người), không phải bảng số liệu | **Hợp đồng thứ hai cho danh sách:** chỉ tiêu sinh bằng đếm / gộp (vd "số điểm ngập theo phường và nguyên nhân") → vào danh mục, chạy được các họ giả thuyết sẵn có |
| 5 | **Vai trò cột do model gắn còn dao động** (cột xã gọi là địa lý hay văn bản) | **AI gắn nhãn, dữ liệu tham chiếu phân xử:** cột chỉ là địa lý khi giá trị khớp bảng địa lý; mở rộng bảng địa lý xuống **cấp xã** (kho có dataset ranh giới cấp xã) |

**Hiệu năng:** đọc một file mất 4–24 giây, nhưng chỉ trả **một lần** — cách đọc đã xác minh được lưu, không nằm trên đường đi của các câu hỏi sau.

**Phương pháp:** 4 file thật → 5 bài học, mỗi lỗi sửa được theo cách áp dụng chung — ủng hộ "ca kiểm tra lấy từ dữ liệu và lỗi thật" (mục 7).

### 15.3 Phạm vi đã kiểm và chưa kiểm — KHÔNG phải "xử lý được mọi file"

**Đã kiểm:** 480 CSV theo chuẩn NSO; 4 XLSX / 13 sheet — **trong script thử nghiệm** (`bench/xlsx-two-readings.mjs`), **chưa đưa vào app / harness**.

| Loại / kiểu | Tình trạng |
|---|---|
| Năm nằm thành cột (2018, 2019… là tên cột) | Phổ biến; **khuôn cách đọc chưa có thao tác xoay cột → dòng** (script NSO có, ngoài luồng này) |
| Header nhiều tầng trong XLSX | Chưa gặp trong mẫu → chưa thử |
| Hai bảng cạnh nhau trong một sheet | Mới nhận ra (là bảng suy ra) và bỏ qua, chưa đọc |
| Bảng > 60 cột | Bản mô tả cắt ở 60 cột |
| File rất lớn (điểm thi 450 MB) | Cần đọc theo luồng — chưa có trong luồng này |
| Danh sách | Đọc ra được, **chưa thành chỉ tiêu** (chờ hợp đồng thứ hai) |
| PDF (bảng trong báo cáo), ảnh scan | Chưa — thuộc Phase 3a |
| Word, JSON, lỗi mã hoá | Chưa thử |
| Chế độ khám phá trong harness (nơi cách đọc chưa xác minh chạy thật) | **Chưa code** — bậc 4 |

Kết luận: cách làm **chạy được và sửa được theo cách áp dụng chung trên mẫu nhỏ**; chưa đủ để nói tỷ lệ đúng trên file lạ.

---

## 16. Kết quả bậc 1 — luồng chuẩn (2026-10-09)

### 16.1 Đã làm

Code ở `src/lib/insight/v2/` + route `/api/insight/ask` (NDJSON) + `/api/insight/catalog` + `InsightPanel` mới. Chỉ chạy local.

| Thành phần | Cách làm |
|---|---|
| Hiểu câu hỏi | 2 lời gọi song song (2 cách hỏi khác nhau) → code loại khái niệm không đo được, gộp trùng nghĩa (chuỗi con), cấp địa lý và 63/34 theo **chữ trong câu hỏi** trước, model sau |
| Danh mục chỉ tiêu | 3.218 chỉ tiêu / 442 dataset, dựng 4 giây từ file đã cache; 294 dùng được cấp tỉnh; 352 là nhóm con; 10 dataset bỏ qua (XLSX/GeoJSON). Vector **dùng chung của dataset** (embedding miễn phí giới hạn 100 lượt/phút) |
| Chọn chỉ tiêu | Code tìm 10 ứng viên / khái niệm → AI chọn ≤ 3 đúng nghĩa → luật: số chung trước nhóm con; khái niệm trỏ cùng chỉ tiêu thì gộp; tổ hợp có năm chung **mới nhất** thắng |
| Phân tích | 2 họ: quan hệ theo vùng, xu hướng/kỷ lục/điểm gãy. BH trên mọi phép thử của phiên |
| Viết lời | Mỗi thẻ 1 lời gọi, **song song**; số do code điền vào chỗ trống; kiểm câu chữ (nhân quả, cá nhân, so sánh nhất, chỗ trống lạ, **lạc đề**); sai → sửa 1 lần → vẫn sai thì dùng mẫu câu của code |
| Giao diện | Tự chạy ngay; tiến trình 3 dòng; chip chỉ tiêu đổi được; biểu đồ hệ số theo vùng / đường xu hướng; huy hiệu; "Xem cách tính"; "Chép kèm nguồn"; nhãn Hữu ích / Đã biết / Sai (lưu vào phiên — dữ liệu cho bậc 3); hỏi tiếp: bỏ năm sơ bộ, đổi năm |

### 16.2 Số đo (câu "Thu nhập và mức sinh có liên quan gì nhau giữa các tỉnh? Vùng nào khác biệt?")

| | Lát 1 | Bậc 1 |
|---|---|---|
| Hỏi mới | 75–100 giây | **22–29 giây** (hiểu 2,5–4,7 · chọn 4,6–10 · phân tích < 1 · viết lời 13–16) |
| Đổi chip / hỏi tiếp | chạy lại từ đầu | **~7 giây** |
| Vòng nộp lại thẻ | có | không |
| Số sai trong thẻ | rào chắn bắt | **không thể xảy ra** (code điền) |

Chưa đạt mục tiêu 15 giây. Phần lớn là độ trễ model, dao động gấp đôi giữa các lần.

Thẻ ra: quan hệ theo vùng (cả nước −0,45, lặp lại 2018; ĐBSH −0,62; ĐBSCL 0,12 — ngoại lệ), kỷ lục mức sinh (1,91 — thấp nhất từ 2005; đi ngang rồi giảm từ 2020), điểm gãy thu nhập (tăng nhanh hơn từ 2022). Đã đối chiếu chuỗi mức sinh cả nước với số gốc.

### 16.3 Bài học

| # | Bài học | Bằng chứng |
|---|---|---|
| 1 | **Số an toàn, ý thì chưa.** Chỗ trống chặn sai số, nhưng model vẫn **tự điền ý** vào chỗ code không nói: hướng xu hướng, chuỗi nào đang nói tới, ý nghĩa của chỗ trống | 4 lỗi: "{nam_dau}" đọc thành số năm; thẻ thu nhập viết thành "liên hệ thu nhập–mức sinh"; mức sinh "đi lên rồi trượt xuống"; "trước 2020 chủ yếu đi lên" (thật ra dao động 2,0–2,1). Cả 4 sửa bằng cách **code tính và nói ra sự thật đó** — không sửa bằng lời dặn chung. Lặp lại bài học 15.2 #1 ở bước viết lời |
| 2 | **Bộ kiểm câu chữ theo danh sách từ chỉ bắt lỗi đã biết.** Sai hướng xu hướng lọt qua mọi luật | Lỗi chỉ lộ khi người đọc đối chiếu số gốc |
| 3 | **Có ý nghĩa thống kê ≠ đáng viết.** "Thu nhập cao nhất kể từ 2018" qua mọi kiểm nhưng là điều ai cũng đoán được | Thêm luật "kỷ lục đã được chờ đợi" |
| 4 | **Luật kiểu ngưỡng đang dồn lên, mỗi cái sinh từ một ví dụ** | 80% số năm, 0,5%/năm, r 0,3, 8 tỉnh/vùng — chưa cái nào kiểm trên câu hỏi thứ hai |
| 5 | **Chất lượng metadata là trần của harness** | Đơn vị thu nhập ghi "unknown" trong dictionary → thẻ không có đơn vị |
| 6 | **Song song hoá là đòn bẩy rẻ nhất** | Viết lời 25 → 13–16 giây chỉ bằng tách thẻ |

### 16.4 Phản biện kiến trúc hiện tại

**Điều đã được chứng minh:** code điều khiển + AI ở 3 điểm đúng hướng — nhanh gấp 3–4 lần, không vòng nộp lại, đổi chip không phải gọi lại AI, số không thể sai.

**Điểm yếu (xếp theo mức nghiêm trọng):**

1. **Mới kiểm trên MỘT câu hỏi.** Mọi luật và ngưỡng ở 16.3 #4 khớp với câu này; không biết câu thứ hai sẽ ra sao. Đây là rủi ro lớn nhất — không phải bộ đánh giá chính thức, mà là 5–10 câu hỏi thật của phóng viên trước khi tinh chỉnh thêm.
2. **Không có bước "câu hỏi cần họ nào".** Hễ có khái niệm đo được là chạy mọi họ khả dụng rồi xếp hạng. Câu "tỉnh nào có X cao nhất" hay "A so với B" sẽ nhận thẻ quan hệ / xu hướng không trả lời câu hỏi. Bước hiểu câu hỏi nên trả thêm **ý định** (quan hệ, xếp hạng, xu hướng, so sánh) và code ánh xạ ý định → họ; thẻ bối cảnh chỉ thêm khi còn chỗ.
3. **Ý định tính chưa được chống lỗi như số.** Hướng, mức độ, "ngoại lệ" đang nằm trong `y_chinh` dạng chữ — model có thể diễn lại sai. Hướng sửa: đưa cả **nhận định định tính** vào chỗ trống (vd `{huong_truoc}`, `{muc_do}`) để code điền, model chỉ viết câu nối. Đổi lại văn sẽ cứng hơn.
4. **Hai hệ tìm kiếm chạy cạnh nhau, có thể nói khác nhau.** Discovery liệt kê dataset theo cách của nó (vd vẫn gợi ý "thu nhập đầu người … đến 2018"), panel insight chọn theo danh mục chỉ tiêu. Phóng viên thấy hai danh sách. Nên để chip của panel là nguồn duy nhất cho câu hỏi phân tích, hoặc cho Discovery dùng danh mục chỉ tiêu.
5. **Vector cấp dataset** đủ cho NSO (mỗi dataset ít chỉ tiêu) nhưng không phân biệt được cột trong dataset nhiều chỉ tiêu; đang dựa vào từ khoá + AI. Sẽ yếu dần khi kho thêm file đa chỉ tiêu.
6. **Danh mục là file local dựng tay** — dataset mới upload không có cho tới khi dựng lại. Đủ cho pilot, không đủ khi đưa vào app.
7. **Giá trị của "hiểu câu hỏi hai lần" chưa đo được.** Lệch nhiều lần nhưng lệch chủ yếu là chữ đồng nghĩa ("tỷ suất sinh" / "mức sinh") mà bước chọn chỉ tiêu đã gộp. Nếu log bậc 3 cho thấy lần thứ hai không đổi kết quả, bỏ để giảm tải.
8. **Họ "quan hệ theo vùng" là tương quan sinh thái** — đã có cảnh báo, nhưng đây là loại phát hiện yếu nhất về mặt báo chí. Thư viện họ (bậc 2) quan trọng hơn tinh chỉnh họ này.

### 16.5 Hệ quả cho bậc tiếp

- **Trước khi tinh chỉnh tiếp:** đưa cho phóng viên dùng thử, thu 5–10 câu hỏi thật + nhãn → đó là ca kiểm tra đầu tiên (bậc 3 kéo lên sớm, chỉ phần thu log).
- **Bậc 2 bắt đầu bằng "ý định → họ"** (điểm yếu 2), rồi mới thêm họ xếp hạng & ngoại lệ — họ trả lời được loại câu hỏi phổ biến nhất.
- Đưa nhận định định tính vào chỗ trống (điểm yếu 3) khi làm họ mới — mỗi họ khai sẵn các nhận định của nó.
- Sửa đơn vị "unknown" trong dictionary qua app (việc dữ liệu, không phải code).

---

## 17. Nhìn lại: tránh overfit vào kho hiện tại (2026-10-09, sau vòng thử 2)

Bối cảnh: hai vòng thử 12 câu (`bench/runs/2026-10-09-vong1`, `…-vong2`) đưa bỏ-im-lặng 7 → 0 và sai-ý 3 → 0.
Nhưng gần như mọi sửa là **luật dựa trên chữ** khớp với NSO và với chính 12 câu đó. Kho sẽ nhiều dữ liệu hơn,
không đồng nhất hơn, nhiều định dạng hơn → cách làm này gãy khi đưa dataset khác vào.

### 17.1 Overfit ở đâu

Giả định ngầm của cả harness: **bảng NSO tidy — tỉnh (63) × năm × chỉ tiêu × vài chiều phụ.**

| Tầng | Giả định | Gãy khi |
|---|---|---|
| Đọc | Có cột tỉnh khớp bảng 63/34, cột năm, "Tổng số/Chung" là tổng | Xã, tháng, doanh nghiệp, trường; danh sách sự kiện; GeoJSON; PDF (đã có 10 dataset bị bỏ qua) |
| Danh mục chỉ tiêu | Dùng được khi ≥ 50 tỉnh | Mọi thứ không ở cấp tỉnh đều vô hình |
| Họ giả thuyết | "Quan hệ theo vùng" gắn 6 vùng VN; "diễn biến" gắn chuỗi năm cả nước | Chủ thể khác (quận, ngành, nước), nhịp khác |
| Luật sinh ở vòng 1–2 | Regex trên chữ tiếng Việt / tên NSO: `isExtensive`, `isNominalMoney`, `measureName`, `subjectOf`, bí danh vùng, regex ý định, danh sách lời bình | Nguồn khác đặt tên, ghi đơn vị khác |
| Đánh giá | 12 câu tự sinh, dùng lại hai vòng, sửa sau khi đã xem | Không biết sửa có tổng quát |

**Dấu hiệu:** mỗi lỗi được sửa bằng một luật chữ; chính vòng 2 cho thấy hậu quả — luật so tên ghép ly hôn với
mức sinh, luật địa danh nhận "diễn biến" thành Điện Biên. Và `isExtensive` / `isNominalMoney` sinh ra để **vá
metadata kém** (đơn vị "unknown", cờ cộng được sai) thay vì sửa ở nguồn.

Các hàm đoán ngữ nghĩa này được đánh dấu **TẠM** trong `v2/rules.ts`.

### 17.2 Giữ lại — không phụ thuộc kho

1. Code tính sự thật; AI chọn theo nghĩa và viết từ sự thật (số + hướng vào chỗ trống) — vòng 2: 0 số sai, 0 sai hướng.
2. **Dữ liệu phân xử, không phải tên** — bài học lặp 3 lần (vai trò cột; chọn chỉ tiêu; ghép chuỗi dài hơn).
3. Phạm vi trả lời trung thực.
4. Thang xác minh (luật → cấu trúc → hai lần độc lập → hỏi người).
5. Đọc tại chỗ + lưu cách đọc đã xác minh (mục 14).
6. Chạy lại cả bộ sau mỗi sửa.

### 17.3 Đổi trục: từ "dataset NSO" sang "hình dạng + hồ sơ ngữ nghĩa"

**A. Hồ sơ ngữ nghĩa cho mỗi dataset — sinh lúc upload, có xác minh.**

| Trường | Ví dụ |
|---|---|
| Hình dạng | chuỗi quan sát (chủ thể × thời gian × số đo) · danh sách sự kiện · đối tượng không gian · tài liệu |
| Chủ thể | cột nào; loại (tỉnh, xã, doanh nghiệp, nước…); bảng tham chiếu nào; danh mục (63/34) |
| Thời gian | cột nào; nhịp (năm, quý, tháng, ngày); năm sơ bộ |
| Mỗi số đo | loại: đếm / tổng tiền / tỷ lệ / chỉ số / bình quân; giá danh nghĩa hay thực; **cộng được không**; mẫu số (nếu là tỷ lệ); đơn vị chuẩn hoá; chuẩn đo / phương pháp nếu biết |
| Quan hệ tổng | dòng / giá trị nào là tổng; tổng các phần có bằng tổng không |

AI của wizard đề xuất → **code kiểm bằng dữ liệu** (tổng các tỉnh = cả nước nếu khai cộng được; năm đọc được;
đơn vị nhất quán; chủ thể khớp bảng tham chiếu) → chỗ không chắc hỏi người upload. Harness **đọc khai báo đã
xác minh, không đoán từ tên**. Đây là "cách đọc đã xác minh" (mục 14) mở rộng thành tầng ngữ nghĩa chung —
và là nơi sửa đúng của bài học 15.2 #1 ("lỗi đến từ thứ đưa cho model").

**B. Họ giả thuyết viết theo hình dạng, không theo "tỉnh / vùng".** "Quan hệ giữa các chủ thể" chạy cho mọi
loại chủ thể có ≥ N phần tử cùng thời điểm; "theo nhóm" dùng bất kỳ cấp nào bảng tham chiếu có (tỉnh → vùng,
xã → tỉnh, doanh nghiệp → ngành). Mỗi họ **khai điều kiện cần** bằng trường của hồ sơ → **thẻ phạm vi suy ra
từ điều kiện** ("chưa làm được vì dữ liệu không có X"), thay cho danh sách regex ý định.

**C. Bảng tham chiếu cắm được.** Địa giới VN 63 / 34 / xã hôm nay; mã ngành, danh sách nước… sau. Ghép chủ thể
luôn để dữ liệu phân xử.

**D. Chế độ khám phá lên sớm.** Họ = làn nhanh cho mẫu câu hỏi hay gặp; **bao phủ** dữ liệu không đồng nhất
cần agent viết code trên API đã kiểm định (đọc hồ sơ, cắt lát), cùng thang xác minh, số lấy từ kết quả code đã
chạy. Thêm họ mãi không theo kịp sự đa dạng.

**E. Hiểu câu hỏi:** regex ý định là overfit vào cách hỏi. Chuyển sang model + khuôn có cấu trúc (hai lần đọc),
luật chữ chỉ giữ cho vài mẫu độ chính xác cao; đo lại độ ổn định.

### 17.4 Dừng

- Đánh bóng câu chữ trên 12 câu hiện có (vòng 3 như đề xuất ở vòng 2 mục 4 — **huỷ**, trừ lỗi ảnh hưởng mọi dữ liệu).
- Thêm luật chữ sau mỗi lỗi.
- Mở rộng logic riêng cho NSO / 63 tỉnh.

### 17.5 Đánh giá chống overfit

| Thành phần | Nội dung |
|---|---|
| Hai bộ câu hỏi | bộ **sửa** (được xem khi sửa) và bộ **để dành** (không xem, chỉ chạy để nghiệm thu); câu thật của phóng viên vào bộ để dành |
| Bộ dataset đa dạng hình dạng | vài NSO; 4 XLSX (mục 14.5); 1 GeoJSON; 1 danh sách sự kiện; 1 chuỗi tháng; 1 dữ liệu cấp xã |
| Kiểm biến đổi | đổi tên cột, đổi đơn vị, đảo thứ tự dòng, bản 34 tỉnh của cùng dữ liệu → kết quả phải không đổi (hoặc đổi đúng cách) |
| Luật nghiệm thu một sửa | phát biểu được thành nguyên tắc chung + qua bộ để dành; **không vá theo chuỗi chữ** |
| Chỉ số "mùi" | số luật dựa trên chữ trong harness — theo dõi, phải giảm |

### 17.6 Thứ tự làm

1. Schema hồ sơ ngữ nghĩa + bộ sinh (AI) + bộ kiểm (code); áp cho bộ dataset đa dạng (17.5). **Pilot giữ hồ sơ
   riêng của harness** (không đụng wizard / metadata); đưa vào wizard khi schema ổn — quyết định riêng.
2. Viết lại 2 họ hiện có theo hình dạng + điều kiện cần; phạm vi suy từ điều kiện; bỏ các hàm TẠM.
3. Chế độ khám phá tối thiểu cho phần họ chưa phủ.
4. Dựng bộ đánh giá 17.5; chạy làm mốc trước khi thêm họ (bậc 2).

Mục 16.5 ("bậc 2 bắt đầu bằng ý định → họ") được thay bằng thứ tự này.

