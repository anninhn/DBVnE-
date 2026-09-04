# Đề xuất thiết kế lại — Data Platform tòa soạn theo kiến trúc 3 lớp

> **Trạng thái**: đề xuất độc lập, viết 2026-08-26. Thiết kế "từ trang trắng" — không ràng buộc bởi các quyết định hiện tại của project, nhưng có phụ lục đối chiếu để biết cái gì tái dùng được.
> **Người viết**: Claude (phiên review 2026-08-26), theo yêu cầu của Ninh.

---

## 0. Giả định

- Đích cuối không đổi: phóng viên hỏi câu bất kỳ bằng tiếng Việt ("diện tích rừng tự nhiên VN thay đổi thế nào qua các năm?") → nhận **câu trả lời + con số + chart + nguồn kiểm chứng được**.
- Người dùng: ~7 người giai đoạn đầu → 50 → 300 phóng viên. Non-tech là số đông.
- Nguồn lực thật: 1 người build chính (data journalist biết code, làm việc cùng AI agent) + biên tập viên góp thời gian curate. Không có team engineering riêng.
- Hạ tầng rẻ hoặc miễn phí là ưu tiên; không vendor lock-in.
- Tài sản sẵn có (codebase Next.js, R2, upload wizard, connector spike NSO) **được phép tái dùng** nhưng không phải ràng buộc thiết kế.

---

## 1. Sản phẩm trong một câu

> **Một kho dữ liệu ba lớp, nơi mọi file vào được ngay (lớp Gốc), dữ liệu thống kê được máy chuẩn hoá thành bảng quan sát tra được (lớp Chuẩn), và một cuốn catalog giàu ngữ nghĩa (lớp Tri thức) cho phép AI agent trả lời câu hỏi bằng con số thật — không phải con số nó nghĩ ra.**

Ba persona, ba giao diện trên cùng một kho:

| Persona | Cần gì | Giao diện |
|---|---|---|
| Phóng viên (số đông) | con số + cảnh báo + chart, trong 10 giây | Chat |
| Biên tập viên | đưa data vào kho, kiểm soát chất lượng | Upload wizard + review queue |
| Data journalist | raw data, query tự do, pipeline riêng | Browse/download + API/MCP |

---

## 2. Năm nguyên tắc bất biến

1. **File gốc là sự thật, mọi thứ khác là dẫn xuất.** Lớp Chuẩn và mọi index xoá được, sinh lại được từ lớp Gốc + config. Không dữ liệu nào chỉ tồn tại ở dạng dẫn xuất.
2. **Mỗi nguồn là một bộ khép kín.** Không merge hai nguồn thành một hệ số liệu. Khi hai nguồn cùng trả lời một câu hỏi, hệ thống trình cả hai kèm khác biệt — không chọn hộ.
3. **Con số là bản sao, không phải sản phẩm của LLM.** Mọi số trong câu trả lời phải trace về một tool call; mọi phép tính do engine SQL làm; cảnh báo (sơ bộ/đơn vị/footnote) do UI render từ dữ liệu, không do LLM viết. Kiểm bằng code sau khi generate.
4. **Lỗi không được xảy ra âm thầm.** Mọi phép biến đổi dữ liệu đi qua mapping tường minh + bộ kiểm định giá trị tự động; cái gì máy không chắc thì vào hàng đợi người duyệt, không đoán.
5. **Mỗi phase phải tự đứng được và đo được.** Không phase nào ship mà không có exit criteria bằng số.

---

## 3. Kiến trúc

