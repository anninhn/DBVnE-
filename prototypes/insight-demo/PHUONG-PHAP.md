# Thiết kế harness phân tích insight — phóng viên dẫn dắt, chạy trên kho hiện có

> **⚠ Kiến trúc điều phối đã được thay bởi [THIET-KE-V6.md](THIET-KE-V6.md) (2026-10-08).** File này còn giá trị cho phần dữ liệu thực tế (mục 1), xử lý 63/34 tỉnh (2.3), đọc tại chỗ (4), bộ dò (5.1) — xem danh sách ở v6 mục 9.
>
> Trạng thái: **bản thiết kế v5** (2026-10-08). Demo chạy local: AMA → Claude Code headless (GLM 5.3) → MCP server của platform. Tools **đọc tại chỗ** dataset phóng viên chọn — bỏ kho chuỗi.
> Thay đổi so với v2:
> - Phạm vi chỉ còn luồng **phóng viên dẫn dắt** trong AMA.
> - Thêm **phiên hội thoại nhiều lượt**; rào chắn tính theo phiên.
> - Bỏ chế độ "chủ động" và "bản tin sáng" khỏi phạm vi.
> - Model chạy qua **Claude Code headless + GLM 5.3** (subscription), tools đóng gói thành **MCP server** của platform; demo chạy local.
> - Lộ trình chuyển sang các lát cắt dọc.
> - **v5:** bỏ kho chuỗi dựng sẵn; tools đọc thẳng dataset được chọn bằng bộ đọc sẵn có của platform.
>
> Luồng sản phẩm đã minh hoạ bằng prototype trong thư mục này (dữ liệu giả lập).

## 0. Phạm vi và định hướng

**Harness này làm gì:** giúp phóng viên đi từ một câu hỏi đến một góc bài có căn cứ số liệu. Phóng viên hỏi, chọn dữ liệu, xem kết quả, hỏi tiếp, gắn nhãn. Harness làm phần tìm chuỗi, tính toán, kiểm tra và đề xuất cách viết.

**Harness này không làm gì:** không thả agent tự quét toàn bộ kho để "tìm insight". Lý do:
- Quét tự do trên khoảng 500 dataset sẽ cho ra hàng trăm tương quan ngẫu nhiên.
- Máy không có óc phán đoán biên tập.
- Chi phí tăng mà không ai đọc hết kết quả.

**Phần nào đặc thù báo chí.** Kho là số liệu thống kê (gần như toàn bộ từ NSO) dùng *cho* báo chí. Bộ dò thống kê là phần chung. Phần đặc thù báo chí là những thứ lắp quanh nó:

| Thành phần | Chung | Đặc thù báo chí |
|---|---|---|
| Đọc dữ liệu, bộ dò (hồi quy, điểm gãy, khoảng cách vùng) | ✓ | |
| Tiêu chí "đáng viết": mới, bất ngờ, không hiển nhiên | | ✓ |
| Quy tắc câu chữ: không suy từ số tỉnh ra cá nhân, không dùng từ chỉ nhân quả, ghi "tỉnh trước sáp nhập" | | ✓ |
| Truy nguồn: mỗi con số → `result_id` → dataset → nguồn gốc | | ✓ (quy tắc "mỗi con số phải trace được nguồn" của dự án) |
| Đầu ra là góc bài: tít, cần kiểm thêm gì, nên hỏi ai, lưu ý | | ✓ |

**Ngoài phạm vi, mỗi cái một spec riêng sau này:**
- Gợi ý chủ động (bộ dò chạy theo lịch).
- Bản tin sáng (cần CMS pageview, crawler, chốt pháp lý khi quét báo khác).
- Harness chuẩn hoá cho file upload nhiều dạng (AI viết công thức chuyển đổi).
- Kiểm hợp đồng dữ liệu ở wizard upload.

## 1. Kho thực tế trông thế nào (đo ngày 2026-10-06)

Profile toàn bộ CSV tải từ R2 (chỉ đọc), đối chiếu `datasets/index.json`:

| Số đo | Giá trị | Hệ quả cho thiết kế |
|---|---|---|
| Dataset trong index | 498 | — |
| CSV tải được | 488 / 489 (1 lỗi) | — |
| Tổng dung lượng CSV | **~12 MB cho 488 file**, cộng **1 file 450 MB** (`diem-thi-tot-nghiep-thpt-quoc-gia`, 6,4 triệu dòng) | Phần 12 MB nạp vừa bộ nhớ, **không cần DB/DuckDB**. File lớn đọc theo luồng (xem dưới) |
| Có cột tỉnh (≥ 10 tỉnh) | 183 | Phân tích chéo tỉnh chỉ làm trên nhóm này |
| … phủ ≥ 50 tỉnh | 169 | |
| … **năm cuối ≥ 2020, ≥ 50 tỉnh, ≥ 8 năm** | **93** | "Vùng làm việc chính" cho các bộ dò quan hệ |
| … dùng danh mục **63 tỉnh cũ** | 182 / 183 | Chưa có số theo 34 tỉnh mới |
| … có dòng vùng / CẢ NƯỚC lẫn trong cột tỉnh | 170 | Tách cấp địa lý trước khi tính |
| Không có cột tỉnh | 306 | Chuỗi quốc gia, theo ngành → chỉ dùng bộ dò đơn chuỗi |
| **Cấu trúc file** | **480/480 file NSO theo một chuẩn** (đầu ra của `nso_pxweb_to_tidy.py`). Mỗi cột là chiều (chữ), thời gian (`Năm`, `Năm học`, `Tháng`…), `Ghi chú`, hoặc cột đo (toàn số dạng `1.234,5`) | Vai trò cột suy **tất định** từ nội dung |
| File ngoài NSO | 9 file: 5 file dùng dấu `.` thập phân hoặc ô `-`; 1 file **dữ liệu cấp cá nhân** (điểm thi THPT từng thí sinh: số báo danh, năm, điểm từng môn, tỉnh thành) | Đọc theo `decimal_char` của dictionary; ô `-` = thiếu. File điểm thi: đọc theo luồng, gộp sẵn thành tỉnh × năm × môn (trung bình, phân vị, tỷ lệ dưới/trên ngưỡng) — harness không giữ dữ liệu từng thí sinh |
| Không có cột thời gian | 26 file (bảng chụp một thời điểm) | Lấy năm từ `year_range` |
| Giá trị lạ trong cột tỉnh | 24 giá trị: `Hà Tây` (66 file), `TỔNG SỐ`/`Toàn quốc`, `Không xác định`/`Khác`, vài cách viết (`TP HCM`, `HàTĩnh`, `Bà Rịa - V.Tàu`), tên vùng song ngữ | Một bảng bí danh nhỏ, lập một lần |
| Tên cột địa phương | ≥ 6 biến thể | Không quan trọng — nhận cột tỉnh theo **giá trị** |
| Trùng lặp | VD: "Thu nhập bình quân đầu người…" có ≥ 3 dataset biến thể | Không gom. Discovery có thể trả nhiều biến thể; `describe_dataset` nêu rõ khoảng năm, đơn vị, giá hiện hành/so sánh để phóng viên (hoặc AI) chọn đúng bản |

**Kết luận: kho đồng nhất.**

*Đính chính:* bản trước ghi file điểm thi "rỗng trên R2" là sai. Script profile đọc cả file 450 MB vào bộ nhớ và lỗi, để lại file 0 byte trong thư mục tạm. Khoảng năm thực tế của file này chưa đo.

**Ca thu nhập × mức sinh trên dữ liệu thật:**
- Có "Tổng tỷ suất sinh phân theo địa phương" (2005–2024).
- Có "Thu nhập bình quân đầu người một tháng theo giá hiện hành" theo tỉnh, nhưng chỉ 2010–2018.
- → Làm được trên đoạn giao nhau 2010–2018. Chưa kiểm kết quả.

## 2. Luồng phóng viên trong AMA

```
Phóng viên hỏi
   ↓
[1] Tìm dataset theo metadata (Discovery hiện có — searchDatasets)
   ├─ Có → thẻ dataset, phóng viên chọn → [2]
   └─ Không → vòng agentic nhẹ: viết lại câu hỏi, nới điều kiện, tìm lại
              → gợi ý góc khác (dữ liệu gần đúng / đặt lại câu hỏi / "cần dữ liệu gì")
   ↓
[2] Harness phân tích (stream tiến trình) → [3] Thẻ kết quả + "Xem cách tính"
   ↓
[4] Phóng viên gắn nhãn và/hoặc hỏi tiếp trong CÙNG PHIÊN
    ("kiểm thêm tỷ số giới tính khi sinh?", "Tây Nguyên thì sao?", "bỏ năm 2019 đi?")
   ↓  quay lại [2], harness nhớ những gì đã làm
```

