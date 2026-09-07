# Phase 0 — Research: Discovery Chat ở quy mô vài nghìn dataset

**Ngày**: 2026-09-03 | **Plan**: [plan.md](./plan.md)

Mọi con số trong tài liệu này đo trực tiếp trên dữ liệu thật, không ước lượng. Nguồn
đo và phần so sánh phương án đầy đủ: [`docs/de-xuat-ama-quy-mo-lon.md`](../../docs/de-xuat-ama-quy-mo-lon.md).

---

## R1 — Model embedding

**Decision**: `gemini-embedding-001`.

**Rationale**: Đã kiểm bằng cách gọi `GET /v1beta/models` với key hiện tại — cả
`gemini-embedding-001` (giới hạn 2.048 token input) và `gemini-embedding-2` (8.192)
đều dùng được. Text embed mỗi dataset khoảng 139 token nên giới hạn 2.048 dư sức, và
`embedding-001` rẻ hơn ($0,15/1M so với $0,20/1M). Dùng chung `GEMINI_API_KEY` sẵn có
nên không thêm cấu hình, không thêm dependency.

Chi phí embed 2.000 dataset ≈ 280K token ≈ **$0,04 một lần**.

**Alternatives considered**:
- `gemini-embedding-2` — giới hạn input cao hơn nhưng ta không cần, và đắt hơn 33%
- Model embedding của nhà cung cấp khác — thêm key, thêm cấu hình, không có lợi ích
  tương ứng ở quy mô này

---

## R2 — Nơi lưu vector

**Decision**: một object JSON trong R2, đọc vào memory mỗi lần cold start.

**Rationale**: 2.000 dataset × 768 chiều ≈ **6 MB**. Cosine trên 2.000 vector là vài
chục ms trong Node — không cần cấu trúc chỉ mục nào. `constitution/tech-stack.md`
§ Constraints cấm thêm PostgreSQL/vector database cho Phase 1, và ở quy mô này thì
cấm đó là đúng chứ không phải hạn chế.

Không commit vào git vì đây là **dữ liệu sinh ra, tái tạo được từ metadata** — commit
6 MB số thực làm git history vô dụng, trái nguyên tắc "GitHub cho metadata text".

**Alternatives considered**:
- Vector database (pgvector, Qdrant, Pinecone) — vi phạm G2, và 6 MB không đáng
- Commit vector vào git — trái nguyên tắc storage, và mỗi lần rebuild là một commit
  khổng lồ
- Tính embedding ngay lúc hỏi, không lưu — 2.000 lượt gọi embedding mỗi câu hỏi,
  vô lý

**Rủi ro đã biết**: serverless không giữ memory giữa các request, nên mỗi cold start
phải tải lại 6 MB. Xem R3.

---

## R3 — Cold start và độ trễ

**Decision**: tải chỉ mục vector theo yêu cầu, cache trong module scope, kèm một
biến thể rút gọn cho lần tải đầu.

**Rationale**: SC-012 đòi chữ đầu tiên trong 4 giây. Tải 6 MB từ R2 trong cùng vùng
mất khoảng vài trăm ms — chấp nhận được, nhưng phải đo. Cache ở module scope thì các
request nóng trong cùng instance dùng lại được, giống cách `flatten-metadata.ts` đang
cache 60 giây.

Nếu đo thấy không đạt 4 giây thì hạ chiều vector (nhiều model embedding cho phép cắt
chiều) hoặc lưu dạng nhị phân đóng gói thay vì JSON — cả hai đều không đổi kiến trúc.

**Alternatives considered**:
- Tính trước top-K cho các câu hỏi phổ biến — không giải được câu hỏi mới
- Chuyển sang một tiến trình chạy dài — trái Target Platform, thêm hạ tầng phải vận hành

---

## R4 — Giữ vector đồng bộ với metadata

**Decision**: ghi lại vector của **một dataset** ngay trong luồng upload/sửa/xoá, cộng
một script dựng lại toàn bộ để chữa khi lệch.

**Rationale**: Đây là phần rủi ro nhất của cả đợt, vì **lệch không có triệu chứng** —
vector cũ + metadata mới thì hệ thống vẫn trả lời, chỉ là trả lời sai dataset, và
không ai biết. Đó là lý do FR-032/FR-033 và SC-009 tồn tại.

Ghi từng dataset thay vì dựng lại tất cả: dựng lại 2.000 vector mỗi lần upload là
2.000 lượt gọi embedding cho một thay đổi. Ghi từng cái là 1 lượt.

Cần một dấu hiệu để phát hiện lệch: mỗi entry vector mang theo dấu vết của metadata
đã dùng để sinh nó, so được với metadata hiện hành. Script dựng lại báo ra danh sách
lệch trước khi sửa.

**Alternatives considered**:
- Dựng lại toàn bộ theo lịch (cron hằng đêm) — SC-009 đòi 5 phút, cron không đạt; và
  vẫn cần cơ chế phát hiện lệch
- Không lưu, tính lại mỗi lần — xem R2
- Chấp nhận lệch tạm — trái FR-032/FR-033, và đây đúng loại lỗi im lặng cần chặn