```
                        ┌─────────────────────────────────────────┐
  Người dùng            │  Chat (PV)   ·   Web catalog   ·  API/MCP│
                        └───────────────────┬─────────────────────┘
                        ┌───────────────────┴─────────────────────┐
  Mặt phẳng trả lời     │  Agent + 5 tools + hậu kiểm số + chart   │
                        └───────────────────┬─────────────────────┘
             ┌──────────────────────────────┼──────────────────────────┐
             │                              │                          │
  L3 TRI THỨC (catalog)   L2 CHUẨN (observation store)     L1 GỐC (object store)
  metadata 3 cấp          Parquet tidy per bộ nguồn         R2: mọi file nguyên gốc
  hybrid search           + bảng tidy per dataset upload    hash, bất biến
  alias + registry        DuckDB làm query engine           manifest trong git
             ▲                              ▲                          ▲
             └────────── sinh tự động ──────┴───── upload/connector ───┘
                        ┌─────────────────────────────────────────┐
  Mặt phẳng nạp         │ Connector per nguồn (máy) · Flatten wizard│
                        │ (LLM đề xuất + người duyệt) · Validation  │
                        └─────────────────────────────────────────┘
```

### L1 — Lớp Gốc (Object store)

Mọi file — CSV, Excel merged cells, PDF, MP3, GeoJSON — vào thẳng, nguyên vẹn, không điều kiện. R2 lưu file; git lưu manifest (`metadata.yaml` + hash + nguồn + người upload). Đây là lớp audit: mọi con số ở tầng trên đều truy ngược về một file + một commit ở đây.

Quyết định thiết kế: **upload không bao giờ bị chặn vì file "bẩn"**. File bẩn chỉ không được lên L2 — nó vẫn tìm được, tải được, hỏi metadata được.

### L2 — Lớp Chuẩn (Observation store)

Trái tim của khả năng "trả con số". Gồm hai loại bảng, đều là **Parquet, query bằng DuckDB**:

**(a) Observation store per bộ nguồn** — cho nguồn thống kê có cấu trúc (NSO, World Bank...). Khuôn cột sống cố định + chiều tự do:

```
geo | geo_level | year | vintage | time_label | <chiều riêng của bảng> | <measure>
```

Mỗi bộ nguồn một store riêng, sinh hoàn toàn bằng connector deterministic (metadata nguồn đã có sẵn — không cho LLM đoán lại thứ đã biết chắc).

**(b) Bảng tidy per dataset** — cho file tòa soạn upload. Đây là chỗ **LLM-assisted flattening** hoạt động: user kéo file Excel merged cells lên → LLM đọc cấu trúc, đề xuất cách unpivot thành tidy + mapping cột + đơn vị → user nhìn preview song song (bảng gốc | bảng phẳng), xác nhận hoặc sửa → hệ thống lưu cả bản gốc (L1) lẫn bản phẳng (L2) + mapping đã duyệt (để file cùng khuôn lần sau tự áp). Không xác nhận thì file chỉ nằm ở L1 — hoàn toàn hợp lệ.

**Reference data tối thiểu — 3 danh mục, không hơn:**

| Danh mục | Nội dung | Phạm vi |
|---|---|---|
| Địa bàn | mã + tên chuẩn theo **thời đại địa giới** (63 tỉnh pre-2025 / 34 tỉnh) + bảng alias tên gọi ("TPHCM" = "TP. Hồ Chí Minh") | dùng để *match câu hỏi*, KHÔNG dùng để quy đổi số liệu xuyên thời đại — so sánh xuyên 63/34 bị chặn |
| Đơn vị | registry đơn vị hợp lệ + khoảng giá trị hợp lý (`%` ∈ [0,100], `‰`, `ha`, `nghìn người`...) | phục vụ validation |
| Khái niệm | alias curate tay ~50-100 khái niệm phóng viên thực hỏi ↔ nhóm chỉ tiêu trong từng bộ | phục vụ retrieval; KHÔNG phải ontology — thêm dần theo query log |

**Validation gates — chạy tự động mỗi lần nạp L2, fail thì vào hàng đợi duyệt:**

1. Đơn vị: mọi cột measure phải có đơn vị từ nguồn hoặc người xác nhận; giá trị phải nằm trong khoảng hợp lý của đơn vị đó.
2. Nhất quán nội bộ: nơi có cả cấp tỉnh và toàn quốc, `SUM(province) ≈ national` (sai số khai báo được).
3. Liên tục: giá trị mới cho cùng khóa-đủ-chiều mà khác giá trị cũ → ghi changelog cấp cell, không ghi đè; biến động YoY vượt ngưỡng → flag.
4. Cấu trúc: schema drift giữa hai lần fetch, row count drift, dimension value mới chưa từng thấy → flag.