### 2.1 Phiên (session)

Mỗi cuộc hội thoại là một phiên. Phiên lưu:
- Câu hỏi và các dataset phóng viên đã chọn.
- Các dataset / cột / bộ lọc đã dùng, mọi lượt gọi tool và kết quả (`result_id`).
- Các thẻ đã nộp, nhãn phóng viên gắn.

Lượt sau nhận **tóm tắt phiên** (không phải toàn bộ log) để xây tiếp trên lượt trước. Ví dụ "bỏ năm 2019" thì chạy lại đúng bộ dò cũ với tham số mới, không đọc lại dataset từ đầu.

Không đặt trần số lượt hỏi hay số lượt gọi tool (xem mục 6.3). Phiên dài thì harness tự **nén tóm tắt phiên** để ngữ cảnh không phình mãi.

### 2.2 Vì sao rào chắn phải tính theo phiên

Nếu tính theo từng lượt, phóng viên (hoặc AI) có thể thử đi thử lại các biến thể đến khi "ra kết quả". Nên:
- **Benjamini–Hochberg đếm mọi phép thử từ đầu phiên.** Mỗi lượt hỏi tiếp làm ngưỡng chặt hơn.
- **Khớp số** được trích kết quả của bất kỳ lượt nào trong phiên.
- Thẻ hiện "đã thử N phép thử trong phiên này" để phóng viên biết.

### 2.3 Tỉnh cũ (63) hay tỉnh mới (34): tự nhận diện, gợi ý, cảnh báo

Dữ liệu trong kho gần như toàn bộ theo 63 tỉnh cũ (182/183 dataset có cột tỉnh). Phóng viên có thể muốn viết theo tỉnh cũ (so sánh lịch sử) hoặc tỉnh mới (bối cảnh hiện tại). Harness không chọn thay phóng viên, mà nhận diện ý định rồi xử lý tương ứng.

**Nhận diện**, theo thứ tự ưu tiên:
1. **Nói thẳng**: "sau sáp nhập", "tỉnh mới", "34 tỉnh" → 34. "trước sáp nhập", "63 tỉnh" → 63.
2. **Tên tỉnh chỉ có trong một danh mục**: tên đã biến mất sau sáp nhập → 63.
3. **Thời gian**: hỏi về giai đoạn sau sáp nhập → 34.
4. **Tên tỉnh được giữ lại nhưng ranh giới đã đổi** → **mơ hồ**. Harness hỏi lại phóng viên trước khi tính, không tự đoán.

**Xử lý khi phóng viên cần số theo 34 tỉnh:**

| Loại chỉ tiêu | Cách làm | Thẻ ghi |
|---|---|---|
| Cộng được (dân số, sản lượng, số doanh nghiệp…), cờ `additive` | Cộng các tỉnh cũ theo bảng ánh xạ 63 → 34 | "Cộng từ các tỉnh cũ: A + B" |
| Tỷ lệ / bình quân, **có** chuỗi trọng số phù hợp trong kho (VD dân số cho chỉ tiêu bình quân đầu người) | Bình quân có trọng số | **Cảnh báo:** "Ước tính, không phải số chính thức" + trọng số đã dùng |
| Tỷ lệ / bình quân, **không** có trọng số phù hợp | Không gộp | **Cảnh báo** + gợi ý trình bày theo tỉnh cũ, nêu rõ tỉnh mới gồm những tỉnh cũ nào |

**Luôn luôn:** thẻ ghi rõ đang dùng danh mục nào. Bộ dò quan hệ không trộn hai danh mục trong một phép tính. Bảng ánh xạ 63 → 34 lập từ văn bản sáp nhập chính thức, ghi nguồn, nằm cùng chỗ với bảng bí danh.

Với `region_reversal` và các bộ dò cần nhiều tỉnh: gộp lên 34 làm giảm số điểm mỗi vùng, có thể không đủ n tối thiểu. Khi đó harness báo và đề xuất chạy trên 63.

## 3. Kiến trúc demo: chạy local, AMA → Claude Code headless (GLM 5.3) → MCP server của platform