---

## R5 — Nhánh khớp từ khoá

**Decision**: viết mới trong `src/lib/retrieval/keyword.ts`, tính điểm theo tần suất
từ trên tên + mô tả + tên cột, có bỏ dấu và tách từ theo khoảng trắng.

**Rationale**: `SimpleFilterAdapter` sẵn có (`src/lib/search/simple-filter.ts`) **không
dùng lại được nguyên trạng** cho việc này: nó dùng AND — mọi token phải khớp
([dòng 101](../../src/lib/search/simple-filter.ts)). Câu hỏi tự nhiên "có dữ liệu nào
về lạm phát không" tách thành 8 token gồm cả `co`, `nao`, `khong` → không dataset nào
khớp đủ → trả rỗng.

Vẫn **dùng lại** hàm `normalize()` của nó (bỏ dấu, `đ`→`d`, lowercase) để hai chỗ
chuẩn hoá giống nhau. Không sửa `SimpleFilterAdapter` vì ô search trên trang danh mục
cần đúng AND: người dùng gõ từ khoá thì mong tất cả từ đều khớp.

**Alternatives considered**:
- Sửa `SimpleFilterAdapter` thành OR — làm hỏng ô search hiện tại
- Chỉ dùng vector, bỏ nhánh từ khoá — mất khả năng khớp tên riêng chính xác (FR-031):
  hỏi "Đà Nẵng" mà vector trả về dataset "gần nghĩa" thì sai hẳn
- Dùng thư viện BM25 — thêm dependency, vi phạm G1

---

## R6 — Trộn hai nhánh

**Decision**: chuẩn hoá điểm mỗi nhánh về [0,1] rồi cộng có trọng số, cắt top-20.
Trọng số khởi đầu 50/50, hiệu chỉnh bằng bộ đo.

**Rationale**: Không có cách nào chọn trọng số đúng mà không đo. Bộ đo 25 câu (US6) là
công cụ để hiệu chỉnh, và đó là lý do US6 phải làm **trước** — ghi rõ trong spec.

Cắt 20 theo quyết định đã chốt ở mục Clarifications: gấp 2–3 lần số đáp án đúng
thường gặp (2–8), ~8.000 token nên vẫn dưới ngưỡng SC-001 là 15.000.

**Alternatives considered**:
- Reciprocal Rank Fusion — chuẩn hơn về lý thuyết, nhưng thêm một tham số nữa phải
  hiệu chỉnh mà chưa có bằng chứng là hơn ở quy mô 495 dataset. Để dành nếu đo thấy
  cách cộng điểm không đạt SC-006
- Chỉ lấy hợp của hai nhánh, không tính điểm — mất thứ tự, mà thứ tự chính là thứ
  quyết định 20 cái nào được chọn

---

## R7 — Chỉ mục giá trị

**Decision**: một object JSON trong R2, dạng `giá trị đã chuẩn hoá → danh sách slug`,
dựng cùng lúc với chỉ mục vector.

**Rationale**: Câu hỏi "dataset nào có Đà Nẵng" là câu **đúng/sai rõ ràng**, không
phải chuyện tương đồng ngữ nghĩa. Chỉ mục nghịch đảo cho đáp án chính xác tuyệt đối,
0 token AI, nhanh hơn cả vector — và FR-036 đòi trả về **đầy đủ**, mà vector thì bản
chất là trả về top-K.

Chuẩn hoá khi dựng chỉ mục xử lý luôn việc cùng một đối tượng ghi nhiều cách
(`Qui Nhơn` / `Quy Nhơn`, `Hà Nội` / `Hà Nội (Láng)`) — FR-057 đòi việc này làm bên
trong năng lực.

Kích thước — **đã đo, ước lượng ban đầu sai 10 lần**: dựng thật trên 495 dataset ra
**2,75 MB**, không phải "vài trăm KB". Chỗ sai của ước lượng: giá trị thì trùng nhau và
chỉ lưu một lần, nhưng *danh sách dataset chứa nó* thì không — `Đà Nẵng` xuất hiện ở 178
chỗ, mỗi chỗ lưu cả slug (60 ký tự) và tên cột. Phần đó chiếm gần hết dung lượng.

Sửa bằng cách gộp slug và tên cột vào hai bảng dùng chung, entry chỉ giữ cặp chỉ số →
**797 KB** cho 495 dataset, tức khoảng **3 MB ở 2.000 dataset**. Vẫn tải được trong một
lượt và parse dưới 100 ms. Nếu không sửa thì ở quy mô spec nhắm tới nó là ~11 MB, đủ để
làm chậm mọi lần khởi động nguội.

**Alternatives considered**:
- Quét `column_stats` của từng dataset lúc hỏi — đúng nhưng phải đọc N metadata
- Nhét danh sách giá trị vào text embed — vector không trả lời được câu "đầy đủ", và
  làm loãng tín hiệu chủ đề

---

## R8 — Phân loại ý định câu hỏi

**Decision**: để chính model phân loại trong cùng lượt trả lời, dẫn bằng quy tắc trong
system prompt; không thêm một lượt gọi riêng.

