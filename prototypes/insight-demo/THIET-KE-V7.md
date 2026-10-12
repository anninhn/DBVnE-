# Harness insight — thiết kế v7

> **Đã có v8 (2026-10-09): `v8/THIET-KE-V8.md` + `v8/harness.html`.** v7 khớp vào dữ liệu thống kê — bài toán thật là số liệu có nguồn gốc cho phóng viên (xem v8 mục 1). File này giữ làm lịch sử.

> Ngày: 2026-10-09 · Branch `insight-harness-demo` · Thay v6 làm thiết kế hiện hành.
> v6 (`THIET-KE-V6.md`) giữ làm lịch sử: số đo bậc 0, đọc file không đồng nhất (mục 14–15), kết quả bậc 1
> (mục 16), nhìn lại overfit (mục 17). Báo cáo vòng thử: `bench/runs/2026-10-09-vong1`, `…-vong2`.

v7 đổi **xương sống**: từ "họ giả thuyết trên bảng NSO" sang **phép truy vấn cơ bản trên dữ liệu đã có hồ sơ
ngữ nghĩa**. Lý do: sau hai bậc build, hai vòng thử và đối chiếu với bản nháp paper *Making Newsroom Data
Findable and Answerable* (mục 1–4), harness hiện tại đúng nguyên tắc nhưng khớp quá chặt vào kho NSO; kho
sẽ nhiều dữ liệu, nhiều hình dạng, nhiều định dạng hơn.

---

## 1. Học được gì từ build (đối chiếu với paper — paper viết TRƯỚC khi build)

| Giả thuyết của paper | Bằng chứng từ build | Kết luận |
|---|---|---|
| Để code tính số thì số đáng tin | 0 số sai qua 24 lượt hỏi | Xác nhận |
| Cách tổ chức dữ liệu giới hạn câu hỏi trả lời được | Harness chỉ làm được "tỉnh × năm"; 10 dataset bị bỏ qua; overfit (v6 mục 17) | Xác nhận mạnh |
| Code mapping giữa nguồn là chỗ khó | Lỗi nặng nhất vòng 2 là mapping theo tên (ly hôn ↔ mức sinh); hai bảng NSO cùng chỉ tiêu lệch do làm tròn | Xác nhận |
| Fixed query đơn giản là lõi | 5/12 câu thất bại cần xếp hạng, so nơi, thay đổi N năm, gộp 63→34 | Xác nhận (bằng chứng yếu — câu tự sinh) |
| Model chỉ viết câu quanh con số là an toàn | Số đúng 100% nhưng 4 thẻ sai **ý** (hướng, kỷ lục, hoà, "đi ngang") | **Bác** — cần "nhận định đúng", không chỉ "số đúng" |
| Việc làm "lúc hỏi" kém tin cậy hơn "trước khi hỏi" | AI chọn chỉ tiêu theo nghĩa lúc hỏi: 12/12, bẫy 3/3; mọi lỗi ở chỗ AI **tự suy sự thật** | **Điều chỉnh** — ranh giới là loại việc (chọn nghĩa / suy sự thật), không phải thời điểm |
| 3 yêu cầu: tìm dữ liệu, số đúng có nguồn, so giữa nguồn | Lỗi phổ biến nhất là **không biết mình không trả lời được** (7/12) | **Thiếu** yêu cầu "nói rõ phạm vi" |
| Review của người là thước đo khả năng mở rộng | Dữ liệu phân xử thay được một phần (giữ 5/6 cặp chuỗi); lỗi ý do người rà soát độc lập có số gốc bắt | Điều chỉnh — review cần, một phần tự động được |
| Đo độ chính xác mapping | Đo trên nguồn đã thấy sẽ đẹp mà vẫn overfit | **Thiếu** — phải đo trên dữ liệu / câu hỏi để dành |
| (không bàn) | "Có ý nghĩa thống kê" ≠ "đáng viết"; độ trễ 14–29 giây do model, dao động gấp đôi | Bổ sung |
| Chuyển bảng là nút thắt | Kho đã tidy sẵn → chưa gặp; 4 XLSX đọc đúng 13/13 sheet trong script; 9/13 là **danh sách** | **Chưa kiểm** — ưu tiên kiểm ở v7 |