### L3 — Lớp Tri thức (Catalog)

Không chỉ là danh sách dataset — là **cái mà agent đọc để biết hỏi ở đâu**. Ba cấp:

- **Dataset**: title, mô tả, nguồn, coverage thời gian/địa lý, vintage, footnote, provenance.
- **Cột**: nhãn Việt nguyên văn + tên máy + đơn vị + tập giá trị hợp lệ của chiều (chống hallucinate filter).
- **Nhóm chỉ tiêu**: một khái niệm ("tỷ lệ thất nghiệp") gom nhiều bảng phân tổ — đơn vị của search, để 7 bảng gần trùng không chiếm 7 slot kết quả.

**Search hybrid từ ngày 1**: BM25 (lexical, index cấp nhóm) **+ embedding** (multilingual, bắt fuzzy intent "kinh tế Nam Bộ" → ĐBSCL, và cầu Việt↔Anh khi có nguồn quốc tế). Ở quy mô vài trăm nhóm, cả hai đều chạy in-process (SQLite FTS5 + sqlite-vec hoặc một index file), không cần search server. Embedding rẻ (~vài nghìn đồng cho cả catalog) và giải quyết đúng loại miss mà lexical không cứu được — không có lý do defer.

### Mặt phẳng trả lời — Agent + 5 tools

| Tool | Làm gì |
|---|---|
| `search_catalog(q)` | hybrid search trả nhóm chỉ tiêu + dataset card gọn |
| `get_schema(id)` | cột + đơn vị + giá trị hợp lệ của từng chiều |
| `query(sql)` | **DuckDB sandbox read-only** trên L2: filter, aggregate, growth, so sánh — row limit + timeout + chỉ SELECT |
| `get_provenance(id)` | nguồn, vintage, footnote, link về bảng gốc, lịch sử sửa số |
| `make_chart(data, intent)` | sinh Vega-Lite spec **từ đúng data tool `query` vừa trả** — LLM chọn dạng chart, không chọn số |

Flow một câu hỏi: hỏi → search_catalog → agent đọc schema ứng viên rồi mới chọn (bước "đọc rồi chọn") → query → trả lời. Hợp đồng hiển thị: **câu văn + con số + cảnh báo (UI render) + chart + dòng "đã tra: bảng X · chiều Y · năm Z" + link kiểm chứng** — một đơn vị, không tách rời.

Hậu kiểm bằng code trước khi hiển thị: mọi token số trong câu trả lời phải khớp (sau chuẩn hoá làm tròn + dấu phẩy VN) với một giá trị trong tool results — không khớp thì chặn. Trúng nhiều bộ nguồn → trình cả hai giá trị + khác biệt định nghĩa. Không có dữ liệu → nói không có, kèm gợi ý dataset gần nhất.

**Điểm khác biệt có chủ đích so với cách "cấm LLM số học rồi từ chối câu hỏi tính toán"**: câu hỏi loại "thay đổi thế nào qua các năm", "tăng bao nhiêu %", "tỉnh nào cao nhất" là **đa số nhu cầu thật** của phóng viên. Thay vì từ chối, đưa phép tính vào `query` (SQL do engine chạy, kết quả là số thật, verify được, hiện trong dòng "đã tra"). LLM vẫn không tự tính — nó chỉ viết SQL, và SQL + kết quả đều hiển thị được để kiểm.

---

## 4. Roadmap — trục dọc trước, trục ngang sau

Nguyên tắc: **build một lát mỏng xuyên cả 3 lớp cho một nguồn trước**, kiểm chứng câu hỏi sống còn ("phóng viên có tin và dùng câu trả lời số không?") sớm nhất có thể — rồi mới mở rộng ngang (thêm nguồn, thêm format, thêm user). Ngược với cách "hoàn thiện từng lớp một" vốn đẩy rủi ro sản phẩm về cuối.