**Rationale**: Thêm một lượt gọi chỉ để phân loại là thêm độ trễ và chi phí cho mọi
câu hỏi, trong khi model đã đọc câu hỏi rồi. Quy tắc trong prompt kiểm được bằng bộ đo:
SC-007 đòi **100%** câu hỏi tính toán không nhận về con số — đó là tiêu chí đủ chặt để
biết prompt có đủ hay không.

Nếu bộ đo cho thấy prompt không đạt 100% thì mới tách thành lượt gọi riêng. Đừng làm
trước khi có bằng chứng.

**Alternatives considered**:
- Một lượt gọi riêng để phân loại — thêm độ trễ cho mọi câu hỏi, giải quyết vấn đề
  chưa chắc tồn tại
- Khớp từ khoá ("so sánh", "tăng trưởng", "bao nhiêu") — dễ vòng tránh và dễ nhận sai:
  "có dữ liệu nào về tăng trưởng không" là câu tìm kiếm, không phải câu tính toán

---

## R9 — Viết lại câu hỏi theo ngữ cảnh

**Decision**: gộp vào lượt gọi tầng 1 — gửi kèm lịch sử cuộc trò chuyện và yêu cầu
model tự hiểu câu hỏi trong ngữ cảnh trước khi chọn dataset.

**Rationale**: FR-045 nói lịch sử dùng để **hiểu** câu hỏi, không dùng để **giới hạn**
phạm vi tìm kiếm. Cách này thoả đúng điều đó: câu hỏi đã hiểu đầy đủ được đưa vào
tìm kiếm mới, không mang theo danh sách dataset của lượt trước.

Lịch sử tốn vài trăm token — không đáng kể so với ngưỡng 15.000.

**Alternatives considered**:
- Một lượt gọi riêng để viết lại câu hỏi — thêm độ trễ, và SC-012 đã chặt (4 giây)
- Giữ lại 20 dataset của lượt trước làm phạm vi — vi phạm FR-045, và bẫy người dùng
  khi họ đổi chủ đề

---

## R10 — Ngưỡng lưu giá trị cột và việc điền lại dữ liệu cũ

**Decision**: ngưỡng **200 giá trị**; điền lại cho 495 dataset đã có bằng script đọc
file CSV từ R2, **không gọi AI**.

**Rationale**: Ngưỡng 200 đã chốt ở mục Clarifications, dựa trên số đo: 203 cột phân
loại của bộ NSO có median 32, p90 71, cao nhất 100 — ngưỡng 200 phủ trọn bộ hiện tại
và dư gấp đôi, vẫn cắt dữ liệu cấp xã/phường (~3.300 đơn vị).

Điền lại không cần AI vì việc này chỉ là **đếm giá trị trong file**. Chạy lại
`analyze` cho 495 dataset sẽ tốn ~$3 tiền AI và có nguy cơ AI viết lại mô tả khác đi —
mất công so lại. Script đọc CSV rồi cập nhật `metadata.yaml` là đúng việc.

**Alternatives considered**:
- Chạy lại `analyze` toàn bộ — tốn tiền và làm mô tả thay đổi ngoài ý muốn
- Chỉ áp ngưỡng mới cho dataset upload sau này — 495 dataset cũ vẫn không trả lời
  được câu hỏi theo giá trị, tức US3 thất bại với phần lớn kho

---

## R11 — Chiến lược kiểm chứng khi không có test framework

**Decision**: dùng bộ đo sẵn có làm cổng chính, `typecheck` + `lint` làm cổng phụ,
`quickstart.md` cho phần kiểm tay.

**Rationale**: Dự án không có test framework, và thêm một cái là thêm dependency →
cần phê duyệt riêng, ngoài phạm vi đợt này. Bộ đo `npm run eval:chat` lại đúng là công
cụ phù hợp cho phần lõi: SC-004 tới SC-008 đều là chỉ số mà nó đo được.

Phần bộ đo không phủ (giới hạn hạn mức, ngữ cảnh cuộc trò chuyện, đồng bộ vector sau
upload) đưa vào `quickstart.md` dạng kịch bản kiểm tay có bước rõ ràng.

**Alternatives considered**:
- Thêm Vitest — thêm dependency, cần phê duyệt; và phần đáng test nhất (chất lượng
  tìm kiếm) không phải thứ unit test kiểm được
- Không kiểm gì ngoài typecheck — 13 success criteria đều không chứng minh được

---

## Không còn NEEDS CLARIFICATION

Mọi mục trong Technical Context của `plan.md` đã có giá trị cụ thể. Bốn câu hỏi mở ở
tầng spec đã giải xong trong `/speckit-clarify` và ghi ở mục `## Clarifications` của
`spec.md`.

**Một mục đã hoãn có chủ ý** (ghi trong `checklists/requirements.md`): ai được phép gọi
năng lực tra cứu. Trong đợt này quyền chỉ là quyền đăng nhập sẵn có của trang hỏi đáp
(FR-001 spec 004). Phải chốt trước khi mở năng lực cho công cụ ngoài — không chặn đợt này.