## 2. Năm yêu cầu, sáu nguyên tắc

**Yêu cầu:** (1) tìm đúng dữ liệu; (2) **nhận định** đúng, truy được nguồn; (3) so được giữa nguồn; (4) **nói
rõ phạm vi** — phần nào trả lời được, phần nào chưa, cái gì kho không có; (5) đủ nhanh cho deadline.

**Nguyên tắc:**
1. **AI chọn theo nghĩa trong các phương án đã xác minh; không suy sự thật.**
2. **Code tính cả số lẫn nhận định** (hướng, kỷ lục, hoà, so sánh) → chỗ trống; AI viết câu nối; bộ kiểm.
3. **Dữ liệu phân xử, không phải tên** — mọi mapping (chủ thể, chỉ tiêu, đơn vị) phải qua kiểm bằng dữ liệu
   hoặc bảng tham chiếu.
4. **Việc khó làm một lần, lưu, có xác minh** (cách đọc, hồ sơ, mapping) — không làm lại mỗi lần hỏi.
5. **Phạm vi suy ra từ điều kiện cần** của phép tính — không từ danh sách luật chữ.
6. **Đo trên dữ liệu và câu hỏi chưa từng xem.** Không sửa bằng luật chữ.

## 3. Kiến trúc

```
 Câu hỏi
   │
 [5] Điều phối ─ AI-1: câu hỏi → kế hoạch có cấu trúc (2 lần đọc)
   │              AI-2: chọn mã chỉ tiêu / chủ thể trong ứng viên đã xác minh
   │              code: kế hoạch → các phép [3]; điều kiện không đạt → phạm vi
   │              AI-3: viết lời quanh chỗ trống + bộ kiểm
 [4] Họ insight ─ tổ hợp phép [3] + luật "đáng viết" đọc từ hồ sơ (khi được hỏi / làm bối cảnh)
 [3] Phép truy vấn cơ bản ─ tất định, khai điều kiện cần, trả giá trị + nguồn + nhận định đã tính
 [2] Hồ sơ ngữ nghĩa + mapping ─ hình dạng, chủ thể→bảng tham chiếu, thời gian, số đo→mã chung
 [1] Cách đọc ─ file thô → quan sát / bản ghi (đặc tả JSON + bộ thực thi), đã xác minh, lưu theo sha
 [0] Kho + tìm kiếm (có sẵn) ─ tìm được cả file chưa có cách đọc
 [6] Khám phá (sau cùng) ─ agent viết code CHỈ trên API [1]–[3]; cách đọc nó tạo ra quay về [1] để xác minh
```

### [1] Cách đọc
Đặc tả JSON (sheet, dòng header, dòng nhóm, xoay cột năm, ghép cột chủ thể…) do **code** thực thi; sinh
bằng hai lần đọc độc lập + hợp đồng (v6 mục 14). Trạng thái *chưa xác minh / đã xác minh*; lưu theo sha
file. CSV tidy → cách đọc gần rỗng. Vẫn **đọc tại chỗ** — không kho chuỗi; cách đọc + hồ sơ là metadata.

### [2] Hồ sơ ngữ nghĩa + mapping
Schema: `src/lib/insight/v7/profile.ts`. AI đề xuất → code kiểm bằng dữ liệu → người upload xác nhận chỗ
không chắc (không hàng đợi, không chặn người hỏi).

| Trường | Phân xử bằng |
|---|---|
| Hình dạng: chuỗi quan sát / bản ghi / không gian / tài liệu | cấu trúc sau khi đọc |
| Chủ thể → bảng tham chiếu cắm được (tỉnh 63/34 + bảng tương ứng, xã 2025, sau: ngành, nước, trạm) | giá trị khớp bảng tham chiếu |
| Thời gian: cột, nhịp, mốc cố định, dấu sơ bộ | đọc được, liên tục |
| Số đo → **mã chỉ tiêu chung** (bảng mã nhẹ, lớn dần); loại; cộng được; mẫu số; **hệ số đơn vị**; **gốc giá**; **chuẩn đo**; `sumOf` | tổng các phần = tổng; số trùng năm khớp chỉ tiêu cùng mã ở nguồn khác (sau quy đơn vị, khớp đến chữ số làm tròn) |