### P0 — Lát dọc đầu tiên (tuần 1–3)

Một database NSO (Dân số & lao động, ~63 bảng) chạy hết ống: connector → observation store Parquet → catalog 3 cấp + hybrid search → agent 5 tools → chat trả **số + chart + cảnh báo + link nguồn**. Kèm eval harness ~30 câu hỏi có đáp án số biết trước ngay từ tuần 1 (viết eval trước khi viết agent).

**Exit**: 3 phóng viên thật dùng thử; exact-match số 100% trên eval; ≥70% câu hỏi thật trong phạm vi database đó trả lời được không cần trợ giúp.

### P1 — Độ phủ + độ tin (tháng 2–3)

- NSO toàn bộ (~500 bảng, 12 database) qua connector + bulk ingest idempotent.
- Validation gates 1–4 + hàng đợi duyệt (đơn vị, sum-check, changelog cell).
- Chính sách revision: nguồn sửa số → changelog → (nối article linking) báo tác giả.
- Routing eval: gold set 50 câu đo "chọn đúng bảng" — gate mở rộng user.

**Exit**: 500 bảng tra được; mọi số sơ bộ có cảnh báo; routing recall ≥85% trên gold set; 10–15 phóng viên dùng hằng tuần.

### P2 — Mở kho cho tòa soạn (tháng 4–5)

- Flatten wizard cho file upload: Excel merged cells → LLM đề xuất unpivot → duyệt → vào L2. File không duyệt vẫn vào L1.
- Nguồn thứ hai (World Bank) — kiểm chứng luật "mỗi nguồn một bộ" + trả lời đa bộ + alias Việt↔Anh.
- Trang nhóm chỉ tiêu (chart + bảng + provenance + download) cho người thích browse hơn chat.

**Exit**: biên tập viên tự đưa được 1 file Excel bẩn thành bảng tra được < 15 phút; câu hỏi trúng 2 nguồn trả cả 2 số kèm khác biệt; 30+ user hằng tuần.

### P3 — Intelligence (tháng 6+)

Chỉ bắt đầu khi P2 có usage thật: RAG trên PDF/tài liệu (L1 đã chứa sẵn), transcript MP3, API/MCP cho data journalist chạy agent riêng, story detection từ changelog (nguồn vừa sửa số bất thường = tin). Chi tiết để mở — quyết bằng query log của P1–P2, không quyết trước.

---

## 5. Nguồn lực

### Người

| Vai | Ai / bao nhiêu | Làm gì |
|---|---|---|
| Product engineer | 1 full-time (Ninh + AI pair-programming) | toàn bộ build |
| Data curator | 1 part-time ~20% (biên tập viên) | duyệt đơn vị, alias khái niệm, tags, hàng đợi validation — **đây là chỗ quyết định chất lượng**, không phải code |
| Phóng viên beta | 3 → 15 người, không tốn chi phí | dùng thật + feedback; nguồn gold questions |

Nếu xin thêm được 1 headcount: ưu tiên **một fullstack dev** từ P1 để tách đường build connector (song song hoá 12 database) khỏi đường build product.

### Hạ tầng & chi phí (VND/tháng, ước tính)

| Hạng mục | Beta (P0–P1, ≤15 user) | Toàn tòa soạn (P2+, ~50 active) |
|---|---|---|
| Object store R2 | 0 (free 10GB) | ~150K |
| Hosting (Vercel/CF Pages) | 0 | ~500K (Pro) |
| DuckDB + Parquet + SQLite index | 0 | 0 |
| LLM API (chat, ~30K token/query đã cap bằng retrieval) | ~500K | 2–5 triệu |
| LLM API (flatten wizard, embeddings) | ~100K | ~500K |
| **Tổng** | **< 1 triệu** | **3–6 triệu** |

