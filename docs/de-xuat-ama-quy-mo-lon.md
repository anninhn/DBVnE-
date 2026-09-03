# Đề xuất: AMA ở quy mô 500+ dataset

**Trạng thái**: đã chốt 4/6 quyết định (xem §9) — sẵn sàng viết spec
**Ngày**: 2026-09-03, cập nhật cùng ngày sau khi chốt kế hoạch dữ liệu
**Bối cảnh**: kho vừa tăng từ 17 lên 495 dataset sau khi đưa 481 dataset Cục Thống kê vào

---

## 1. Vì sao phải thiết kế lại

Discovery Chat (Phase 2, spec 004) được thiết kế cho một kho nhỏ. Roadmap ghi rõ giả định:

> "50 datasets × ~400 tokens = ~20K input tokens, fits trong Claude context"
> — `constitution/roadmap.md` dòng 61

Giả định đó không còn đúng. Đo bằng `countTokens` của Gemini trên chính text mà
`flattenAllDatasets()` sinh ra:

| | Giả định gốc | Thực tế 2026-09-03 |
|---|---|---|
| Số dataset | 50 | **495** |
| Token/dataset | 400 | 410 |
| Token mỗi câu hỏi | 20.000 | **202.876** |

Vượt **10 lần** giả định. Kiến trúc không sai — nó chỉ đã ra khỏi phạm vi mà nó
được thiết kế cho.

## 2. Sáu vấn đề đo được

### 2.1 Chi phí tăng tuyến tính theo số dataset

Mỗi câu hỏi nạp **toàn bộ** metadata + dictionary của mọi dataset.

- 202.876 token input/câu → **$0,061/câu** (đơn giá paid tier Gemini 2.5 Flash:
  $0,30/1M input, $2,50/1M output — tra tại ai.google.dev/gemini-api/docs/pricing)
- Trần hiện tại trong code: 100 câu/người/ngày, 1.200 câu/hệ thống/ngày
  (`src/lib/r2/chat-log.ts`)
- Nếu dùng hết trần: **$73/ngày**

Chi phí này tăng tiếp mỗi lần thêm dataset, không phụ thuộc câu hỏi hỏi gì.

### 2.2 Rủi ro làm sập trang chủ — nghiêm trọng hơn chi phí

`flattenAllDatasets()` fetch `metadata.yaml` + `dictionary.md` của **từng** dataset:
**1.001 GitHub API call** mỗi lần cache miss. Cache TTL 60 giây.

Trần GitHub REST là 5.000 call/giờ. **5 lần cache miss là hết quota.** Và hết quota
thì trang chủ cũng chết theo, vì listing dùng chung `GITHUB_TOKEN`.

Đây là lỗi chờ xảy ra: chỉ cần 5 phóng viên hỏi trong 5 phút khác nhau.

### 2.3 Không có hội thoại đa lượt

`DiscoveryRequest` chỉ nhận `{ query, attachedSlug }`. Prompt gửi đi đúng 2 message:
`system` + `user`. **Không có lịch sử.**

Hệ quả: câu 2 không biết câu 1 đã hỏi gì. Hỏi "còn năm 2023 thì sao?" là AI không
hiểu "còn" là còn cái gì. Người dùng phải viết lại câu hỏi đầy đủ mỗi lượt.

### 2.4 Không trả lời được câu hỏi theo giá trị

AMA không nhìn thấy giá trị trong cột. `formatDataset` chỉ đưa vào prompt: tên cột,
kiểu, đơn vị, mô tả cột. `column_stats` không được đọc.