Hồ sơ thay các hàm TẠM của v6 (`isExtensive`, `isNominalMoney`, `measureName`, `subjectOf`, regex ý định).

### [3] Phép truy vấn cơ bản

| Phép | Điều kiện cần |
|---|---|
| `tra(chỉ tiêu, chủ thể, thời gian)` | có chủ thể + thời gian |
| `thay_doi(…, t1, t2)` | có hai mốc; tiền → nêu gốc giá |
| `dien_bien(chỉ tiêu, chủ thể)` | ≥ 4 mốc (các đoạn đổi chiều — v6 vòng 2) |
| `xep_hang(chỉ tiêu, cấp, thời gian, nhóm?)` | ≥ N chủ thể cùng cấp |
| `so_sanh(chỉ tiêu, [chủ thể], thời gian)` | cùng danh mục hoặc quy đổi được |
| `quy_doi(chỉ tiêu, danh mục đích)` | **cộng được** + bảng tương ứng; tỷ lệ → cần mẫu số |
| `binh_quan(chỉ tiêu, mẫu số)` | mẫu số cùng chủ thể + thời gian |
| `quan_he(x, y, cấp, thời gian, nhóm?)` | ≥ N chủ thể chung; số tuyệt đối → chia mẫu số trước |
| `dem / gop(bản ghi, theo…)` | hình dạng bản ghi |

Mỗi phép trả **giá trị + nguồn** (file, sheet, dòng/cột, sha) + **nhận định đã tính**; không đủ điều kiện
→ lý do có cấu trúc → thẻ phạm vi gom lại.

### [4] Họ insight
Tổ hợp phép [3] + luật "đáng viết" (kỷ lục đã được chờ đợi, số tuyệt đối theo quy mô, chuỗi tiền) đọc từ
hồ sơ. Chạy khi người hỏi "có gì hay" hoặc làm bối cảnh — không thay câu trả lời.

### [5] Điều phối
3 điểm AI như v6, đổi vai: AI-1 ra **kế hoạch** (ý định, chủ thể, thời gian, chỉ tiêu dạng chữ) thay regex;
AI-2 chọn mã; code ghép phép + kiểm điều kiện; AI-3 viết lời. **Không text-to-SQL** trong luồng chuẩn.

### [6] Khám phá
Sau cùng; chỉ trên API [1]–[3]; cách đọc nó tạo ra phải quay về [1] để xác minh — nếu không, nó là "đọc
file lúc hỏi, không lưu, không kiểm" mà paper (mục 3.8) và build đều cho là kém tin cậy.

## 4. Code hiện có đi đâu

| Giữ → tầng | Bỏ / thay |
|---|---|
| Chỗ trống, bộ kiểm câu chữ + hướng (`v2/narrate`, `v2/rules`) → [5] | Hàm TẠM trong `v2/rules.ts` → trường hồ sơ |
| Các đoạn đổi chiều, BH, kỷ lục/hoà, năm thiếu (`v2/analyze`) → [3]/[4] | Regex ý định / bí danh địa danh (`v2/scope`) → AI-1 + bảng tham chiếu |
| `geo.ts` (63/34, tương ứng) → bảng tham chiếu [2] | `longestNation` → mapping mã chỉ tiêu có dữ liệu phân xử |
| Danh mục + tìm chỉ tiêu (`v2/catalog`) → ứng viên cho AI-2 | Hai họ gắn cứng tỉnh/vùng → viết lại trên `quan_he`, `dien_bien` |
| Đọc XLSX hai lần + hợp đồng (`bench/xlsx-two-readings.mjs`) → [1] | Giả định "tỉnh ≥ 50" của danh mục |
| Phạm vi trả lời, giao diện chip / thẻ / khung phạm vi → [5] | |

