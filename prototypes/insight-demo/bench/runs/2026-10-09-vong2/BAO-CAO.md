# Báo cáo thử nghiệm harness insight — vòng 2

| | |
|---|---|
| Ngày chạy | 2026-10-09 |
| Phiên bản harness | commit `2cb4270` + các sửa của vòng này (chưa commit lúc chạy — `meta.json` ghi `dirty: true`) |
| Bộ câu hỏi | giống hệt vòng 1 — `../../questions.json` (12 câu, persona, kỳ vọng: xem `../2026-10-09-vong1/BAO-CAO.md` mục 2.1) |
| Phương pháp chạy và rà soát | giống vòng 1 (mục 2.2–2.3 báo cáo vòng 1); script `../../run-questions.mts` nay gọi chung `planAnalysis` với API |
| Dữ liệu thô | `trace.jsonl`, `review.json`, `meta.json` |

---

## 1. Đã sửa gì (4 hướng đã duyệt sau vòng 1)

| # | Nguyên nhân vòng 1 | Sửa | File |
|---|---|---|---|
| 1 | **A + B** — bỏ im lặng một vế; thiếu dữ liệu không được báo | Nhận **ý định** (quan hệ / xếp hạng / xu hướng / so sánh / một nơi / mở), **nơi được nhắc** (tỉnh, vùng, cả cách gọi đời thường), **mốc thời gian** ("20 năm qua", "từ 2020", "năm 2024") — luật trên chữ trước, model bổ sung. Ý định → họ do code quyết. **Thẻ "Phạm vi trả lời"** do code viết: trả lời được / chưa làm được / kho không có / lưu ý (63–34, chỉ tiêu đang dùng còn phương án khác). Hỏi quan hệ mà thiếu một vế → không trả thẻ vế kia | `v2/scope.ts`, `v2/plan.ts`, `v2/understand.ts` |
| 2 | **C** — nhận định định tính sai | Diễn biến tả bằng **các đoạn đổi chiều** (zigzag, ngưỡng 5% mức trung bình, tối đa 4 đoạn), mỗi đoạn có hướng + % thay đổi **cả đoạn** — vào chỗ trống do code điền. Kỷ lục chỉ khi **vượt** mọi năm trước (hoà thì không). Huy hiệu **năm thiếu**. Mốc "N năm qua / từ năm X" → chỗ trống mức thay đổi. **Bộ kiểm hướng**: câu chứa hai mốc số mà dùng chữ ngược chiều thật → trả về viết lại | `v2/analyze.ts`, `v2/rules.ts` |
| 3 | **D + E** — lời bình; phép thử vô nghĩa | Luật + bộ kiểm **lời bình** ("xác nhận", "chứng minh", "mục tiêu", "địa hình", "đúng ở"…). **Số tuyệt đối** (theo đơn vị + tên) → chia theo dân số tỉnh trước khi tính tương quan. **Chuỗi tiền giá hiện hành** → tăng bình quân %/năm, cấm "tăng tốc / nhanh hơn", huy hiệu "chưa trừ lạm phát" | `v2/rules.ts`, `v2/analyze.ts` |
| 4 | **F + G** — nhãn, đơn vị, chuỗi ngắn | Tên chỉ tiêu **giữ định ngữ** ("số vụ ly hôn đã xét xử") là chỗ trống bắt buộc. Bỏ đơn vị trùng tên chỉ tiêu; dọn "vụ vụ". Chuỗi cả nước dài hơn trong kho — **chỉ dùng khi số khớp chuỗi gốc ở các năm trùng** (đến chữ số cuối) | `v2/rules.ts`, `v2/catalog.ts`, `v2/analyze.ts` |

Giao diện: thêm khung "Phạm vi trả lời" trên các thẻ (`InsightPanel.tsx`), đã kiểm trên trình duyệt với q07.

### 1.1 Lỗi do chính bản sửa gây ra — bắt được trong vòng này

Lần chạy đầu của vòng 2, q03 ra thẻ "ly hôn **giảm đều**, thấp nhất chuỗi" — sai hoàn toàn. Nguyên nhân: sửa G
ban đầu chỉ so **nhãn** chỉ tiêu; chỉ tiêu ly hôn có nhãn chung "Tổng số" nên bị thay bằng chuỗi "Tổng số" của
dataset **tổng tỷ suất sinh**. Cũng vì so nhãn, hộ nghèo đa chiều bị thay bằng hộ nghèo chuẩn cũ.

