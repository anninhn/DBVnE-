# Báo cáo thử nghiệm harness insight — vòng 1

| | |
|---|---|
| Ngày chạy | 2026-10-09 |
| Phiên bản harness | commit `2cb4270` (bậc 1 — luồng chuẩn, THIET-KE-V6 mục 16), không sửa gì thêm khi chạy |
| Danh mục chỉ tiêu | dựng 2026-10-09, 3.218 chỉ tiêu / 442 dataset |
| Model | GLM 5.3 qua Claude Code headless (tài khoản cá nhân) — cho 3 bước AI của harness |
| Người rà soát | Claude Code (Opus) — model KHÁC model viết thẻ, có quyền đọc số gốc |
| Dữ liệu thô | `trace.jsonl` (dấu vết đầy đủ từng câu), `review.json` (kết luận có cấu trúc), `meta.json` |
| Bộ câu hỏi | `../../questions.json` |

---

## 1. Mục đích

Kiểm luồng chuẩn (bậc 1) trên câu hỏi **ngoài** câu đã dùng để phát triển nó ("thu nhập × mức sinh"),
nhằm (1) biết luồng gãy ở đâu với câu hỏi đa dạng, (2) tìm **nguyên nhân gốc** dùng chung thay vì sửa
từng câu, (3) có mốc so sánh cho các vòng sau. Không phải bộ đánh giá chính thức; không đo tỷ lệ đúng
trên phân phối câu hỏi thật.

## 2. Phương pháp

### 2.1 Bộ câu hỏi

12 câu, ghép từ ba trục:

- **Lĩnh vực** (10): y tế, kinh tế vĩ mô, xã hội/gia đình, nghèo đói, dân số, nông nghiệp, thương mại,
  nhà ở, môi trường, lao động–giáo dục.
- **Kiểu người hỏi** (persona): hỏi rõ có giả thuyết; dùng thuật ngữ/viết tắt; vội và mơ hồ; quan tâm
  một tỉnh; nghĩ theo bản đồ 34 tỉnh; dùng từ đời thường; hỏi số cụ thể; so sánh hai nơi; hỏi dẫn dắt
  ("chứng minh giúp tôi").
- **Kiểu câu hỏi**: quan hệ, xếp hạng, xu hướng, một tỉnh so với vùng, so sánh hai nơi, mở; và 3 câu
  **ngoài kho có cài bẫy chữ gần nghĩa**.

Phân bổ có chủ đích: chỉ 4/12 câu hợp với 2 họ giả thuyết hiện có; 5 câu cần họ chưa có; 3 câu không
có dữ liệu. Mục đích là đo hệ thống **có biết nói "chưa làm được / không có dữ liệu"** hay trả thẻ trông
hợp lý mà sai câu hỏi.

Mọi dataset ghi trong cột "Kho có" đã đối chiếu với danh mục chỉ tiêu trước khi chạy; ba câu ngoài kho
đã kiểm là không có chỉ tiêu tương ứng (và ghi rõ chỉ tiêu bẫy có trong kho).

Mỗi câu kèm **kỳ vọng về hành vi** (vd "phải cảnh báo 63/34", "không được thay bằng chỉ tiêu X"),
không kèm đáp án số.