Không PostgreSQL, không vector DB server, không search server, không data warehouse — ở quy mô ~vài trăm nghìn dòng/bộ nguồn, file + DuckDB + index in-process đủ và rẻ hơn một bậc. Điểm nâng cấp được định trước: catalog > 2.000 nhóm hoặc concurrent query cao → cân nhắc Postgres + pgvector, không sớm hơn.

### Thời gian

6 tháng từ lát dọc đầu tiên đến platform phục vụ tòa soạn, với điều kiện giữ kỷ luật phạm vi: mỗi nguồn mới phải trả "lát đầu" (≥1 chỉ tiêu trả số đúng) trong ≤1 tuần, quá 2 tuần thì dừng và xét lại kiến trúc.

---

## 6. Rủi ro chính & cách xử

| Rủi ro | Xác suất | Xử |
|---|---|---|
| Phóng viên không tin câu trả lời AI, quay lại hỏi tay nhau | trung bình | P0 kiểm chứng sớm; hợp đồng hiển thị "đã tra + link nguồn" là điều kiện tồn tại, không phải feature |
| Số đúng nhưng trả lời sai câu hỏi (nhầm chỉ tiêu/địa giới) | chắc chắn xảy ra | không triệt được bằng kỹ thuật — giảm bằng dòng "đã tra", chặn so sánh xuyên 63/34, và **nói thẳng giới hạn với user**: hệ thống bảo đảm số có trong nguồn X ô Y, không bảo đảm nó trả lời đúng câu của bạn |
| Curate (đơn vị, alias) bị bỏ bê sau vài tháng | cao | hàng đợi duyệt có SLA hiển thị; coverage alias là metric trong eval, giảm dần = báo động |
| Treadmill chuẩn hoá khi thêm nguồn | trung bình | luật mỗi-nguồn-một-bộ + kill-switch 1 tuần/lát đầu + log chi phí per nguồn |
| SQL sandbox bị lạm dụng / query sai | thấp | read-only, SELECT-only, row limit, timeout, SQL hiển thị trong provenance |

---

## Phụ lục — Đối chiếu với thiết kế hiện tại của project

Nói thẳng: thiết kế v3.2 hiện tại đã hội tụ về ~80% đề xuất này. Những gì **giữ nguyên**: bộ-nguồn-không-trộn, file-là-sự-thật, khuôn cột sống + chiều riêng, grain bảng=dataset/nhóm=search, changelog cấp cell, V1/V3–V6, không harmonize địa giới, kill-switch. Tài sản tái dùng được: codebase Next.js + R2 + wizard + connector spike (sau khi re-normalize theo quy ước tên).

Khác biệt có chủ đích của đề xuất này:

1. **Roadmap trục dọc** — chat trả số chạy ở tuần 3 trên 1 database, thay vì sau khi ingest đủ 500 bảng. Rủi ro sản phẩm được kiểm chứng trước khi trả chi phí độ phủ.
2. **`query` SQL sandbox thay cho `get_series` + cấm số học** — trả lời được "thay đổi qua các năm / tăng bao nhiêu / tỉnh nào cao nhất" ngay, vẫn giữ nguyên tắc LLM-không-tự-tính (engine tính, SQL hiển thị được).
3. **Chart trong câu trả lời từ P0** — Vega-Lite sinh từ data tool trả, vì "kèm chart" nằm trong mong muốn gốc của sản phẩm.
4. **Embedding trong hybrid search từ đầu** thay vì defer — chi phí không đáng kể, giải quyết đúng loại miss (recall 42.9% đã đo) mà BM25 không cứu.
5. **Validation gates giá trị** (sum-check, range theo đơn vị, YoY, schema drift) thành yêu cầu bắt buộc của lớp Chuẩn — chỗ thiết kế hiện tại đang mỏng nhất.
6. **DuckDB là engine chính thức của L2** thay vì "đọc CSV lúc cần" — cùng chi phí (0đ), đổi lại có SQL sandbox và aggregate an toàn.