Luồng v2 (bậc 1) vẫn chạy trong app trong lúc làm v7.

## 5. Đánh giá

| Thành phần | Nội dung | Ở đâu |
|---|---|---|
| Bộ dataset đa dạng | 23 dataset: NSO nhiều dạng; XLSX danh sách, sự kiện, quý/34 tỉnh, tham chiếu; GeoJSON; bài báo; rừng hai nguồn; cảng hàng không; điểm thi 429 MB; thủ tục hành chính | `bench/v7/pilot-datasets.json` |
| Nhãn đúng hồ sơ | Claude Code gắn, **Ninh duyệt** | `bench/v7/gold-profiles.json`, bảng duyệt `bench/v7/DUYET-NHAN.md` |
| Câu hỏi để sửa | 12 câu vòng 1–2 | `bench/questions.json` |
| Câu hỏi **để dành** | 15 câu do một agent riêng sinh; người xây harness **không đọc**, chỉ script chạy thử đọc | `bench/heldout/questions.json` |
| Kiểm biến đổi | đổi tên cột, đổi đơn vị, đảo dòng, bản 34 tỉnh → kết quả không đổi (hoặc đổi đúng cách) | bước 2 |
| Thước đo | độ chính xác hồ sơ / mapping (theo trường); tỷ lệ cần người xác nhận; thang 5 mức của vòng 2; số nhận định sai; độ trễ; **số luật chữ trong code** (phải giảm) | |

## 6. Thứ tự làm

| Bước | Làm gì | Xong khi |
|---|---|---|
| **1** | Schema hồ sơ ✅ · bộ dataset ✅ · nhãn đúng (chờ duyệt) · bộ đề xuất hồ sơ (AI, hai lần đọc) · bộ kiểm hồ sơ bằng dữ liệu · cách đọc [1] cho các file không tidy | Đo độ chính xác hồ sơ trên 23 dataset; tỷ lệ cần người xác nhận; thời gian / dataset |
| **2** | Phép [3] + điều phối [5] mới + phạm vi từ điều kiện | Bộ để dành + kiểm biến đổi; so với vòng 2 |
| **3** | Hai họ insight viết lại trên phép [3]; bỏ hàm TẠM | Bộ sửa không tệ đi, bộ để dành tốt lên; số luật chữ giảm |
| **4** | Xác nhận hồ sơ trong upload wizard | Quyết định sản phẩm — làm riêng |
| **5** | Khám phá | Khi log cho thấy cần |

## 7. Quyết định (2026-10-09)

- Ninh duyệt nhãn đúng; các quyết định còn lại Claude Code tự chốt:
  - Câu hỏi để dành do agent riêng sinh, niêm phong.
  - Hồ sơ nằm riêng trong harness lúc pilot (không đụng wizard / metadata.yaml).
  - Tài liệu thành v7 (đổi xương sống), v6 giữ làm lịch sử.
- Không text-to-SQL trong luồng chuẩn; khám phá để cuối, có điều kiện.
- Không sửa lỗi harness bằng luật chữ mới.

## 8. Rủi ro

| Rủi ro | Giảm bằng |
|---|---|
| Nhãn đúng do chính Claude Code gắn → đo AI đề xuất hồ sơ bằng thước của cùng họ model | Ninh duyệt; chỗ không chắc đánh dấu; trường kiểm được bằng dữ liệu thì để bộ kiểm quyết, không dựa nhãn |
| Schema hồ sơ phình ra theo từng file lạ (overfit ở tầng mới) | Chỉ thêm trường kiểm được; ghi lý do thêm; đo trên dataset chưa dùng khi thiết kế |
| Bảng mã chỉ tiêu chung thành dự án lớn | Bảng nhẹ, chỉ thêm mã khi có hai nguồn cần so (kiểu Our World in Data) |
| Chậm hơn (thêm bước kế hoạch) | Gộp hiểu câu hỏi + kế hoạch vào một lời gọi; chạy song song |