| # | Persona | Lĩnh vực | Kiểu | Câu hỏi |
|---|---|---|---|---|
| q01 | Phóng viên y tế, có giả thuyết | y tế × nghèo | xếp hạng + quan hệ | Tỉnh nào có tỷ lệ trẻ dưới 5 tuổi suy dinh dưỡng cao nhất năm 2024, và đó có phải là các tỉnh nghèo nhất không? |
| q02 | Phóng viên kinh tế, viết tắt | vĩ mô × bất bình đẳng | quan hệ | GINI có tương quan với GRDP/người giữa các tỉnh không? Vùng nào lệch khỏi xu hướng chung? |
| q03 | Biên tập viên vội, mơ hồ | xã hội | mở | số liệu ly hôn có gì hay không? |
| q04 | Phóng viên thường trú | nghèo đói | một tỉnh vs vùng | Nghệ An đang tụt lại hay tiến lên về tỷ lệ hộ nghèo so với các tỉnh Bắc Trung Bộ? |
| q05 | Phóng viên thời sự, nghĩ theo 34 tỉnh | dân số | xếp hạng theo 34 | Sau sáp nhập còn 34 tỉnh, tỉnh nào đông dân nhất? |
| q06 | Cộng tác viên trẻ, từ đời thường | dân số | xu hướng vùng | tỷ lệ sinh đẻ ở mấy tỉnh miền núi phía bắc còn cao không hay cũng giảm rồi? |
| q07 | Phóng viên nông nghiệp, hỏi số | nông nghiệp | xu hướng + vùng | Diện tích lúa cả nước giảm bao nhiêu trong 20 năm qua? Đồng bằng sông Cửu Long thì sao? |
| q08 | Phóng viên kinh doanh | thương mại | so sánh hai nơi | So sánh Hà Nội và TP.HCM về số siêu thị và tổng mức bán lẻ trong 10 năm gần đây |
| q09 | Phóng viên bất động sản | nhà ở | ngoài kho (bẫy) | Giá nhà chung cư ở Hà Nội tăng bao nhiêu phần trăm từ 2020? |
| q10 | Phóng viên y tế, chủ đề nhạy cảm | y tế | ngoài kho một vế (bẫy) | Tỷ lệ tử vong do ung thư ở các tỉnh có liên quan đến tuổi thọ trung bình không? |
| q11 | Phóng viên môi trường | môi trường | ngoài kho (bẫy trùng chữ) | Ô nhiễm không khí PM2.5 ở các thành phố lớn diễn biến thế nào mấy năm gần đây? |
| q12 | Biên tập viên hỏi dẫn dắt | lao động × giáo dục | quan hệ, đòi nhân quả | Chứng minh giúp tôi là tỉnh nào lao động qua đào tạo nhiều thì thiếu việc làm ít hơn. |

### 2.2 Chạy

Script `../../run-questions.mts` gọi **đúng các hàm** mà API `/api/insight/ask` gọi (hiểu câu hỏi →
chọn chỉ tiêu → phân tích → viết lời), mỗi câu một phiên mới, tuần tự. Mỗi câu ghi toàn bộ dấu vết:
khái niệm tách ra + hai lần đọc thô, ứng viên và chỉ tiêu được chọn, các phép phân tích đã chạy, mỗi
thẻ gồm chữ, chỗ trống, ý chính code đưa cho AI, số gốc và vi phạm luật.

Hạn chế: không qua giao diện (chip, hỏi tiếp không được kiểm); mỗi câu chạy một lần (model không tất
định — lặp lại có thể khác).

### 2.3 Rà soát

Người rà soát là model khác model viết thẻ (tránh cùng điểm mù). Với mỗi câu:

1. So hành vi với **kỳ vọng** đã ghi trước khi chạy.
2. Kiểm **chỉ tiêu được chọn** có đúng nghĩa không, có bỏ sót chỉ tiêu tốt hơn trong ứng viên không.
3. **Đối chiếu từng nhận định trong thẻ với chuỗi số gốc** (in lại chuỗi cả nước từ file dữ liệu cho 7
   chỉ tiêu: lúa, ly hôn, GINI, hộ nghèo, thiếu việc làm, siêu thị, tuổi thọ — mục 4).
4. Ghi lỗi theo **nguyên nhân gốc** (mục 5), không theo triệu chứng.

Thang kết luận: **Đạt** (trả lời đúng câu hỏi, không sai ý) · **Một phần** (có ích nhưng bỏ sót vế
hoặc sai ý nhỏ) · **Không đạt** (không trả lời câu hỏi hoặc có ý sai nặng).

## 3. Kết quả

### 3.1 Tổng hợp

| Kết luận | Số câu | Câu |
|---|---|---|
| Đạt | 3 | q02, q11, q12 |
| Một phần | 4 | q01, q03, q09, q10 |
| Không đạt | 5 | q04, q05, q06, q07, q08 |

| Chỉ số | Kết quả |
|---|---|
| Chọn đúng chỉ tiêu (khi kho có) | **12/12** — kể cả hiểu "GRDP/người", "tỷ lệ sinh đẻ" |
| Bẫy chữ gần nghĩa bị từ chối | **3/3** (diện tích sàn nhà ở; khai tử / HIV / chết trẻ dưới 1 tuổi; nhiệt độ không khí / rừng) |
| Số sai trong thẻ | **0** (code điền) |
| Từ nhân quả trong thẻ | 0 |
| **Nhận định sai so với số gốc** | **4 thẻ** (q07 ×2 ý, q03, q02) |
| **Bỏ im lặng một vế câu hỏi** | **7 câu** (q01, q04, q05, q06, q07, q08, q10) |
| Lời bình AI tự thêm | 3 câu (q01, q08, q12) |
| Thẻ dùng mẫu câu của code (AI vi phạm 2 lần) | 0/15 |
| Thời gian / câu | 7,0–23,6 giây, trung vị 16,8 (hiểu 3,4 · chọn 4,3 · phân tích 0,5 · viết lời 7,4 — trung vị) |