Sửa hai lớp: (1) cùng chủ đề dataset + cùng đơn vị; (2) **dữ liệu phân xử** — chuỗi thay thế phải khớp chuỗi
gốc ở mọi năm trùng. Trên cả kho, lớp (1) còn 6 cặp; lớp (2) giữ 5 (GINI, hộ nghèo, thiếu việc làm, thất
nghiệp, tuổi thọ), loại 1 (giường bệnh mọi cơ sở → chỉ cơ sở thuộc Sở Y tế: không có năm trùng). Ngưỡng khớp
ban đầu (1%) loại nhầm GINI (0,42 / 0,43 năm 2018) và hộ nghèo (4,36 / 4,4) — chỉ khác làm tròn giữa hai bảng
NSO → đổi thành "khớp đến chữ số cuối của bảng làm tròn thô hơn".

Luật nhận diện cũng được thử riêng trên 12 câu (không gọi AI) trước khi chạy, bắt 4 lỗi: "diễn biến" bị nhận
thành tỉnh **Điện Biên** (so tên sau khi bỏ dấu); "đông dân nhất" không nhận là xếp hạng; "xu hướng chung"
bị hiểu là hỏi diễn biến; "31/12" trong tên chỉ tiêu làm siêu thị không được coi là số tuyệt đối.

Sau lần chạy đầu còn 5 lỗi nhỏ (phạm vi ghi "không có phát hiện" che lý do "chưa làm được"; ghi chú lặp phương
án; −4,3% trong 20 năm bị gọi "gần như đi ngang"; thiếu chữ "năm"; câu mẫu chữ thường) → sửa và **chạy lại cả
12 câu**. Số liệu dưới đây là lần chạy cuối.

## 2. Kết quả

### 2.1 So với vòng 1 (cùng thang)

Thang mới, áp lại cho vòng 1 để so được: **Trả lời đúng** · **Một phần, nói rõ phần thiếu** · **Từ chối đúng**
(không có gì trả lời được và nói rõ vì sao) · **Bỏ sót im lặng** · **Sai ý**.

| Kết luận | Vòng 1 | Vòng 2 |
|---|---|---|
| Trả lời đúng | 1 (q12) | 3 (q02, q03, q12) |
| Một phần, nói rõ phần thiếu | 0 | 4 (q01, q06, q07, q08) |
| Từ chối đúng | 1 (q11) | 5 (q04, q05, q09, q10, q11) |
| **Bỏ sót im lặng** | **7** | **0** |
| **Sai ý** | **3** (q02, q03, q07) | **0** |

| Chỉ số | Vòng 1 | Vòng 2 |
|---|---|---|
| Chọn đúng chỉ tiêu (khi kho có) | 12/12 | 12/12 |
| Bẫy chữ gần nghĩa bị từ chối | 3/3 | 3/3 |
| Số sai trong thẻ | 0 | 0 |
| Nhận định hướng / kỷ lục sai so với số gốc | 4 thẻ | **0** — đã đối chiếu mọi đoạn với chuỗi gốc |
| Lời bình ngoài dữ liệu | 3 câu | 0 (bộ kiểm) — nhưng 2 tít "càng… càng" nói quá (mục 4) |
| Tương quan giữa hai số tuyệt đối | 1 | 0 |
| Thẻ trên tổng | 15 | 9 |
| Thẻ phải dùng mẫu câu của code | 0 | 0 (lần chạy đầu: 1 — bộ kiểm bắt chữ số viết thẳng + "khẳng định") |
| Thời gian / câu (trung vị) | 16,8 giây | 14,1 giây (6,5–34,6; một lần hiểu câu hỏi mất 31,6 giây do model) |

Ít thẻ hơn là chủ đích: thẻ bối cảnh chỉ còn khi có kỷ lục / đổi chiều, và không trả thẻ thay cho vế không
trả lời được.

### 2.2 Từng câu

| # | Vòng 2 | Ghi chú |
|---|---|---|
| q01 | Một phần, nói rõ | Quan hệ đúng (59 tỉnh, r 0,73). "Xếp hạng tỉnh — chưa có". Nói đang dùng "cân nặng theo tuổi", còn 2 thể khác |
| q02 | Trả lời đúng | Quan hệ đúng; thẻ "GINI thấp nhất" (thực ra hoà) không còn. Tít "càng… càng" nói quá cho r −0,30 |
| q03 | Trả lời đúng | 2013→2018 +53,4% · 2018→2021 −21,2% · 2021→2022 +31,1%, 2022 cao nhất — khớp số gốc. Giữ "đã xét xử" |
| q04 | Từ chối đúng | "So sánh Bắc Trung Bộ – Nghệ An — chưa có". Chưa cảnh báo đổi chuẩn nghèo |
| q05 | Từ chối đúng | Xếp hạng chưa có + "câu hỏi theo 34, dữ liệu theo 63, quy đổi chưa có" |
| q06 | Một phần, nói rõ | Vùng chưa có. Thẻ cả nước đúng số (giảm, tăng, giảm; thiếu 2006). Văn lủng củng |
| q07 | Một phần, nói rõ | **Trả lời thẳng: so với 2004 giảm 4,3%**; các đoạn đúng (+16,8% đến 2013, −10% đến 2022, đi ngang). ĐBSCL chưa có |
| q08 | Một phần, nói rõ | So sánh hai thành phố chưa có. Bán lẻ: đợt giảm 2019–2021 đúng, giá hiện hành, 14,7%/năm. Siêu thị: thiếu 2006–2012 |
| q09 | Từ chối đúng | "Kho chưa có chỉ tiêu cho giá nhà chung cư" |
| q10 | Từ chối đúng | Thiếu tử vong do ung thư → quan hệ chưa làm được; không trả thẻ tuổi thọ |
| q11 | Từ chối đúng | Nói rõ hai khái niệm kho không có |
| q12 | Trả lời đúng | Không còn "nhận định đúng ở tầm quốc gia". Tít "càng… càng" nói quá cho r −0,37 |