```
Trình duyệt: AMA (/hoi-du-lieu)
   │ hỏi · chọn dataset · hỏi tiếp
   ▼
Route /api/insight/run  (npm run dev trên máy Ninh — tắt ở production)
   │ spawn: claude -p --output-format stream-json
   │        --system-prompt <prompt nghề báo>  --mcp-config <insight MCP>
   │        --allowedTools <chỉ tool insight>  --session-id / --resume <phiên>
   │ env:   ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
   │        ANTHROPIC_AUTH_TOKEN=<key Z.ai của Ninh>  · model glm-5.3
   │ ◄── stream sự kiện → NDJSON về UI (tiến trình Bước 2, thẻ Bước 3)
   ▼
Claude Code (headless, tool được Z.ai hỗ trợ) ⇄ GLM 5.3 qua subscription
   │ MCP (stdio)
   ▼
MCP server "insight" (@modelcontextprotocol/sdk)
   │ describe_dataset · check_artifacts · run_detector ·
   │ report_insufficient · submit_card (rào chắn)
   ▼
src/lib/insight/  ── tools + bộ dò + rào chắn + trạng thái phiên
   │ đọc tại chỗ, dùng lại src/lib/parse/* + getObject (R2) + getDatasetBySlug
   ▼
Dataset phóng viên đã chọn (CSV trên R2 + metadata.yaml) + bảng chuẩn hoá địa lý
```