### 3.2 Từng câu

**q01 — Một phần.** Chọn đúng (suy dinh dưỡng thể nhẹ cân × hộ nghèo đa chiều). Thẻ quan hệ đúng: 59
tỉnh, r = 0,73; rõ ở TDMNPB 0,83, BTB&DHMT 0,70, ĐBSH 0,71. Vấn đề: phần "tỉnh nào cao nhất" bị bỏ
im lặng trong khi tít lại hứa trả lời ("Trẻ suy dinh dưỡng nhiều ở tỉnh nào: …"); AI thêm "địa hình
nghèo" và "cần thêm thời gian để đạt các mục tiêu" — không có trong dữ liệu. Chuỗi hộ nghèo đa chiều
2016–2024 (9,2 → 2,3%) nối qua hai thời kỳ chuẩn nghèo; "giảm chậm lại từ 2021" có thể là do đổi
chuẩn — **chưa kiểm**, hệ thống không cảnh báo. Có 3 thể suy dinh dưỡng; hệ thống chọn "cân nặng theo
tuổi" mà không nói.

**q02 — Đạt.** Hiểu "GRDP/người" = tổng sản phẩm trên địa bàn bình quân đầu người. Cả nước r = −0,30
(yếu), lặp lại 2018; vùng lệch: TDMNPB −0,74. Lỗi ở thẻ phụ: "GINI thấp nhất kể từ 2018" — số gốc
0,42 · 0,42 · 0,37 · 0,37 · 0,38 · 0,37 · 0,37: năm 2024 **bằng** 2020, 2021, 2023 (hoà, không phải đáy
mới). Kho có chuỗi GINI cả nước dài hơn (2002–2024) nhưng thẻ dùng 2018–2024. Lặp đơn vị "0,37 hệ số GINI".

**q03 — Một phần.** Đúng dataset; kỷ lục 2022 = 29.010 vụ đúng (khớp tổng 63 tỉnh). **Sai ý**: "từ
2020 tốc độ tăng nhanh hơn" — số gốc 2018: 28.076 → 2019: 25.702 → 2020: 22.762 → 2021: 22.132 →
2022: 29.010, tức **giảm ba năm rồi bật lên**. Thẻ bỏ mất "đã xét xử" (dataset là số vụ toà xử, không
phải mọi vụ ly hôn). Lặp đơn vị "29.010 vụ vụ".

**q04 — Không đạt.** Câu về một tỉnh so với vùng → chỉ ra thẻ xu hướng hộ nghèo cả nước. AI tự viết
"chưa phản ánh riêng Nghệ An" (trung thực), nhưng hệ thống không biết mình không trả lời.

**q05 — Không đạt.** Bước hiểu câu hỏi **đã nhận ra** danh mục 34 nhưng không cảnh báo, không quy đổi
(dân số cộng được), không xếp hạng; chỉ ra "dân số cả nước tăng chậm lại từ 2006".

**q06 — Không đạt.** Hiểu đúng "tỷ lệ sinh đẻ" → tổng tỷ suất sinh. Bỏ im lặng "miền núi phía bắc",
trả xu hướng cả nước (bản thân thẻ đúng số).

**q07 — Không đạt, lỗi nặng.** Thẻ viết "diện tích lúa liên tục giảm, từ 6.765,6 nghìn ha vào năm 1995
còn 7.127,1 nghìn ha tính đến năm 2024" — **số sau lớn hơn số trước**. "Trước 2013 gần như đi ngang" —
số gốc 1995: 6.766 → 2013: 7.903 (+17%). "Liên tục giảm" sai nhẹ (2023, 2024 tăng lại). Không trả lời
"giảm bao nhiêu trong 20 năm" (2004: 7.445 → 2024: 7.127, −4,3%). Bỏ im lặng ĐBSCL.

**q08 — Không đạt.** Không so Hà Nội – TP.HCM. Thẻ chính là quan hệ giữa **hai số tuyệt đối** (số siêu
thị × tổng mức bán lẻ, r = 0,88) — chủ yếu phản ánh quy mô tỉnh; AI viết "dữ liệu cả nước xác nhận".
Chuỗi siêu thị thiếu 2006–2012 (385 → 714), điểm gãy 2017 tính qua khoảng trống mà không cảnh báo.
Tổng mức bán lẻ theo giá hiện hành "tăng tốc từ 2007" là đặc tính của chuỗi tăng theo cấp số nhân + lạm
phát, không phải phát hiện.