Nên câu "có dữ liệu nhiệt độ Đà Nẵng không" được trả lời bằng **suy luận** ("cột
Tỉnh, thành phố thì hẳn có Đà Nẵng"), không phải bằng dữ liệu. Suy luận đó đúng với
dataset phủ toàn quốc, **sai với dataset phủ một phần**:

> `nhiet-do-khong-khi-trung-binh-cac-thang-trong-nam` chỉ có **17 trạm quan trắc**,
> không phải 63 tỉnh. Có Đà Nẵng, **không có** Cần Thơ. AI không có cách nào biết.

Kể cả muốn đưa giá trị vào cũng chưa đủ dữ liệu: `column_stats` chỉ lưu **12 giá trị**
mỗi cột (`src/lib/ai/inspect/csv.ts` `.slice(0, 12)`). Cột 71 địa bàn lưu 12, mất 59.
Tệ hơn: 12 cái được lưu không phải "12 phổ biến nhất" mà là **12 dòng đầu bảng** —
vì mọi tỉnh đều xuất hiện đúng 30 lần nên sắp theo count là ngẫu nhiên. Đưa 12 cái đó
cho AI thì nó còn dễ kết luận sai rằng dataset chỉ có miền Bắc.

### 2.5 Có đường để AI bịa số

Prompt có chốt chặn ở `tools/prompts/discovery-chat.md` dòng 11: *"KHÔNG bịa con số…
KHÔNG đưa ra con số nếu không có trong metadata"*. Nhưng đó là **lời nhắc**, không phải
bảo đảm — và có một đường lách:

Khi user attach dataset, FOCUS block đưa vào **5 dòng dữ liệu đầu tiên**
(`FOCUS_SAMPLE_ROWS = 5`). Hỏi "so sánh Đà Nẵng với Hà Nội" mà trong 5 dòng đó tình cờ
có hai địa bàn này, LLM rất dễ trả lời như thể đó là toàn bộ dữ liệu. 5 dòng đầu của
file 2.130 dòng không đại diện cho gì cả.

Với nghề báo thì một con số sai đắt hơn nhiều so với một câu "chưa hỗ trợ".

### 2.6 Recall vốn đã là điểm yếu

Eval Phase 2 (`eval/reports/2026-07-24.json`, lúc kho có ~17 dataset):

| | |
|---|---|
| success_rate | 87,5% |
| avg_accuracy | 100% |
| **avg_recall** | **42,9%** |

FR-027 của spec 004 đã chốt "theo dõi recall theo thời gian, KHÔNG đặt ngưỡng". Nhưng
42,9% ở 17 dataset thì ở 495 dataset gần như chắc chắn tệ hơn — model chọn 1-2 dataset
thay vì tìm hết.

---

## 3. User story

Viết theo góc phóng viên, không phải góc hệ thống.

| # | Là phóng viên, tôi muốn… | …để | Hiện tại |
|---|---|---|---|
| U1 | hỏi bằng tiếng Việt tự nhiên và được chỉ đúng dataset | không phải đọc hết 495 tiêu đề | ✅ có, nhưng recall 42,9% |
| U2 | biết dataset có chứa **địa bàn/đối tượng cụ thể** tôi cần | không tải file về mới biết thiếu | ❌ AI đoán, có thể sai |
| U3 | hỏi tiếp mà không phải nhắc lại ngữ cảnh | theo đuổi một mạch điều tra | ❌ không có lịch sử |
| U4 | biết dataset **không có** cái tôi cần, càng sớm càng tốt | không mất thời gian vào ngõ cụt | ⚠️ AI thiên về trả lời "có" |
| U5 | biết dataset phủ khoảng thời gian nào | biết có so sánh theo năm được không | ⚠️ `year_range` trống 495/495 |
| U6 | hỏi thoải mái không lo tốn kém | không bị chặn giữa lúc đang làm bài | ⚠️ trần 100 câu/ngày vì chi phí |
| U7 | **so sánh, tính tăng trưởng trên dữ liệu thật** | viết được câu "Đà Nẵng tăng nhanh hơn Hà Nội 2,1 điểm" | ❌ ngoài scope Phase 2 — xem §4.5 |

U2, U3, U7 là ba thứ **chưa từng có**. U1/U4/U5 là có nhưng chưa đạt.

U7 khác hẳn về bản chất — nó không phải bài toán tìm kiếm mà là bài toán tính toán.
Đề xuất này **không** giải U7, nhưng phải xử lý cho đúng ranh giới (§4.5, §4.6).

---

## 4. Giải pháp đề xuất

### 4.1 Kiến trúc: tách "chọn" khỏi "trả lời"

Hiện tại một bước: nạp hết → hỏi. Đề xuất hai bước:

```
Câu hỏi
   │
   ├─ TẦNG 1: CHỌN ────────────────────────────────
   │    hybrid: embed câu hỏi + khớp từ khoá  (§4.1b)
   │    → ~20 slug liên quan nhất
   │
   └─ TẦNG 2: TRẢ LỜI ────────────────────────────
        nạp full metadata + dictionary + giá trị cột
        của ~20 dataset đã chọn  (~20 call)
        → AI trả lời + cite
```

### 4.1b Tầng 1 làm bằng gì — quyết định 2026-09-03: **hybrid retrieval**

Có hai cách làm tầng 1. Bản đầu của tài liệu này chọn cách 1; **quyết định cuối là
cách 2**, vì kế hoạch dữ liệu là "sắp đổ thêm vài nghìn dataset".

**Cách 1 — AI đọc catalog rút gọn rồi tự chọn.** Đo bằng `countTokens`:

| Nội dung tầng 1 | tok/dataset | 495 | 2.000 | 5.000 |
|---|---:|---:|---:|---:|
| slug + title | 45 | 22.436 | 90.000 | 225.000 |
| + category + description | 108 | 53.237 | **216.000** | 540.000 |

Chi phí tầng 1 **tăng tuyến tính theo số dataset**. Ở 2.000 dataset thì 216.000 token
— **tệ hơn cả cách hiện tại là 202.876**. Cách này chỉ đúng nếu kho dừng quanh 1.000.

**Cách 2 — hybrid retrieval.** Chi phí prompt **không phụ thuộc số dataset**:

| | |
|---|---|
| Nhánh dense | embed câu hỏi → cosine với vector của từng dataset → top-K |
| Nhánh keyword | khớp chính xác tên riêng, mã số, tên tỉnh — chỗ mà embedding hay trượt |
| Trộn hai nhánh | rồi lấy ~20 dataset cho tầng 2 |

Vì sao phải cả hai nhánh: vector mất từ chính xác (`Đà Nẵng`, mã ngành), keyword mất
từ đồng nghĩa (hỏi "lạm phát" mà dataset tên "Chỉ số giá tiêu dùng"). Mỗi nhánh bù
điểm yếu của nhánh kia — đây là mặc định trong production RAG, không phải chọn một.

| | Hiện tại | Cách 1 (495 ds) | Cách 1 (2.000 ds) | **Cách 2 (mọi quy mô)** |
|---|---:|---:|---:|---:|
| Token/câu | 202.876 | ~61.000 | ~224.000 | **~9.000** |
| Chi phí/câu | $0,061 | ~$0,018 | ~$0,068 | **~$0,006** |
| GitHub call/câu | 1.001 | ~21 | ~21 | ~21 |
| Số lần gọi AI | 1 | 2 | 2 | 1 + 1 embed |

**Hạ tầng cần thêm** — và đây mới là phần tốn công, không phải việc tìm kiếm:

- **Model**: `gemini-embedding-001` (giới hạn 2.048 token input) hoặc
  `gemini-embedding-2` (8.192) — cả hai đã dùng được trên key hiện tại. Text embed
  mỗi dataset ~139 token nên dư sức
- **Chi phí embed**: $0,15/1M token (`embedding-001`) hoặc $0,20/1M (`embedding-2`).
  2.000 dataset × 140 token = 280K token → **$0,04 một lần**. Không đáng kể
- **Lưu vector**: 1 file trong R2, không cần vector database. 2.000 × 768 chiều
  float32 ≈ 6 MB. Load vào memory, cosine 2.000 vector là vài chục ms
- **Quy trình cập nhật**: embed lại khi upload/sửa/xoá dataset. **Đây là phần thật
  sự phải thiết kế** — vector cũ mà metadata mới thì tìm ra kết quả sai lặng lẽ

### 4.1c Chỉ mục giá trị cho câu hỏi thực thể

Riêng loại "dataset nào chứa Đà Nẵng" thì cả LLM lẫn embedding đều **kém hơn** một
chỉ mục nghịch đảo `giá trị → danh sách slug`, dựng lúc upload:

- Chính xác tuyệt đối, đúng/sai rõ ràng — không phải chuyện tương đồng ngữ nghĩa
- 0 token AI
- Với dữ liệu thống kê Việt Nam thì tra theo thực thể địa lý là loại câu hỏi phổ
  biến nhất

Phụ thuộc §4.2 (lưu đủ giá trị cột) — không có danh sách giá trị thì không dựng được
chỉ mục.

### 4.2 Lưu đủ giá trị cột (giải U2, U4)

Đổi luật cắt trong `column_stats`:

```
cột phân loại có ≤ 200 giá trị khác nhau  → lưu HẾT
cột có > 200                              → giữ cắt 12 như cũ
```

Cột 71 địa bàn lưu đủ 71, thêm ~1 KB vào `metadata.yaml` (đang 2,3 KB). Cột phân tán
cao (tên bài báo, mã số) vẫn cắt, không phình.

Sau đó tầng 2 trả lời chắc chắn: **có** Đà Nẵng trong 17 trạm, **không có** Cần Thơ.

Cần script backfill 495 dataset đã có — đọc lại CSV từ R2, tính lại stats, cập nhật
`metadata.yaml`. **Không tốn token AI** vì chỉ đếm giá trị, không cần AI.

### 4.3 Hội thoại đa lượt (giải U3)

Thêm `history` vào `DiscoveryRequest`. Nhưng **không để phạm vi dính**:

```
Lượt 1: "có dữ liệu CPI không"          → tìm mới → 20 dataset
Lượt 2: "còn năm 2023 thì sao"          → viết lại "CPI năm 2023" → tìm mới
Lượt 3: "so với xuất khẩu thì thế nào"  → viết lại "xuất khẩu 2023" → tìm MỚI
```

Lịch sử dùng để **hiểu câu hỏi**, không dùng để **giới hạn phạm vi**. Giữ lại 20
dataset của lượt 1 nghe có vẻ tiết kiệm nhưng bẫy người dùng ngay khi họ đổi chủ đề:
đang hỏi dân số, chuyển sang xuất khẩu, hệ thống vẫn chỉ thấy dataset dân số và trả
lời "không có dữ liệu".

Chi phí thêm không đáng kể — vài trăm token lịch sử so với hàng chục nghìn token catalog.

### 4.4 Điền `year_range` (giải U5)

Trường đã có trong `IndexEntry` và index.json, nhưng **trống 495/495**. Trích từ cột
năm lúc upload là xong. Rẻ nhất trong cả đề xuất này, và catalog dữ liệu mà không lọc
được theo thời gian là thiếu trục quan trọng nhất.

---

### 4.5 Ranh giới: tìm dataset ≠ tính trên dữ liệu

Hai loại câu hỏi, hai bài toán khác nhau. Gộp chúng vào một luồng là nguồn gốc của
việc bịa số.

| | **Discovery** — "dataset nào có X" | **Data Q&A** — "so sánh X với Y" |
|---|---|---|
| Bản chất | retrieval | execution |
| Số liệu đến từ | không cần số liệu | **bắt buộc** từ engine, không từ LLM |
| Phạm vi | Phase 2, đề xuất này | **Phase 3e** đã chốt 2026-07-23 |

Roadmap mục 3e đã quyết cách làm, và ví dụ trong đó trùng đúng loại câu hỏi này:

> **Mục tiêu**: Phóng viên hỏi *"dân số HCM 2024 so với Hà Nội?"* → câu văn + bảng + chart
> **Approach**: Claude tool-use agent với tools `get_dataset_schema`, `run_sql_query`
> (read-only, row limit, timeout), `verify_result`. DuckDB query trực tiếp CSV từ R2.

**Tool call không hallucinate** — nó là code. LLM hallucinate ở hai chỗ khác: tự làm
số học trên số liệu trong context, hoặc suy khi không có dữ liệu. Nên tool calling là
hướng đúng.

**Nhưng nó chuyển rủi ro, không xoá.** Có tool rồi thì LLM không bịa số nữa — nó
**viết sai câu query**. Ba cái bẫy đã đo được trong chính 481 dataset NSO, cần đưa vào
spec 3e ngay từ đầu:

| # | Bẫy | Hệ quả nếu bỏ qua |
|---|---|---|
| 1 | Số lưu dạng chuỗi Việt Nam: `"71.995,50"` | DuckDB gán cột `VARCHAR`. `AVG()` lỗi, hoặc cast sai thành `71.995`. **Tầng query phải đọc `decimal_char`/`group_char` từ dictionary**, không để DuckDB tự suy |
| 2 | **187 file** trộn `CẢ NƯỚC` + 6 vùng + tỉnh trong cùng một cột | `SUM(...) GROUP BY` hồn nhiên là tính trùng ba lần. Query phải lọc cấp trước, mà LLM không biết nếu schema không nói |
| 3 | Giá trị chưa chuẩn hoá: `Qui Nhơn` / `Quy Nhơn`, `Hà Nội` / `Hà Nội (Láng)` | `WHERE tinh = 'Quy Nhơn'` mất một nửa dữ liệu, **không báo lỗi** |

Điều kiện để tool calling đủ tin: tool phơi ra primitive **đã** lọc cấp và **đã** parse
số theo dictionary; và kết quả **luôn kèm câu query + các dòng đứng sau con số**. Với
nghề báo đây không phải tính năng phụ — constitution ghi *"mỗi con số phải trace được nguồn"*.

### 4.6 Chặn bịa số ngay trong đợt này

Không làm 3e trong đợt này, nhưng phải bịt lỗ ở §2.5. Hai việc nhỏ:

1. **Phân loại ý định.** Câu thuộc loại tính toán thì trả lời thẳng là chưa làm được,
   kèm chỉ đường:

   > *"Câu này cần tính trên dữ liệu, AMA hiện chưa làm được. Dataset bạn cần là X —
   > cột `Y` chứa số liệu, phủ 2011–2020. Mở tab Preview hoặc tải về để xem."*

2. **Gắn cảnh báo cho 5 dòng mẫu** trong FOCUS block, hoặc bỏ hẳn. Nếu giữ thì prompt
   phải nói rõ đây là 5 dòng **đầu file**, không đại diện, CẤM dùng để kết luận về
   toàn bộ dữ liệu.

Thà nói không còn hơn đưa con số suy từ 5 dòng.

## 5. Phương án đã cân nhắc và loại

| Phương án | Vì sao loại |
|---|---|
| **Lọc từ khoá** (`SimpleFilterAdapter` chọn top 30) | Rẻ nhất (~12K token) nhưng chết vì từ đồng nghĩa: hỏi "lạm phát" mà dataset tên "Chỉ số giá tiêu dùng", hỏi "thất nghiệp" mà dataset là "Tỷ lệ thiếu việc làm". Thêm nữa `search()` dùng AND semantics — câu hỏi tự nhiên 8 token gồm cả "có", "nào", "không" thì không dataset nào khớp đủ → trả rỗng |
| **AI đọc catalog rút gọn rồi tự chọn** (§4.1b cách 1) | Đủ cho 495–1.000 dataset và không cần hạ tầng mới. Nhưng chi phí tầng 1 tăng tuyến tính: ở 2.000 dataset là 216K token, **tệ hơn cách hiện tại**. Kế hoạch dữ liệu là "sắp đổ thêm vài nghìn" → làm cách này rồi vài tháng sau đập đi làm embedding là làm hai lần |
| **Giữ nguyên, chỉ tăng cache TTL** | Giảm số lần cache miss nhưng không giảm token/câu, và làm câu trả lời cũ đi sau khi upload |
| **Cắt bớt dataset đưa vào prompt theo category** | Người dùng phải tự chọn category trước khi hỏi — trái mục đích của AMA là hỏi tự nhiên |

### Thứ khác cũng gãy ở "vài nghìn dataset"

Không chỉ AMA. `index.json` là **một file duy nhất** mà `listDatasets()` fetch mỗi lần
cache miss cho **trang chủ**:

| Số dataset | index.json |
|---|---:|
| 500 hôm nay | 521 KB |
| 2.000 | ~2,0 MB |
| 5.000 | ~5,1 MB |

Fetch + parse 5 MB JSON mỗi cache miss sẽ xoá sạch phần tối ưu SSR đã làm
(trang chủ 2,8s → 13ms nhờ chính index.json này).

Việc này **ngoài phạm vi spec AMA**, ghi lại để không bị bất ngờ: khi kho lên vài
nghìn thì cần index phân trang hoặc tách theo category, và đó là việc của luồng
catalog chứ không phải luồng chat.

---

## 6. Acceptance criteria

Đo bằng eval suite đã có (`scripts/eval-chat.mjs`, `npm run eval:chat`). Baseline
2026-07-24 ở 17 dataset: success 87,5% / accuracy 100% / recall 42,9%.

### Bắt buộc

| # | Tiêu chí | Cách đo |
|---|---|---|
| A1 | Token input/câu ≤ 15.000, **không tăng theo số dataset** | log `usage.prompt_tokens`, đo ở 495 và sau khi thêm dữ liệu |
| A2 | GitHub API call/câu ≤ 30 | đếm trong log |
| A3 | success_rate ≥ 87,5% (không tệ hơn baseline) | eval suite |
| A4 | avg_accuracy ≥ 95% (dataset được cite phải đúng) | eval suite |
| A5 | **avg_recall ≥ 70%** (baseline 42,9%) | eval suite, cần mở rộng gold set |
| A6 | Câu hỏi theo giá trị trả lời đúng cả hai chiều: "có Đà Nẵng" → có, "có Cần Thơ" → không | thêm gold question cho ca 17 trạm |
| A7 | Hỏi 3 lượt liên tiếp, lượt 3 hiểu được tham chiếu ở lượt 1 | thêm gold case đa lượt |
| A8 | Không hồi quy: trang chủ vẫn load bình thường khi AMA đang chạy | thử đồng thời |
| A9 | Câu hỏi tính toán ("so sánh tăng trưởng Đà Nẵng vs Hà Nội") MUST **không** trả về con số nào, mà chỉ chỉ đường tới dataset | thêm gold question loại này, kiểm không có chữ số trong câu trả lời |
| A10 | Attach dataset rồi hỏi tính toán cũng **không** ra số suy từ dữ liệu trong context | gold question có `attachedSlug` |
| A11 | Upload dataset mới → tìm được nó qua AMA trong vòng 1 lần cache | thêm dataset test rồi hỏi ngay |
| A12 | Sửa/xoá dataset → AMA không còn cite bản cũ | sửa title rồi hỏi lại |
| A13 | Câu hỏi thực thể ("dataset nào có Đà Nẵng") trả về **đầy đủ**, không phải mẫu | so với chỉ mục giá trị |

### Nên có

| # | Tiêu chí |
|---|---|
| B1 | Độ trễ tới token đầu tiên ≤ 4 giây (hiện ~2-3s một tầng) |
| B2 | Chi phí/câu ≤ $0,02 |
| B3 | `year_range` được điền ≥ 90% dataset dạng bảng |

### Việc phải làm trước khi đo được

Gold set hiện chỉ **8 câu** và `expected_dataset_slugs` để **rỗng hết** — nên recall
42,9% đang tính trên cơ sở yếu. Muốn dùng A5 làm tiêu chí nghiệm thu thì phải
curate lại: tối thiểu 25 câu, mỗi câu ghi rõ danh sách slug đúng. Đây là việc tay,
không tự động được, và **phải làm trước** vì không có thước đo thì không biết
giải pháp có hiệu quả.

---

## 7. Phân đoạn triển khai

| # | Việc | Giải quyết | Rủi ro | Phụ thuộc |
|---|---|---|---|---|
| 1 | Curate gold set ≥ 25 câu, điền `expected_dataset_slugs` | thước đo cho A3-A7 | thấp | — |
| 2 | **Hybrid retrieval**: embed 495 dataset → vector file R2, nhánh keyword, trộn, flatten top-20 | 2.1, 2.2 | **cao** | 1 |
| 2b | Quy trình cập nhật vector khi upload/sửa/xoá | A11, A12 | **cao** | 2 |
| 2c | Chỉ mục nghịch đảo `giá trị → slug` | A13, U2 | thấp | 3 |
| 3 | Nâng luật cắt `column_stats` + script backfill 495 dataset | 2.4, U2, U4 | thấp | — |
| 4 | Điền `year_range` lúc upload + backfill | U5 | thấp | — |
| 5 | Lịch sử hội thoại + viết lại câu hỏi (**đã chốt: trong phạm vi đợt này**) | 2.3, U3 | trung bình | 2 |
| 6 | Nới trần 100 câu/ngày sau khi chi phí giảm | U6 | thấp | 2 |
| 7 | **Phân loại ý định + cảnh báo 5 dòng mẫu** | 2.5, A9, A10 | thấp | — |

Chunk 7 nhỏ nhất nhưng nên làm **sớm nhất**: nó chặn việc đưa con số sai vào bài báo,
và độc lập hoàn toàn với các chunk khác (chỉ sửa prompt + FOCUS block).

Chunk 2 **không** còn gói gọn trong 2 file như bản đầu của tài liệu này: hybrid
retrieval cần thêm chỗ lưu vector, hàm embed, và quan trọng nhất là **quy trình giữ
vector đồng bộ với metadata** (chunk 2b). Vector cũ mà metadata mới thì tìm ra kết
quả sai một cách lặng lẽ — không có triệu chứng nào để phát hiện.

Chunk 3 và 4 độc lập, làm song song được. Chunk 2c phụ thuộc chunk 3.

Chunk 5 cần đổi cả `ChatBox.tsx` (giữ lịch sử phía client) và route.

Chunk 7 vẫn nên ship trước tất cả — nó độc lập và chặn con số sai vào bài báo.

---

## 8. Best practices tham khảo

Hai bài toán ở §4.5 có chuẩn ngành khác nhau. Ghi lại để đối chiếu khi thiết kế tiếp.

### Discovery (retrieval trên catalog)

| | |
|---|---|
| **retrieve-then-read hai tầng** | retriever chọn ứng viên, reader đọc kỹ. Chính là §4.1 |
| **Hybrid retrieval** | keyword (BM25) + dense (embedding) chạy song song rồi trộn. Vector mất từ chính xác (tên tỉnh, mã số), keyword mất từ đồng nghĩa — mỗi cái bù điểm yếu của cái kia. Đây là mặc định trong production RAG hiện nay, không phải chọn một |
| **Rerank** | tầng thứ ba khi danh sách ứng viên dài. Chưa cần ở 495 dataset |
| **Facet là ràng buộc cứng** | năm, nguồn, định dạng đặt ngoài model. Đừng để LLM tự suy "dataset này có năm 2023 không" |
| **Chuẩn metadata** | DCAT, schema.org/Dataset — cả hai đều đòi *temporal coverage*, *spatial coverage*, *publisher*. Google Dataset Search index theo schema.org/Dataset |

Đáng lưu ý: `year_range` đang trống 495/495 (§4.4). Nó không chỉ để lọc trên UI — nó là
trường mà cả chuẩn metadata lẫn tầng query đều cần.

### Data Q&A (tính trên dữ liệu)

| | |
|---|---|
| **LLM không bao giờ tự tính** | số liệu luôn đến từ engine |
| **Text-to-SQL + execute + self-repair** | sinh query → chạy → gặp lỗi thì sửa lại. Benchmark Spider/BIRD đẹp nhưng độ chính xác thực tế thấp hơn nhiều; roadmap của dự án cũng ghi *"Spider2/BIRD broken"* |
| **Guardrail ở tầng DB** | read-only, row limit, timeout — không phải ở tầng app |
| **Hiện câu query + dòng dữ liệu** | với nghề báo là bắt buộc, không phải cho power user |
| **Pin version dữ liệu** | reproducibility — cùng câu hỏi, cùng dataset version, cùng đáp án |

Hai thứ mà chuẩn ngành **không** nói mà dữ liệu này bắt buộc phải xử lý: định dạng số
Việt Nam và cột trộn cấp hành chính (§4.5, bẫy 1 và 2).

## 9. Quyết định

### Đã chốt 2026-09-03

| # | Quyết định | Hệ quả |
|---|---|---|
| 1 | **Curate gold set ≥ 25 câu trước khi sửa** | Chunk 1 là việc đầu tiên. A5 (recall ≥ 70%) dùng được làm cổng nghiệm thu |
| 2 | **Hội thoại đa lượt nằm trong đợt này** | Chunk 5 vào phạm vi spec 005 |
| 3 | **Bỏ 5 dòng mẫu, thay bằng danh sách giá trị cột** | Chunk 3 thành điều kiện tiên quyết cho chunk 7 |
| 4 | **Kho sắp lên vài nghìn dataset** | Tầng 1 làm **hybrid retrieval** ngay, không làm "AI đọc catalog rút gọn" rồi đập đi (§4.1b) |

Quyết định 4 là cái đổi nhiều nhất: nó biến chunk 2 từ "sửa 2 file" thành hạng mục có
hạ tầng riêng (vector store + quy trình đồng bộ), và thêm chunk 2b, 2c.

### Còn mở

5. **Trần câu hỏi/ngày**: chi phí giảm từ $0,061 xuống ~$0,006 mỗi câu — nới 100
   câu/người/ngày lên bao nhiêu? Trần hệ thống 1.200/ngày lên bao nhiêu?

6. **Phase 3e khi nào khởi động?** U7 là thứ phóng viên sẽ hỏi ngay khi thấy kho có
   500 dataset. Chunk 7 chỉ *từ chối cho tử tế* — nó mua thời gian, không giải quyết.
   Nếu 3e còn xa thì đường tạm là gì: hướng dẫn tải về, hay tab Preview có sẵn phép
   so sánh đơn giản?