**Vì sao đi đường này.**
- Gói GLM Coding Plan chỉ được dùng trong tool được hỗ trợ ([Usage Policy](https://docs.z.ai/devpack/usage-policy)). Claude Code là tool được hỗ trợ ([hướng dẫn cấu hình](https://docs.z.ai/devpack/tool/claude)).
- App **không** gọi endpoint Coding bằng `openai` SDK, vì đó là kiểu "SDK-based access" bị hạn chế.
- Demo chỉ dùng một tài khoản của Ninh. Trang chính sách không nói gì về việc chính người đăng ký tự động hoá tool được hỗ trợ: đây là vùng xám, rủi ro thấp nhưng không bằng 0.

**Vì sao chạy local, không chạy trên Vercel.** Hàm serverless không giữ đĩa giữa các request (phiên `--resume` bị gãy), chỉ ghi được `/tmp`. File chạy `claude` nặng ~199 MB (bản macOS arm64 trên máy Ninh). Một CLI nhận request từ web app trên cloud cũng xa phạm vi gói subscription hơn.

**Nguyên tắc:**
- AI không tính số.
- Rào chắn nằm trong code (`submit_card` và trong chính các tool). Platform không kiểm soát system prompt của Claude Code, nên mọi quy tắc cứng phải nằm trong code.
- "Không đủ dữ liệu" là đầu ra hợp lệ.
- Dependency mới duy nhất: **`@modelcontextprotocol/sdk`** (Ninh đã duyệt 2026-10-08). Thống kê viết bằng TS thuần.

**An toàn khi spawn CLI trên máy Ninh:**
- Route chỉ bật khi chạy local (cờ môi trường riêng); bản deploy trả 404.
- `--allowedTools` chỉ gồm tool của MCP insight. Chặn Bash, đọc/ghi file, web.
- Dùng `--bare` để Claude Code không đọc CLAUDE.md và memory cá nhân. **Cần thử**: `--bare` ghi là chỉ nhận xác thực qua `ANTHROPIC_API_KEY` hoặc `apiKeyHelper`, chưa rõ có nhận `ANTHROPIC_AUTH_TOKEN` của Z.ai không.

**Hướng sau này (chưa quyết):** cùng MCP server này mở thêm transport HTTP (SDK hỗ trợ cả stdio lẫn HTTP) thành **remote MCP của platform**. Khi đó phóng viên kết nối từ AI client của chính họ, dùng model trong subscription của họ.

## 4. Đọc dữ liệu tại chỗ

**Không dựng kho dữ liệu riêng cho harness.** Tools đọc thẳng các dataset phóng viên đã chọn, ngay lúc cần.

Lý do:
- Phóng viên đã chọn dataset trong AMA, nên harness chỉ làm việc với 1–3 dataset mỗi lượt, không cần chuẩn hoá trước toàn kho.
- Dữ liệu không đồng nhất chỉ phải xử lý ở dataset **đang dùng**. Lỗi khu trú ở đúng dataset đó và báo thẳng cho phóng viên.
- Dataset mới upload dùng được ngay, không cần cơ chế đồng bộ, không thêm thứ gì phải duy trì.
- Đủ nhanh: 488 file tổng ~12 MB, đọc một file mất vài phần nghìn giây.

### 4.1 Dùng lại bộ đọc của platform

Harness đọc số **bằng đúng các hàm mà trang preview đang dùng**, nên không có hai cách đọc dữ liệu có thể lệch nhau:

| Việc | Hàm có sẵn |
|---|---|
| Lấy metadata + dictionary | `getDatasetBySlug` (`src/lib/datasets/read.ts`) |
| Lấy file từ R2 | `getObject` (`src/lib/r2/get.ts`) |
| Đọc CSV | `parseCSV`, `forEachCSVRow` (đọc theo luồng) (`src/lib/parse/csv.ts`) |
| Đọc số theo `decimal_char` / `group_char` | `parseNumberWithSchema` (`src/lib/parse/number.ts`) |
| Đoán định dạng số khi dictionary thiếu | `detectDecimalFormat` (`src/lib/parse/decimal-detect.ts`) |

File tải về được cache trên đĩa (`data/insight/cache/`, có trong `.gitignore`) để không tải lại mỗi lượt.

### 4.2 Hiểu một dataset (`describe_dataset`)

Khi đọc một dataset, code xác định, **tất định và theo nội dung**:
1. **Vai trò cột:** chiều (chữ) / thời gian (`Năm`, `Năm học`, `Tháng`…) / `Ghi chú` / đo (toàn số). Đây là chuẩn mà 480/480 file NSO đang theo.
2. **Cột địa lý:** cột có giá trị khớp danh mục tỉnh (qua bảng chuẩn hoá ở 4.3). Gắn cấp `nation | region | province` cho từng dòng để không trộn CẢ NƯỚC/vùng với tỉnh.
3. **Danh mục tỉnh:** 63 hay 34 (theo tên tỉnh xuất hiện).
4. **Thời gian:** năm / năm học / tháng; cờ `so_bo`; không có cột thời gian thì lấy `year_range`.
5. **Cột đo:** đơn vị (từ tên cột), và **cộng được hay không** (`additive`). Quy tắc: tên chứa "tỷ lệ", "%", "bình quân", "chỉ số", "tỷ suất", "mật độ"… → không cộng được. Không chắc → coi là **không** cộng được (an toàn: chỉ khiến harness cảnh báo thay vì cộng sai).
6. **Cảnh báo dữ liệu (artefact):**
   - giá hiện hành / giá so sánh;
   - năm thiếu;
   - tổng các tỉnh lệch CẢ NƯỚC;
   - năm đổi phương pháp (danh sách lập tay, có nguồn);
   - min/max lệch `column_stats` trong `metadata.yaml`.

Dataset không đọc được theo chuẩn trên (không có cột đo, cột địa lý chứa giá trị lạ không có trong bảng chuẩn hoá…) → `describe_dataset` trả lỗi cụ thể. Phóng viên thấy "dataset này chưa phân tích được: …", không có phân tích sai.

### 4.3 Bảng chuẩn hoá địa lý — phần dùng chung duy nhất

Muốn ghép thu nhập (dataset A) với mức sinh (dataset B) theo tỉnh × năm thì tên tỉnh ở hai file phải quy về cùng một mã. Đây là file tra cứu nhỏ, sửa qua git, nằm ở `src/lib/insight/geo/`:
- **Danh mục 63 tỉnh cũ + 34 tỉnh mới**, mỗi tỉnh một mã, kèm vùng.
- **Bảng bí danh:** `TP HCM`, `HàTĩnh`, `Bà Rịa - V.Tàu`, chữ `Ð` khác mã, tên vùng song ngữ, `TỔNG SỐ`/`Toàn quốc` → cả nước, `Không xác định`/`Khác` → bỏ qua, `Hà Tây` → tỉnh cũ (trước 2008).
- **Ánh xạ 63 → 34**, lập từ văn bản sáp nhập chính thức, ghi nguồn. Kiểm: tổng dân số 34 tỉnh = tổng 63 tỉnh.

### 4.4 File điểm thi (450 MB) — ngoại lệ

Đọc lại cả file mỗi lượt hỏi thì quá chậm. Lần đầu dùng, đọc theo luồng bằng `forEachCSVRow`, gộp thành tỉnh × năm × môn (trung bình, phân vị, tỷ lệ dưới/trên ngưỡng), lưu bản gộp vào cache. Các lần sau đọc bản gộp. Harness không giữ hay trả về dữ liệu từng thí sinh.

## 5. Tools và bộ dò

Hàm thuần trong `src/lib/insight/`, đọc tại chỗ như mục 4. **Kết quả trả AI là tóm tắt, không trả dữ liệu thô.** Dữ liệu đầy đủ (kể cả để vẽ biểu đồ) lưu trong log phiên.

Một "lát dữ liệu" được chỉ định bằng `{slug, cột đo, lọc}`. Ví dụ: `{slug: "tong-ty-suat-sinh-phan-theo-dia-phuong", measure: "Tổng tỷ suất sinh", filter: {level: "province"}}`.

| Tool | Tham số chính | Trả về |
|---|---|---|
| `describe_dataset` | `slug` | Vai trò cột, giá trị các chiều, cấp địa lý, danh mục 63/34, khoảng năm, cột đo + đơn vị + `additive`, cảnh báo dữ liệu. Không đọc được → lỗi cụ thể |
| `check_artifacts` | lát dữ liệu, `years?` | Cảnh báo kèm mức `block / warn` |
| `run_detector` | `kind`, `x`: lát dữ liệu, `y?`: lát dữ liệu, `params` | Đọc + lọc + ghép x với y theo mã tỉnh × năm ngay lúc chạy, rồi tính. Trả kết quả có `result_id`; cộng vào bộ đếm phép thử của phiên |
| `report_insufficient` | `want`, `missing[]`, `nearest[]` | Thẻ "cần dữ liệu gì" |
| `submit_card` | thẻ JSON | Chạy rào chắn (mục 7). Đạt → thẻ hợp lệ. Không đạt → danh sách lỗi để AI sửa |

Bỏ so với v4: `search_series` (Discovery đã tìm dataset; bên trong dataset dùng `describe_dataset`) và `related_series` (cần nhìn toàn kho; xem lại sau dùng thử nếu thấy cần).

### 5.1 Bộ dò (`kind`)

| kind | Dùng cho | Cách tính | Tự kiểm |
|---|---|---|---|
| `trend_break` | 1 chuỗi (cả nước hoặc 1 tỉnh) | Đảo chiều, kỷ lục N năm, điểm gãy (so độ dốc trước/sau) | Không coi là gãy nếu điểm đó có cờ đổi phương pháp |
| `rank_shift` | 1 chuỗi cấp tỉnh | Tỉnh tăng/giảm hạng mạnh nhất trong K năm | Bỏ tỉnh có năm thiếu |
| `outlier_residual` | x, y cấp tỉnh, 1 năm | OLS, phần dư chuẩn hoá, top tỉnh lệch | n ≥ 30 |
| `region_reversal` | x, y cấp tỉnh | Độ dốc trong từng vùng so với gộp; đánh dấu đổi dấu | **Tự chạy trên 2 cửa sổ năm**; p từ hoán vị trong vùng; n ≥ 8 tỉnh/vùng |
| `gap_trend` | 1 chuỗi, 2 nhóm (vùng / top–bottom) | Tỷ số hoặc hiệu theo năm, độ dốc của khoảng cách | ≥ 6 năm |
| `partial_corr` | x, y, control | Tương quan riêng phần qua phần dư | Control là một lát dữ liệu khác (VD dân số, tỷ lệ đô thị). AI chọn, hoặc phóng viên chọn thêm dataset |

Bộ dò quan hệ chỉ ghép dữ liệu **cùng năm, cùng danh mục tỉnh**. Thiếu năm chung thì trả lỗi rõ ràng, không tự nội suy.

### 5.2 Kiểm chéo

Một script Python chạy một lần (statsmodels có sẵn) tính lại các bộ dò trên 5–10 cặp lát dữ liệu, so với bản TS. Lệch quá 1e-6 → sửa TS.

## 6. Tầng điều phối

Route **`POST /api/insight/run`** (chỉ chạy local), body `{ session_id?, question, slugs? }`:

1. Kiểm cờ local + đăng nhập (dùng `auth()` như các route khác).
2. Tạo hoặc nạp phiên. `session_id` dùng chung cho cả hai nơi:
   - phiên của Claude Code (`--session-id` lần đầu, `--resume` các lượt sau);
   - trạng thái phiên của harness.
3. Spawn `claude -p` với các cờ ở mục 3. Truyền `session_id` và `slugs` cho MCP server qua biến môi trường trong `--mcp-config`.
4. Đọc `stream-json` từ stdout → đổi thành sự kiện NDJSON cho UI: gọi tool nào, tham số gì, kết quả tóm tắt, thẻ nộp, kết quả rào chắn.
5. Kết thúc khi Claude Code trả kết quả cuối, hoặc phát hiện kẹt vòng (mục 6.3).

**Trạng thái phiên của harness lưu ra đĩa**, không giữ trong bộ nhớ. Lý do: mỗi lần `claude -p` chạy là một tiến trình MCP stdio mới, nên MCP server phải đọc và ghi trạng thái phiên (`result_id`, bộ đếm phép thử, thẻ, nhãn) từ file. Nơi lưu: `data/insight/sessions/<session_id>.json`, có trong `.gitignore`.

**Log phiên** = file trạng thái phiên + toàn bộ sự kiện stream. Dùng cho "Xem cách tính" và để lần ngược khi thẻ sai.

### 6.1 Prompt hệ thống (tóm tắt)

- **Vai trò:** trợ lý dữ liệu cho phóng viên. Tìm góc bài có căn cứ, hoặc nói rõ là không đủ dữ liệu.
- **Danh mục pattern:** khi nào một pattern là tin, khi nào là hiển nhiên, kèm ví dụ.
- **Quy tắc:**
  - Mọi con số phải trích `result_id`.
  - Dữ liệu cấp tỉnh → không nói về cá nhân.
  - Tương quan → không dùng động từ nhân quả.
  - Luôn nói rõ đang dùng danh mục 63 hay 34 tỉnh; câu hỏi mơ hồ về danh mục → hỏi lại phóng viên.
- **Ưu tiên** dataset phóng viên đã chọn; được dùng thêm chuỗi control.
- **Lượt hỏi tiếp:** dùng lại chuỗi và kết quả trong phiên; nói rõ lượt này thay đổi gì so với lượt trước.

### 6.2 Model

GLM 5.3 qua subscription của Ninh, đi qua Claude Code (mục 3). Không đụng tới cấu hình Gemini đang dùng cho Discovery và wizard upload.

### 6.3 Giới hạn: chỉ chống kẹt vòng, không chống chi phí

Token tiêu trên subscription của Ninh, không tính tiền theo lượt, nên **không đặt trần** số lượt hỏi hay số lượt gọi tool. Chỉ giữ:
- **Phát hiện kẹt vòng:** cùng một tool với cùng tham số gọi lặp lại, hoặc nhiều lượt liên tiếp không ra kết quả mới → dừng tiến trình, báo phóng viên. Đây là chống lỗi, không phải chống chi phí.
- **Nén tóm tắt phiên** khi ngữ cảnh dài.
- Hạn mức của chính gói subscription vẫn áp dụng.

Không đặt trần cũng **không** nới lỏng thống kê: thử càng nhiều thì ngưỡng BH theo phiên càng chặt (mục 2.2).

## 7. Rào chắn (code, chạy trong `submit_card`)

| # | Kiểm | Cách làm | Khi fail |
|---|---|---|---|
| 1 | **Khớp số** | Lấy mọi số trong thẻ (định dạng VN). Mỗi số phải khớp một giá trị trong kết quả tool **của phiên**, sai số trong phạm vi làm tròn | Sửa 1 lần → loại |
| 2 | **Artefact** | Lát dữ liệu có cờ `block` → loại; có `warn` → trường `luu_y` phải nhắc | Loại / buộc sửa |
| 3 | **Lặp lại theo thời gian** | Thẻ dạng quan hệ phải trích kết quả có `windows_agree = true` | Loại |
| 4 | **Thống kê** | n tối thiểu; Benjamini–Hochberg trên **mọi phép thử từ đầu phiên** (đếm từ log, AI không lách được) | Loại |
| 5 | **Câu chữ** | Từ chỉ cá nhân ("người dân", "mỗi gia đình", "người giàu") khi dữ liệu cấp tỉnh; động từ nhân quả ("khiến", "làm tăng", "do … nên") | Cảnh báo cho phóng viên |
| 6 | **Đủ trường** | Nguồn (slug có thật trong index), lưu ý, việc cần kiểm thêm | Buộc sửa |

Rào chắn không đo được "có mới không". Phần đó là của phóng viên.

## 8. Đánh giá — dùng thử thực tế

Không làm bộ câu hỏi thử cố định. Ninh đưa harness cho phóng viên dùng thử, đánh giá qua trải nghiệm thật.

Harness vẫn giữ hai thứ để hỗ trợ việc dùng thử:
- **Log phiên** đầy đủ: câu hỏi, tool calls, kết quả, thẻ, rào chắn. Thẻ nào sai thì lần ngược được sai ở đâu (dữ liệu, bộ dò hay câu chữ).
- **Nhãn phóng viên gắn** trên thẻ (`đạt / sai số / hiển nhiên / diễn giải quá đà`), lưu cùng log.

Kiểm chéo bộ dò với statsmodels (mục 5.2) vẫn giữ. Đó là kiểm tính toán đúng, không phải đánh giá chất lượng.

## 9. Lộ trình — lát cắt dọc

| Lát | Nội dung | Kết thúc khi | Checkpoint |
|---|---|---|---|
| **1 · Bộ khung chạy trên app** | Bảng chuẩn hoá địa lý (danh mục + bí danh + ánh xạ 63 → 34) · đọc tại chỗ dùng lại `src/lib/parse/*` · 3 tool (`describe_dataset`, `check_artifacts`, `run_detector`) với 2 bộ dò (`region_reversal`, `trend_break`) · `submit_card` với rào chắn khớp số · MCP server stdio · route spawn Claude Code + stream · UI tối thiểu trong AMA: nút "Phân tích insight" trên thẻ dataset → tiến trình → thẻ | Trên `npm run dev`, một câu hỏi thật đi hết đường ống ra thẻ số liệu thật; số khớp statsmodels | **Ninh chạy thử 1 phiên** |
| **2 · Đủ năng lực để dùng thử** | 4 bộ dò còn lại · đủ 6 rào chắn · BH theo phiên · nhận diện 63/34 + gộp có cảnh báo · cache bản gộp file điểm thi · `report_insufficient` + nhánh không tìm thấy dataset (gợi ý góc khác) · hỏi tiếp nhiều lượt · "Xem cách tính" · nhãn phóng viên | Phóng viên dùng thử được trên máy Ninh | **Ninh cho phóng viên dùng thử** |
| *Sau (chưa quyết)* | Remote MCP (HTTP) cho client của phóng viên · deploy · `related_series` (gợi ý dataset ghép được) nếu dùng thử thấy cần | — | — |

Thủ tục:
- Cập nhật `constitution/roadmap.md`: mục 3e đang ghi NL→SQL/DuckDB; thiết kế này dùng tools + bộ dò qua MCP, không sinh SQL.
- Viết spec bằng `/feature-spec` **trước lát 1**.

## 10. Đã chốt (2026-10-08)

- **Phạm vi:** phóng viên dẫn dắt, phiên nhiều lượt. Không có agent tự quét kho.
- **Demo chạy local** trên app (`npm run dev`); AMA → Claude Code headless → GLM 5.3 qua subscription của Ninh → MCP server của platform.
- **Dependency:** duyệt `@modelcontextprotocol/sdk`.
- **63/34 tỉnh:** theo ý định của phóng viên; hệ thống tự nhận diện, gợi ý, cảnh báo (mục 2.3).
- **Giới hạn:** không đặt trần, chỉ chống kẹt vòng (mục 6.3).
- **Đánh giá:** không làm bộ câu hỏi thử; Ninh cho phóng viên dùng thử (mục 8).
- **Remote MCP, deploy:** chưa quyết, xem lại sau dùng thử.

## 11. Rủi ro

- **Không giữ được mạch phiên** giữa các lượt `--resume` → kiểm ở lát 2.
- **`--bare` không nhận token Z.ai** → bỏ `--bare`, thay bằng thư mục cấu hình Claude Code riêng cho harness (không có CLAUDE.md/memory cá nhân).
- **GLM 5.3 gọi tool kém qua Claude Code** → thấy ngay ở lát 1; có thể đổi sang `glm-5.3-flash` hoặc chỉnh prompt.
- **Dữ liệu cũ:** nhiều quan hệ chỉ có đến 2018. Thẻ ghi năm rõ ràng. Phóng viên thấy "cũ" cũng là một kết quả đánh giá.
- **Bảng ánh xạ 63 → 34 sai hoặc thiếu** → lập từ văn bản chính thức, ghi nguồn, kiểm tổng dân số 34 tỉnh = tổng 63 tỉnh.
- **Phiên dài làm ngưỡng BH quá chặt** → hiện số phép thử trên thẻ; cho phóng viên mở phiên mới khi đổi hẳn chủ đề.
- **Dataset không đọc được theo chuẩn** → `describe_dataset` báo rõ "chưa phân tích được", không phân tích sai.