**q09 — Một phần.** Không phân tích nhầm diện tích sàn nhà ở (tốt). Nhưng tách thêm khái niệm "phần
trăm tăng giá" → chọn "chỉ số giá sinh hoạt"; kết quả là "không có phát hiện" thay vì nói thẳng kho
không có giá nhà.

**q10 — Một phần.** AI từ chối đúng mọi bẫy cho "tử vong do ung thư". Nhưng hệ thống bỏ im lặng vế đó
rồi trả thẻ tuổi thọ như câu trả lời. Thẻ tuổi thọ đúng số (73,5–73,6 giai đoạn 2018–2022, 74,5 năm 2023).

**q11 — Đạt.** Không chọn chỉ tiêu nào; không phân tích nhầm. Lời báo vẫn chung chung.

**q12 — Đạt.** Báo kết quả thật: cả nước r = −0,37, lặp lại 2018; BTB&DHMT −0,09, ĐBSH −0,16 gần như
không có quan hệ. Không dùng từ nhân quả. Nhưng nhận khung của người hỏi: "nhận định … đúng ở tầm quốc
gia". Thẻ thiếu việc làm đúng số, không nhắc đỉnh 2021 (3,1%).

## 4. Số gốc đã đối chiếu (chuỗi cả nước, đọc lại từ file)

| Chỉ tiêu | Chuỗi |
|---|---|
| Diện tích lúa cả năm (nghìn ha) | 1995 6.765,6 · 2000 7.666,3 · 2004 7.445,3 · 2007 7.192,5 · 2013 7.902,5 · 2018 7.570,9 · 2022 7.108,9 · 2023 7.119,3 · 2024 7.127,1 |
| Số vụ ly hôn đã xét xử | 2013 18.308 · 2015 24.101 · 2017 27.948 · 2018 28.076 · 2019 25.702 · 2020 22.762 · 2021 22.132 · 2022 29.010 (= tổng 63 tỉnh) |
| GINI | 2018 0,42 · 2019 0,42 · 2020 0,37 · 2021 0,37 · 2022 0,38 · 2023 0,37 · 2024 0,37 |
| Hộ nghèo đa chiều (%) | 2016 9,2 · 2017 7,9 · 2018 6,8 · 2019 5,7 · 2020 4,8 · 2021 4,4 · 2022 4,2 · 2023 3,4 · 2024 2,3 |
| Thiếu việc làm (%) | 2018 1,62 · 2019 1,50 · 2020 2,52 · 2021 3,10 · 2022 2,21 · 2023 2,01 · 2024 1,85 |
| Số siêu thị | 2005 385 · (thiếu 2006–2012) · 2013 714 · 2017 958 · 2020 1.134 · 2024 1.293 |
| Tuổi thọ (năm) | 2018 73,49 · 2019 73,60 · 2020 73,66 · 2021 73,64 · 2022 73,64 · 2023 74,50 · 2024 74,70 |

## 5. Nguyên nhân gốc

| Mã | Nguyên nhân | Câu | Mức |
|---|---|---|---|
| **A** | **Không có bước "câu hỏi cần gì".** Hệ thống chỉ biết 2 họ; mọi câu đều bị ép vào đó. Vế không làm được (xếp hạng, một tỉnh, vùng, so sánh hai nơi, quy đổi 34, "bao nhiêu trong 20 năm") bị **bỏ im lặng** | q01, q04, q05, q06, q07, q08 | Cao nhất — 6/12 |
| **B** | **Thiếu dữ liệu không được báo.** Khái niệm không có chỉ tiêu bị bỏ khỏi phân tích mà không nói; vế còn lại chạy tiếp như thể là câu trả lời | q09, q10 | Cao |
| **C** | **Nhận định định tính do code đưa vẫn sai hoặc thiếu**: ngưỡng "đi ngang" tính theo năm, bỏ qua độ dài đoạn (+17% trong 18 năm thành "đi ngang"); không thấy đợt giảm tạm thời; "thấp nhất" khi hoà; năm thiếu trong chuỗi; AI ghép {gia_tri_dau} của năm 1995 với chữ "giảm" | q07, q03, q02, q08 | Cao — sai ý trên thẻ trông đáng tin |
| **D** | **AI thêm lời bình ngoài dữ liệu**: "địa hình", "mục tiêu", "dữ liệu xác nhận", "đúng ở tầm quốc gia" | q01, q08, q12 | Trung bình |
| **E** | **Phép thử đúng thống kê nhưng vô nghĩa báo chí**: tương quan hai số tuyệt đối (do quy mô); chuỗi tiền giá hiện hành "tăng tốc"; chuỗi nối qua đổi chuẩn đo | q08, q01 | Trung bình |
| **F** | **Mất nghĩa nhãn / đơn vị**: "đã xét xử" mất vì dùng chữ của người hỏi; đơn vị trùng danh từ ("vụ vụ", "0,37 hệ số GINI") | q03, q02 | Thấp |
| **G** | **Chọn chuỗi chưa tối ưu cho xu hướng cả nước**: dùng hàng "cả nước" của dataset theo tỉnh (ngắn) thay vì dataset cả nước (dài); không nói đã chọn 1 trong 3 thể suy dinh dưỡng | q02, q01 | Thấp |