## 3. Điều vòng 2 cho thấy

1. **Thẻ phạm vi xoá được loại lỗi lớn nhất** (bỏ im lặng 7 → 0) mà không cần thêm họ giả thuyết nào. Nhưng
   giá trị thật cho phóng viên mới tăng ở 3 câu; 9/12 câu vẫn là "một phần" hoặc "từ chối" — **hệ thống trung
   thực hơn, chưa hữu ích hơn bao nhiêu**. Muốn hữu ích hơn phải thêm họ: số liệu một tỉnh/vùng (q04, q06, q07,
   q08), xếp hạng (q01, q05), quy đổi 34 (q05).
2. **Đưa sự thật định tính vào chỗ trống hiệu quả**: 0 nhận định sai hướng; câu "giảm từ 6.765 còn 7.127" không
   còn. Bộ kiểm hướng chưa phải bắt lần nào ở lần chạy cuối — AI chép đúng khi được đưa sẵn.
3. **Mọi bản sửa dựa trên tên đều cần dữ liệu phân xử.** Sửa G so tên đã gây lỗi nặng hơn lỗi nó định sửa;
   chỉ chạy lại cả bộ mới thấy. Đây là lần thứ ba cùng một bài học (vòng 1: vai trò cột; bậc 1: chọn chỉ tiêu
   theo chữ).
4. **Lời dặn trong "ý chính" bị AI chép ra** ("Phát hiện này chỉ nói về…", "đây là ý trả lời trực tiếp…"). Lời
   dặn cách viết phải tách khỏi nội dung.
5. **Chạy lại cả bộ sau mỗi sửa là bắt buộc**: bắt được lỗi ly hôn (do sửa G) và lỗi Điện Biên (do luật địa danh).

## 4. Lỗi còn lại — đề xuất cho vòng 3

| Mã | Lỗi | Câu | Đề xuất |
|---|---|---|---|
| V1 | AI chép lời dặn nội bộ thành văn | q06, q08 | Tách `y_chinh` (nội dung) với `cach_viet` (lời dặn); thêm bộ kiểm cụm "phát hiện này", "ý trả lời", "trả lời thẳng" |
| V2 | Số đếm thiếu danh từ: "trên 59", "mới có 13" | q01, q08 | Chỗ trống số đếm mang sẵn danh từ ("59 tỉnh", "13 năm") như đã làm với "20 năm" |
| V3 | Tít "càng… càng" cho tương quan yếu–vừa | q02, q12 | Cấm "càng… càng" khi \|r\| < 0,6 (luật theo mức, sinh từ `describeR`) |
| V4 | "tỷ"/"tỉ" tách thành hai khái niệm | q03 | Chuẩn hoá chính tả trước khi so trùng |
| V5 | Đoạn tăng của chuỗi tiền dài (+3.991%) đúng nhưng vô ích | q08 | Chuỗi tiền: chỉ tả các đợt GIẢM + tăng bình quân |
| V6 | Đổi chuẩn đo (chuẩn nghèo) không được cảnh báo | q01, q04 | Cần thông tin phương pháp từ metadata — chưa có trong kho |

Ngoài lỗi: nhóm việc **thêm họ** (một tỉnh/vùng, xếp hạng, quy đổi 34) là bậc 2 trong lộ trình, không phải sửa lỗi.

## 5. Hạn chế

- Như vòng 1: câu hỏi do model sinh; mỗi câu chạy một lần; người rà soát là một model (mọi kết luận về hướng
  đều đối chiếu với chuỗi gốc lưu trong `trace.jsonl`, trường `cards[].raw.series`).
- Bộ câu hỏi giữ nguyên giữa hai vòng nên kết quả vòng 2 **có thiên lệch về phía bộ này** — các sửa được thiết
  kế sau khi xem đúng 12 câu này. Cần câu mới (tốt nhất là câu thật của phóng viên) để biết sửa có tổng quát không.
- Giao diện chỉ kiểm với q07 (khung phạm vi + thẻ).