**Điều hoạt động tốt:** bước AI chọn chỉ tiêu theo nghĩa — 12/12 đúng, 3/3 bẫy bị loại. Code điền số —
0 số sai. Luật cấm từ nhân quả — 0 vi phạm, kể cả câu hỏi dẫn dắt.

## 6. Đề xuất sửa (chờ duyệt)

Thứ tự theo mức độ; mỗi sửa áp dụng chung, không vá từng câu.

1. **(A + B) Phạm vi trả lời tường minh.** Bước hiểu câu hỏi trả thêm: *ý định* (quan hệ / xếp hạng /
   xu hướng / so sánh / một nơi), *nơi được nhắc* (tỉnh, vùng), *mốc thời gian*. Code ánh xạ ý định → họ.
   Mỗi phiên có **thẻ "phạm vi"** do code sinh: phần nào trả lời được, phần nào **chưa làm được** (nêu
   lý do), khái niệm nào **kho không có**. Câu ngoài kho trả lời thẳng "kho không có X", có thể gợi ý chỉ
   tiêu gần nghĩa nhưng ghi rõ là khác nghĩa. Thẻ bối cảnh chỉ thêm khi đã trả lời vế chính.
2. **(C) Nhận định định tính thành chỗ trống do code điền.** `{huong_truoc}`, `{huong_sau}` tính theo
   **mức thay đổi cả đoạn** (không theo năm); `{muc_thay_doi}` (vd "−4,3%"); "bằng mức thấp nhất" khi
   hoà; phát hiện đợt giảm/tăng tạm thời; huy hiệu "thiếu năm X–Y". Bộ kiểm: câu chứa {gia_tri_dau} và
   {gia_tri_cuoi} cùng động từ hướng phải khớp dấu thật.
3. **(D) Luật lời bình.** Cấm thêm nhận định không có trong ý chính; danh sách chữ kiểm: "xác nhận",
   "chứng minh", "đúng", "mục tiêu", "địa hình"… (bổ sung từ log).
4. **(E) Kiểm ý nghĩa trước khi chạy họ.** Quan hệ giữa hai chỉ tiêu cộng được (số tuyệt đối) → chuẩn
   hoá theo dân số nếu có, nếu không thì cảnh báo "cả hai lớn theo quy mô tỉnh". Chuỗi tiền giá hiện
   hành → xét tốc độ tăng (%/năm), không xét điểm gãy của mức.
5. **(F, G)** Nhãn: giữ định ngữ của chỉ tiêu ("đã xét xử") trong chỗ trống; bỏ đơn vị trùng danh từ.
   Xu hướng cả nước: ưu tiên chuỗi dài nhất có trong kho.

Sau khi sửa: **chạy lại cả 12 câu** và so với `review.json` vòng này — bản sửa chỉ giữ nếu không làm
câu nào tệ đi.

## 7. Hạn chế của vòng này

- 12 câu do model sinh ra, "sạch" hơn câu thật của phóng viên; có nguy cơ tinh chỉnh theo kiểu câu tự
  nghĩ ra. Nên trộn câu thật khi có.
- Mỗi câu chạy 1 lần; GLM không tất định.
- Người rà soát là một model; các kết luận "sai ý" đều kèm số gốc (mục 4) để người kiểm lại được.
- Chưa kiểm giao diện (chip, hỏi tiếp, nhãn).
- Nghi vấn "đổi chuẩn nghèo" (q01) và "GINI 2020 giảm đột ngột" (q02) **chưa kiểm** với tài liệu phương
  pháp của NSO.
