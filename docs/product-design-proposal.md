# Product Design — VnExpress Data Platform

> **Trạng thái**: đề xuất v3, chưa chốt. Viết lại 2026-08-24 sau spike NSO + review chéo + discussion grain/naming/duplicate.
> **Không phải spec.** Spec đi qua `/feature-spec` sau khi design được duyệt.
> Số liệu ghi "Verified" đã kiểm bằng tool call trực tiếp trong session ghi rõ; số từ session khác ghi nguồn.
> v3 thay v2: bỏ R1 (cap connector) và R3 (normalize theo demand), thay bằng luật **bộ nguồn không trộn** + kill-switch có số. Chốt grain, quy ước tên, hợp đồng hiển thị, chính sách trùng lặp.
> v3.2 (2026-08-24): **G0 PASS** — đa số phóng viên cần con số, phóng viên dữ liệu cần raw. Thêm §8b chống số sai (V1–V6) làm gate G2. Sửa 3 số §3/§5b theo đo lại sau `6a1b79f`; key changelog §5b đổi sang đủ chiều.
> v3.1 vá sau review: retrieval index theo nhóm (§8), mặc định phơi bày khi alias trượt + cơ chế 2 tầng (§5), chính sách revision (§5b), tripwire connector (§1), sửa "không cần review" (§7), G1 ước lượng lại 50-60%.
> v3.2 đảo roadmap theo quyết định Ninh 2026-08-24: **NSO toàn bộ → Discovery Chat con số → bộ nguồn khác**. G0 chạy song song, chỉ gate phase Chat.

---

## 0. Định vị sản phẩm

> **Bàn số liệu đáng tin của tòa soạn.**
> Nơi phóng viên **tìm được dataset luôn** (mọi nguồn), và với nguồn thống kê có cấu trúc, **hỏi được con số kèm cảnh báo gốc** của nguồn đó. Không hứa hợp nhất mọi nguồn thành một hệ số liệu — so sánh là việc của người hỏi, hệ thống chỉ có trách nhiệm **không giấu khác biệt**.

(Đề xuất đưa 2 câu này vào constitution nguyên văn khi duyệt.)

Không phải: data warehouse (không hợp nhất nguồn) · công cụ phân tích (chart/notebook là việc agent) · portal công (chưa).

Ba yêu cầu nền:

| | Yêu cầu | Hiện tại |
|---|---|---|
| (1) | Có dữ liệu | 17 dataset sống (22 folder trên main gồm soft-deleted; uploaded bởi ninh + ha) |
| (2) | Tìm dễ | tìm được *dataset*, chưa tìm được *con số* |
| (3) | Đáng tin | có provenance của *file*, chưa có của *con số* |

Wizard có throughput khi có project (đợt Rừng VN ~15 dataset) — nhưng chưa có phóng viên tự upload thường xuyên. Nút thắt là nguồn, không phải UX upload.

---

## 1. Luật trung tâm: chi phí nằm ở lời hứa hợp nhất, không nằm ở thêm nguồn

```
Làm dữ liệu ĐỌC ĐƯỢC    → rẻ, lặp được, mỗi nguồn một script
Làm dữ liệu ĐỒNG Ý nhau → đắt vô hạn, mỗi câu trả lời mở 3 câu mới
```

Ba cái hố gặp trong một ngày, cả ba cùng một loại:

| Hố | Loại |
|---|---|
| Super table province-key | bắt các nguồn đồng ý về khung hàng |
| Harmonize 63/34 tỉnh | bắt hai thời đại đồng ý về địa giới |
| Bảng tra mã tỉnh | bắt tên đồng ý về định danh |

### Ví dụ kinh điển (Verified 2026-08-24)

Tra "dân số Việt Nam 2024":

| Nguồn | Bảng | Đo gì | Giá trị |
|---|---|---|---|
| NSO | V02.03-07 | dân số **trung bình** cả năm | 101.343.754 ⚠️ **Sơ bộ** |
| WB | SP.POP.TOTL | dân số tại một **mốc** | 100.987.686 |

Lệch **356.068 người** (NSO: verify từ `data/nso/series/`, nghìn người, `vintage=so_bo`. WB: verify REST API, `lastupdated 2026-07-13`). Merge thành một chỉ tiêu "population" = chọn ngầm một con số và giấu 356 nghìn người.

### Quy tắc

**Bộ nguồn không trộn.** NSO là một bộ — giữ nguyên nhãn, cảnh báo, đơn vị, địa giới của NSO. WB là bộ khác. Không bao giờ merge hai bộ. Thêm 10 nguồn được, mỗi bộ tra được trong phạm vi của nó, không bao giờ trả tiền cho hợp nhất.

**Không đặt cap số connector** (bỏ R1): cap là phân phối khẩu phần — chặn hố bằng cách chặn giá trị. Luật cắt nguyên nhân thì muốn hợp nhất không bao giờ xảy ra, không phải "chỉ được 3 nguồn". Hệ quả phải nói thẳng: **kỷ luật dịch từ kiến trúc sang quy trình** — sống nhờ kill-switch có số (§9) + log thời gian per-pack + gate G0. Không giữ ba cái đó thành nghi thức thì chính sách trôi.

**Tripwire mềm** (thay chức năng forcing của cap cũ): connector **thứ 4 trở đi** phải viết lý do vào chính doc này (mục §12) **trước khi bắt đầu** — nguồn gì, vì sao, dự kiến mấy ngày. Rẻ, tạo ma sát đúng lúc hào hứng nhất — thời điểm dễ tự lừa nhất. Không phải cap: không ai bị cấm, chỉ không ai được quên vì sao mình làm.

**Normalize cả bộ hoặc không** (bỏ R3): một bộ nửa-normalize gây rối hơn cả bộ hoặc không làm. Demand **không chết, đổi vai trò**: quyết định *bộ nào onboard tiếp theo*, không quyết định bảng nào trong bộ được normalize.

**Không normalize file upload** (giữ R2): bề mặt bẫy không giới hạn (định dạng lạ, header nhiều tầng, đơn vị không khai). Kiểm chứng 7 dataset đầu: không cái nào là cube rõ ràng. Upload = lớp Object, tải và search metadata được, hết. File khai được `role` thì góp được vào lớp Chuỗi — tự nguyện, không bắt buộc.

---

## 2. Bốn bất biến kiến trúc

1. **File là sự thật, chuỗi là dẫn xuất** — mọi chuỗi regenerate từ connector được
2. **Bộ không trộn** — so sánh xảy ra lúc trả lời, trước mắt người hỏi (§5)
3. **Cảnh báo đi theo con số, không theo hệ thống** — vintage, đơn vị, footnote dán vào từng số
4. **Thêm nguồn tự do — trả bằng kill-switch, không bằng cap**

---

## 3. Model nội dung

### Ba lớp

| Lớp | Là gì | Trả lời | Ai dùng |
|---|---|---|---|
| **Object** | mọi file, nguyên gốc, bất biến, hash | "cho tôi file" | tất cả |
| **Chuỗi** | `chiều × thời gian → giá trị`, per bộ nguồn | "con số là bao nhiêu" | Hoa (qua chat) |
| **Microdata** | file lớn chưa tổng hợp (điểm thi: 1 dòng = 1 thí sinh) | "tự phân tích" | Ninh (qua agent) |

Microdata không vào lớp Chuỗi: tổng hợp đòi hỏi *chọn* cách tổng hợp — quyết định biên tập, máy chọn hộ = số sai không ai biết vì sao.

### Grain — ĐÃ CHỐT: bảng = dataset, chỉ tiêu = nhóm

Lưu theo **bảng**, hiển thị và tìm kiếm theo **nhóm chỉ tiêu**:

```
Nhóm: "Lực lượng lao động từ 15 tuổi trở lên"
├── dataset: …phân theo giới tính và thành thị, nông thôn
├── dataset: …phân theo nhóm tuổi
└── dataset: …phân theo địa phương
```

Năm lý do:
1. **Provenance per bảng** — footnote, `updated`, vintage đều ở cấp bảng; gộp 3 bảng = 3 chân chú trộn trong 1 trang Nguồn
2. **Schema đồng nhất** — mỗi bảng một bộ chiều riêng; gộp = dictionary phải diễn tả 3 schema hoặc union thưa
3. **Trùng lặp map 1:1 với pxid** (§6)
4. **Giống GUI NSO** — nhà báo bấm nguồn tới đúng trang bảng
5. **Nhóm sai sửa rẻ** — sai nhóm = sửa 1 field metadata, data không động. Việc review tay ~105 nhóm từ "bắt buộc trước khi fetch" thành việc làm dần sau

Search/browse hoạt động ở cấp nhóm (index: tên chỉ tiêu + hợp các cách phân tổ), trả nhóm rồi mở rộng. `get_series` tự chọn bảng qua metadata chiều. Người đọc không lướt 500 dòng; mỗi khối dữ liệu có schema sạch + chứng thư riêng.

### Khuôn dữ liệu — cột sống + chiều riêng

```
geo | geo_level | year | vintage | time_label | <các chiều của bảng> | <measure>
```

Số đo spike (Verified `data/nso/` sau commit `6a1b79f`: 31 nhóm, 63 bảng, **45.527 dòng**): **23/63** bảng có chiều tỉnh, **40/63 không có** (nhóm tuổi, vùng, giới tính… — 25 loại chiều). Chỉ **16/63** vừa khuôn `chỉ_số|tỉnh|năm|giá trị` (có tỉnh + có năm + đúng 1 measure + không chiều nào khác) = 25% — khuôn đó đã bỏ.

Bốn cột không được thiếu: `geo_level` (thiếu thì SUM() đếm 3 lần) · `vintage` (**2.256/45.527 = 4,96%** dòng sơ bộ/ước tính, trông y hệt chính thức) · `time_label` (trace) · chỗ cho chiều bất kỳ.

### Không harmonize địa giới — đã chốt

Gộp tỉnh 2025 là nhiều-về-một: đưa số 2020 về địa giới mới phải **cộng**, mà 17/25 measure theo tỉnh là tỷ lệ (%, ‰, tuổi, per-capita) — **không cộng được** (muốn cộng % phải có mẫu số từng tỉnh cũ, bảng khác, năm khác, có thể thiếu). → Lưu địa giới theo thời đại của nó, **chặn** so sánh xuyên 63/34, `geo` giữ nguyên văn NSO. Bảng tra mã trong `data/DATA_DICTIONARY.md` có bug thật (VN-LC trùng 2 tỉnh, 10/34 thiếu mã) nhưng không giải quyết được so sánh — chỉ sửa khi cần mã định danh nội bộ.

---

## 4. Quy ước tên & hợp đồng hiển thị — ĐÃ CHỐT

Nguyên tắc един: **mọi thứ có một tên máy (ASCII, ổn định) và một nhãn người (tiếng Việt, nguyên văn nguồn).**

### Quy ước đặt tên cột (5 quy tắc)

1. **Cột sống**: tiếng Anh snake_case, cố định 5 cột — `geo, geo_level, year, vintage, time_label`. Phần hệ thống, contract của tool layer, khớp pattern thuật-toả-Anh/nội-dung-Việt
2. **Cột nội dung** (chiều + measure): slug tiếng Việt **không dấu**, snake_case — `vung`, `nhom_tuoi`, `ty_le_that_nghiep...`
3. **Hiển thị**: dictionary `title` tiếng Việt **có dấu** nguyên văn nguồn — "Vùng", "Tỷ lệ thiếu việc làm…". UI render title, không render slug
4. **Đơn vị tách khỏi tên cột** → dictionary `unit`. Không tái tạo kiểu `"Diện tích(Km2)(*)"`
5. **Dataset cũ không đổi tên** — files are truth. Áp cho ingest mới; wizard gợi ý theo chuẩn

**Test case bắt buộc từ G1**: slugifier xử lý cả `Đ` (U+0110) lẫn `Ð` (U+00D0) → `d`. Chỉ map một trong hai → hai bảng "giống hệt nhau" sinh hai tên cột khác nhau, luật thống nhất chết ngày đầu.

### Hợp đồng hiển thị

| Thứ | Tên máy (ẩn) | UI hiển thị |
|---|---|---|
| Dataset | slug URL | tiêu đề bảng nguyên văn |
| Bảng nguồn | `V02-64.csv`, pxid | tiêu đề bảng: "Phân theo thành thị, nông thôn" |
| Cột | `thanh_thi_nong_thon` | "Thành thị, nông thôn" |
| Trạng thái | `so_bo`/`chinh_thuc` | "Sơ bộ"/"Chính thức" |
| Cấp địa lý | `national`/`province` | "Toàn quốc"/"Tỉnh/thành phố" |
| Nguồn | pxweb API URL | "Cục Thống kê (NSO)" |

Tên máy được phép lộ đúng 2 chỗ: **URL** (chuẩn web) và **khu provenance/verify** — `V02.64` ở đó như số tài liệu tham khảo cuối bài báo: cất sâu, chữ nhỏ, bấm vào tới bảng gốc.

Chat đúng/sai:

```
❌ "Theo V02.64, ty_le_that_nghiep = 1.86 (so_bo)"
✅ "Tỷ lệ thất nghiệp Đà Nẵng 2024: 1,86%
    ⚠️ Số sơ bộ — Cục Thống kê có thể sửa
    Nguồn: Cục Thống kê — Dân số và lao động ↗"
```

`files[]` cần trường `label` từ đầu — không thì tên file `V02-64.csv` lọt ra UI, vá sau tốn.

---

## 5. Trả lời đa bộ — chi phí hợp nhất dịch về lúc trả lời, PHẢI THIẾT KẾ

"Không trộn" không làm chi phí biến mất — nó dịch về lúc trả lời. Khi **hai bộ cùng chứa một khái niệm** (dân số, GRDP, thất nghiệp):

> `get_series` trúng nhiều bộ → trả **cả hai giá trị** + nguồn + khác biệt định nghĩa + trạng thái. **Không được chọn hộ.**

Ví dụ §1 là template. Đây là **requirement tính năng** (thiết kế trong G1), không tự có.

**Ranh giới chống hố**: nhận ra "hai bộ cùng khái niệm" cần lớp so khớp. Làm nghiêm chỉnh (registry khái niệm chuẩn) = ontology quay lại cửa sau. An toàn: so khớp theo **alias curate tay** (~50 khái niệm phóng viên thực hỏi, Ninh duyệt), không theo mã toàn cầu. **Nếu thiết kế phần này tốn >2 ngày — đang lùi vào hố.**

**Hành vi khi alias trượt — mặc định nghiêng về phơi bày.** Câu hỏi trúng khái niệm có ở 2 bộ mà chưa có alias thì mặc định trả một bộ = giấu khác biệt — đúng thất bại thiết kế này sinh ra để chặn. Cơ chế 2 tầng:

1. **Cùng ngôn ngữ, tên gần giống về từ vựng** → tự động trình cả hai, kể cả khi chưa có alias. Thừa-bao-lỗi an toàn hơn thiếu-bao
2. **Chéo ngôn ngữ** (NSO tên Việt, WB tên Anh — "Dân số trung bình" vs "Population, total" không bao giờ khớp chữ) → alias là **cầu nối duy nhất** đáng tin. Nên coverage alias là metric phải đo, không phải nice-to-have: thêm câu hỏi đa bộ vào eval set hiện có (`scripts/eval-chat.mjs`), trượt = thiếu alias

Vì tier 2 phụ thuộc danh sách alias mà danh sách lấy từ G0 (20 câu hỏi thật) — G1 khởi động với **alias rỗng + fallback tier 1**, alias lớn dần từ kết quả G0 và usage. Dependency mềm, không chặn.

Định vị UX: "hệ thống luôn thẳng thắn về sự bất đồng" là giá trị báo chí (đúng việc fact-check), nhưng là trải nghiệm nặng hơn "chatbot trả một số gọn". Hiển thị: số chính theo source tier + phần khác biệt thu gọn.

---

## 5b. Chính sách revision — khi nguồn sửa số sau khi bài đã đăng

Kịch bản thật: phóng viên trích "thất nghiệp Đà Nẵng 1,86%" vào bài → NSO công bố chính thức 1,91%. Không có chính sách thì bài cũ sai số im lặng — và "cảnh báo sơ bộ" chỉ còn là nhãn dán, không phải cơ chế.

Hạ tầng đã có đủ ba mảnh:
- **Article Linking (đã ship)** — biết bài nào dùng dataset nào (reverse provenance)
- **`updated` từ API** — biết bảng nào vừa đổi
- **`vintage`** — biết dòng nào vừa flips `so_bo` → `chinh_thuc`

Thiếu đúng một thứ: **changelog cấp cell**. Chuỗi pack regenerate được (bất biến #1) — regenerate vô điều kiện thì số cũ mất, còn đâu "số ngày X là Y". Mỗi refresh phải so sánh và ghi, **không ghi đè**:

```
{bảng, năm, <TOÀN BỘ chiều của bảng đó>, old_value, new_value, vintage_old, vintage_new}
```

**Key phải là đủ chiều, không phải `geo + year`.** 40/63 bảng không có chiều tỉnh — key `{bảng, geo, year}` ở `V02.02` khớp **5 dòng khác nhau** (Tổng số / Nam / Nữ / Thành thị / Nông thôn) nên không định danh được cell. Đây đúng lỗi §3 vừa bác bỏ: một key cố định `geo+year` chỉ phủ 25% bảng. Cài đặt gọn nhất: hash tuple chiều làm `cell_id`. Đây là versioning tối thiểu, không phải hệ version đầy đủ.

Chạy changelog → join Article Linking → **báo tác giả**: "Bài của bạn trích số này — nguồn vừa sửa 1,86 → 1,91, kiểm tra lại". Đây là thứ không công cụ nào khác làm được cho tòa soạn — phần làm "tra số nhanh hơn" thành "bàn số liệu đáng tin" đúng câu định vị §0.

Phạm vi: **chỉ pack-linked**. Dataset upload tay là snapshot đóng băng theo định nghĩa (§6) — không đổi, không cần alert. *(Tuỳ chọn rẻ: §6 đã nối link chéo upload↔pack qua pxid, nên khi bản pack đổi số có thể cảnh báo luôn bên upload — phủ nốt ca phóng viên trích từ bản chụp.)*

Quy mô: **2.256/45.527 dòng = 4,96%** là sơ bộ/ước tính, cho **một** database NSO (Verified sau `6a1b79f`). Không phải chuyện bên lề — cứ 20 con số thì có 1 con sẽ đổi. Ngoại suy 12 database chưa đo.

**Build ở G2**, sau khi có ít nhất một chu kỳ refresh thật + usage thật để thiết kế UX thông báo. G1 chỉ cần một việc: refresh KHÔNG được ghi đè vô điều kiện (sinh changelog từ ngày đầu, đọc sau này được).

---

## 6. Ba mức độ khó nguồn + chống trùng lặp

### Mức độ khó (KHÔNG chung hàng — ước lượng chung là sai)

Số đo spike: fetch 63 bảng = **30 giây**. Phần đắt là thứ **không đoán trước được** (session spike 2026-08-24): UA gating 3 vòng debug, footnote phải postback, đơn vị nằm panel HTML, homoglyph, lỗi dữ liệu nguồn (V02.60 tên chiều không khớp giá trị).

| Mức | Nguồn mẫu | Metadata nằm ở đâu | Chi phí thật | Vào lớp Chuỗi? |
|---|---|---|---|---|
| **1 — API sạch** | World Bank | `sourceNote` trong REST JSON | vài ngày, đoán trước được | ✅ |
| **2 — API bẩn** | NSO PxWeb | panel HTML, phải postback | ngày + phần không đoán trước | ✅ |
| **3 — không cấu trúc** | Excel/PDF bộ ngành, tài liệu lẻ | merged header, hoặc không có | case-by-case, **có thể bất khả thi** | ❌ mặc định — Object |

Mức 3 không phải thất bại: vẫn tìm/tải/chat metadata được. Lớp Chuỗi là phần thưởng cho nguồn xứng đáng, không phải tầng bắt buộc.

### Chống trùng lặp — surface, don't merge

Verified: 2 dataset đã upload có nguồn NSO kèm pxid ngay trong URL (`san-luong-khai-thac-go` pxid=V0656, `hien-trang-rung-phan-theo-dia-phuong` pxid=V0651 — database "Nông, lâm nghiệp và thủy sản"). Database này onboard thì **trùng ngay** — không phải giả thuyết.

- **Phát hiện deterministic**: pack ghi table IDs + source URL; upload có `source.url`; ingest gặp trùng pxid → flag + review queue
- **Không auto-merge, không auto-xoá** — quyết định "cùng dữ liệu" là phán đoán ngữ nghĩa, đúng loại hố phải tránh
- **Hai bản có giá trị khác nhau — nối link chéo 2 chiều**:

| | Bản upload tay | Bản pack |
|---|---|---|
| Trạng thái | **snapshot đóng băng** — số thời điểm lấy | **sống** — refresh + query được |
| Giá trị báo chí | trích "số ngày X là Y" | số mới nhất + cảnh báo |
| Revision (§5b) | **miễn nhiễm** — đóng băng theo định nghĩa | changelog cell + báo tác giả bài liên quan |

Trang upload: "Có bản queryable trong bộ NSO →". Trang pack: "Có snapshot upload 07/08/2026 →".

(Trùng upload-vs-upload đã có soft-delete; trùng trong pack đã giải quyết bằng grain nhóm.)

---

## 7. Kiến trúc

```
L3  Web chat (Hoa)        Agent/MCP (Ninh)        Script
         └──────────────────┬──────────────────────┘
L2  Tool layer — 6 tool, KHÔNG đổi khi thêm nguồn
         ┌──────────────────┴──────────────────┐
L1  Object store (R2 + git)   Chuỗi tidy per bộ (dẫn xuất,
    = nguồn sự thật           regenerate được, xoá được)
         ┌────────────┬─────────────────────────┐
L0  Upload wizard      Connector per bộ (luồng A)
    (luồng B, không    NSO · WB · … thêm tự do
     normalize)        kill-switch ≤1 tuần/lát đầu
```

### Anatomy luồng A — sinh đúng artifact wizard đã dùng

```
json-stat API          panel HTML (postback)      → sinh
┌────────────┐   ┌──────────────────┐
│ values     │   │ đơn vị tính      │    metadata.yaml (title, source, tags,
│ valueTexts │   │ footnote NOTEX   │    dictionary, vintage, methodology)
│ dims       │   │                  │    files[].csv   (tidy long, có label)
└────────────┘   └──────────────────┘   → bulk API endpoint → R2 + git
```

| Trường | Wizard (luồng B) | Pack (luồng A) |
|---|---|---|
| File | user upload | json-stat → CSV |
| title/description | AI đề xuất, user sửa | sinh từ tên bảng + footnote |
| tags | AI + user | map database/subject → controlled vocab (cần mở rộng) |
| source | khai tay | tự động: URL + table IDs + `updated` |
| dictionary | AI đoán | **deterministic — valueTexts cho sẵn toàn bộ giá trị hợp lệ của chiều**; đơn vị từ nguồn |
| vintage/methodology | không có | có |
| AI/review | cần | **không cần AI; cần người xác nhận đơn vị ~13% nhóm** (spike: 4/31) |

**Payoff**: pack sinh đúng artifact shape catalog đã hiểu → preview, histogram, search, download, article-linking hoạt động luôn. Bulk endpoint (decision mở) = vòng lặp gọi commit API hiện có — giữ bất biến CLAUDE.md: mọi thay đổi qua API, không ghi trực tiếp R2/GitHub.

---

## 8. Tool layer + chat + retrieval

### 6 tool

`search_datasets` · `get_schema` (cột + role + đơn vị + **giá trị hợp lệ của chiều** — chống hallucination) · `get_series` ⭐ (giá trị + provenance + vintage; đa bộ §5) · `get_file` · `get_provenance` · `upload_dataset`. HTTP trước, MCP adapter sau (vỏ mỏng, cuối roadmap).

### Chat trả gì — tách theo intent, không chọn một

| Câu hỏi kiểu | Chat trả |
|---|---|
| "Có data gì về rừng?" (discovery) | chỉ card dataset |
| "Tỷ lệ thất nghiệp Đà Nẵng 2024?" | **con số + cảnh báo + card nguồn** — cặp này là đơn vị trust |
| "Dân số Việt Nam 2024?" (trúng 2 bộ) | 2 số + giải thích khác biệt + 2 card (§5) |

Card luôn đi kèm số; số chỉ xuất hiện khi được hỏi.

### Retrieval — giữ hằng số khi scale

`formatDataset()` = 580 tokens/dataset (verified). 503 dataset stuff-all = 288K tokens/query → âm thầm tệ (cost + needle-in-haystack trên entry đồng dạng), failure tệ nhất là câu trả lời *nghe hợp lý mà sai*.

- **C1**: BM25 pre-filter in-process trên `index.json` — **index ở cấp NHÓM, không cấp bảng** (điều kiện để grain §3 hoạt động: nếu index 500 dataset-bảng, query "thiếu việc làm" trả 7 entry gần trùng, ăn 7/40 slot cho một khái niệm). `index.json` phải mang `indicator_group`; nội dung index = tên nhóm + hợp các cách phân tổ của các bảng trong nhóm. Title nguồn lớn theo công thức → lexical khớp thẳng; ~250 nhóm không cần Meilisearch
- **C2**: compressed card cho pack (~70 tokens vs 580, giảm 8×)
- **C3**: curated luôn nạp vô điều kiện
- **C4**: Discovery Chat gọi `get_series` khi câu hỏi cần giá trị

Kết quả: `curated_all + bm25_top_40 ≈ 27K tokens/query` — **hằng số**, không phụ thuộc catalog.

---

## 8b. Chống số sai — kiến trúc kiểm chứng

Rủi ro nghiệp vụ lớn nhất của lớp Chuỗi: **số sai lên bài → đính chính → mất uy tín, có thể kỷ luật.** Phần này là hợp đồng chống lại nó.

### Điểm xuất phát

**Giá trị không bị hallucinate nếu nó đến từ tool call** — `get_series` đọc từ file, LLM không sinh ra số. Nhưng **mọi thứ quanh con số thì có thể sai**, và:

> Một con số **có thật nhưng trả lời sai câu hỏi** nguy hiểm hơn hallucinate lộ liễu — vì nó trông đúng, có nguồn, có link, và không ai bắt được.

### Sáu đường sai, xếp theo mức nguy hiểm

| # | Kiểu sai | Số có thật? | Người dùng tự bắt được? | Chặn bằng |
|---|---|---|---|---|
| 1 | **Sai câu hỏi** — tra đúng cell nhưng không phải cell người hỏi (nhầm chỉ tiêu, nhầm địa giới 63/34, nhầm khái niệm) | ✅ | ❌ | V4 (hiện truy vấn) — *giảm, không triệt* |
| 2 | LLM chép sai chữ số khi viết văn (1,86 → 1,68) | ❌ | ❌ | **V1 hậu kiểm** — triệt |
| 3 | Chọn nhầm bảng trong nhóm (5 phân tổ của "thất nghiệp") | ✅ | ❌ | V4 | 
| 4 | Bỏ mất cảnh báo sơ bộ khi diễn đạt | ✅ | ❌ | **V3** — triệt |
| 5 | Gán sai đơn vị (`%` vs `‰` vs `nam/100 nữ`) | ✅ | ❌ | **V3 + V5** — triệt |
| 6 | LLM tự tính (tăng trưởng, chênh lệch, xếp hạng) | ❌ | ❌ | **V2 cấm** — triệt |

Sai #5 không phải giả thuyết: spike ngày 2026-08-24 đã tạo ra đúng lỗi này — cột `dan_so_trung_binh` của `V02.02` chứa 3 đơn vị (`nghìn người`, `%`, `%`) mà manifest gán cả cột là "Nghìn người", `needs_review=false`. Giao diện xanh, số hiện ra, chỉ đơn vị sai. Đã sửa ở `6a1b79f`, nhưng nó chứng minh: **lỗi loại này không tự lộ.**

### Sáu luật kiểm chứng (V1–V6)

**V1 — Trích, không sinh.** Mọi token số trong câu trả lời phải là **bản sao nguyên văn** một giá trị trong tool response. Hậu kiểm tất định: sau khi LLM generate, đối chiếu mọi số trong answer với tool result; không khớp → chặn, không hiển thị. Đây là **kiểm bằng code, không phải chỉ dẫn trong prompt** — prompt có thể bị bỏ qua, hậu kiểm thì không.

**V2 — LLM không được làm số học.** Tăng trưởng, chênh lệch, tổng, xếp hạng, quy đổi đơn vị → **tool tính**, hoặc trả lời "chưa hỗ trợ". LLM tính sai là loại lỗi vừa không verify được vừa không để lại dấu vết. (Ngoại lệ duy nhất: phát biểu định tính không kèm số — "cao hơn", "giảm so với năm trước".)

**V3 — Cảnh báo do UI render, không do LLM viết.** `vintage`, `unit`, `footnote` lấy thẳng từ tool response và render bằng component. LLM không kiểm soát → không bỏ sót được. Đây là lý do §4 nói cặp *số + cảnh báo + card* là **một đơn vị hiển thị**, không phải ba mảnh rời.

**V4 — Hiện truy vấn đã dùng.** Kèm mỗi câu trả lời, dạng người đọc được:

```
Đã tra: Tỷ lệ thất nghiệp trong độ tuổi lao động
        bảng phân theo địa phương · Đà Nẵng · Sơ bộ 2024
```

Đây là **thứ duy nhất** bắt được lỗi #1 và #3. Không có nó thì phóng viên không có cách nào biết hệ thống hiểu sai câu hỏi.

**V5 — Mỗi số một đường kiểm chứng.** Một cú bấm tới đúng bảng gốc trên trang NSO. Khi biên tập viên chất vấn, phóng viên phải trưng được: bảng nào, dòng nào, lấy lúc nào, nguồn ghi gì. Đây là **khu provenance/verify** của §4 — thiết kế có chủ đích, không phải link phụ.

**V6 — Không có thì nói không có.** Không lấy cell gần nhất, không nội suy, không đổi năm gần đúng. Trả "không có số này trong kho" là câu trả lời hợp lệ và an toàn.

### Rủi ro còn lại — không kỹ thuật nào chặn được

Lỗi #1 (**sai câu hỏi**) không triệt được. Nếu phóng viên hỏi về một khái niệm mà dữ liệu không đo, mọi hậu kiểm đều pass — số đúng, nguồn đúng, chỉ là trả lời câu khác.

Ba thứ giảm nó, không triệt:
- V4 hiện truy vấn → phóng viên đọc thấy "à, nó hiểu thành cái khác"
- Footnote hiện ra (§5b) → "số liệu từ 2021 theo chuẩn ICLS 19" cảnh báo chuỗi bị đứt
- Chặn so sánh xuyên 63/34 (§3) → không cho phép loại so sánh sai phổ biến nhất

**Phải nói thẳng với phóng viên**: hệ thống bảo đảm *con số này có trong nguồn X, tại ô Y*. Nó **không** bảo đảm *con số này trả lời đúng câu hỏi của bạn*. Việc thứ hai vẫn là trách nhiệm biên tập.

### Đo — không tin, phải kiểm

Mở rộng `scripts/eval-chat.mjs` với câu hỏi có **đáp án số biết trước**:

| Metric | Ngưỡng gate cho G2 |
|---|---|
| Exact-match tỷ lệ con số | **100%** — V1 làm cho nó tất định; dưới 100% là có bug |
| Tỷ lệ câu trả lời có cảnh báo khi `vintage ≠ chinh_thuc` | **100%** — V3 làm cho nó tất định |
| Tỷ lệ hiện truy vấn đã dùng (V4) | **100%** |
| Tỷ lệ chọn đúng bảng trong nhóm | đo, chưa đặt ngưỡng — cần dữ liệu thật |

Ba dòng đầu **phải** là 100% vì V1/V3/V4 là cơ chế tất định, không phải xác suất. Nếu không đạt 100% nghĩa là cơ chế chưa được cài đúng chỗ, không phải "model chưa đủ tốt".

---

## 9. Kill-switch — số chốt TRƯỚC

Rủi ro lớn nhất còn lại: mỗi bộ mới phát sinh "một chút" chuẩn hoá riêng, cộng dồn thành treadmill (đã khai tử PostgreSQL vì đúng treadmill này). Phòng bằng con số cam kết trước:

> **Định nghĩa đo**: từ lúc bắt đầu connector đến lúc **≥1 chỉ tiêu của bộ đó trả số đúng qua `get_series`** ("lát đầu" — không đo cả bộ; NSO full 12 database có thể 2-3 tuần chỉ vì postback, không vi phạm nếu lát đầu nhanh).
>
> **≤ 1 tuần** → pattern đúng, tiếp tục. **1-2 tuần** → review xem phần đắt nằm ở đâu. **> 2 tuần** → **DỪNG, nghĩ lại kiến trúc.**

Mỗi lần thêm bộ: **ghi log thời gian + phân loại** (cơ khí parsing vs quyết định ngữ nghĩa). Nếu ngữ nghĩa chiếm phần lớn → luật đang bị vi phạm ở đâu đó. Log này là metric sống của kiến trúc. Mức 3 (không cấu trúc) không đo bằng kill-switch — không vào lớp Chuỗi thì không có tuần để tính.

---

## 10. Roadmap — theo gate, không theo feature list

### G0 — Đo demand ✅ **PASS 2026-08-24**

**Kết quả**: đa phần phóng viên cần **con số**; chỉ phóng viên dữ liệu cần **raw data**.

Hai hệ quả:

1. **G2 (Chat con số) là ưu tiên cao**, không phải tuỳ chọn — nó là lý do lớp Chuỗi tồn tại
2. **Model ba lớp (§3) được xác nhận**: lớp Chuỗi phục vụ số đông (Hoa), lớp Object phục vụ số ít nhưng nặng (Ninh). Không lớp nào thừa

Hệ quả thứ ba, quan trọng nhất và **mới**: nếu số đông dùng con số để viết bài, thì **độ chính xác không còn là thuộc tính chất lượng — nó là điều kiện tồn tại**. Số sai lên bài → đính chính → mất uy tín, có thể kỷ luật. Đây là lý do §8b tồn tại và là **điều kiện gate của G2**.

> Ghi chú trung thực: spike 2026-08-24 build trước khi có G0. Nó chứng minh lớp Chuỗi *làm được*; G0 mới chứng minh *đáng làm*.

### G1 — NSO toàn bộ: ~500 bảng, 12 database

Trật tự chốt 2026-08-24: **làm xong NSO hết → Discovery Chat → bộ nguồn khác.**

**1a — Hoàn tất `Dân số và lao động`** (spike có ~50-60% theo công sức):
1. Đổi đơn vị đăng ký theo grain mới (bảng = dataset + `indicator_group`) — nhẹ, không fetch lại
2. Bulk headless endpoint (điều kiện chạy hàng loạt)
3. Quy ước tên/hiển thị §4 (đúng từ đầu) + test case slugifier Đ/Ð
4. Refresh sinh changelog cell, KHÔNG ghi đè (§5b)
5. Người xác nhận đơn vị ~13% nhóm (4/31 spike)
6. `index.json` nhóm hóa (điều kiện C1 §8)

**1b — 11 database còn lại** (7/12 cần postback fallback). Ghi thời gian từng database — dữ liệu kill-switch nội bộ: cùng bộ nên rủi ro thấp hơn nguồn mới, nhưng vẫn đo để phát hiện phần đắt bất thường.

**Exit criteria**: toàn bộ bảng NSO trên catalog — tìm theo nhóm, preview, tải, provenance đầy đủ (footnote + vintage + updated). **Không gồm** chat trả con số.

### G2 — Discovery Chat con số (ưu tiên cao sau G0 pass)

1. `get_schema` + `get_series` qua HTTP
2. Wire Discovery Chat gọi `get_series`
3. **C1-C3 retrieval** — bắt buộc ở đây, catalog đã ~500 entry
4. Display contract trong chat: số + cảnh báo + card, không lộ mã bảng (§4)
5. Response shape đa bộ **thiết kế sẵn** (mảng nguồn) — logic so khớp để G3
6. Eval chat mở rộng + **§5b notify**: changelog × Article Linking → báo tác giả (usage đã có từ G1)
7. **V1–V6 (§8b) — điều kiện gate, không phải polish.** V1 hậu kiểm số literal · V2 cấm LLM làm số học · V3 cảnh báo do UI render · V4 hiện truy vấn đã dùng · V5 link kiểm chứng · V6 không có thì nói không có

**Tiêu chí pass**: Hoa hỏi "tỷ lệ thất nghiệp Đà Nẵng 2024" → nhận `1,86%` + dòng cảnh báo sơ bộ + dòng "đã tra bảng nào" + link nguồn.

**Gate số (§8b)**: exact-match con số **100%** · cảnh báo khi `vintage ≠ chinh_thuc` **100%** · hiện truy vấn **100%**. Ba con số này phải tuyệt đối vì V1/V3/V4 là cơ chế tất định — không đạt nghĩa là cài sai chỗ, không phải model yếu. **Không đạt gate thì không mở cho phóng viên**, dù mọi thứ khác xong.

### G3 — Bộ thứ hai + các dataset sau: World Bank

WB = đo kill-switch thật (mức 1, dễ nhất; bù chỗ NSO thiếu: chuỗi 1960-2025 + so sánh quốc tế) + cầu alias Việt↔Anh — §5 tier 2 hoạt động thật lần đầu. Tripwire: bộ thứ 4 trở đi viết lý do vào §12 trước khi bắt đầu.

### G4 — Surface + agent

Tách Curated/Thống kê chính thức · facet (chủ đề, cấp địa lý, khoảng năm, nguồn, **bộ**) · search primary nav · trang nhóm chỉ tiêu (chart + bảng + provenance + download — chỗ vintage/footnote hiện ra) · `source_tier` hiển thị · MCP adapter. Chỉ có nghĩa khi có volume thật.

---

## 11. Không build — luật

| Không | Vì |
|---|---|
| ❌ Hợp nhất xuyên bộ (cross-pack merge) | §1 — đắt vô hạn, giấu khác biệt |
| ❌ Ontology khái niệm toàn cầu / semantic layer | so khớp bằng alias curate tay (§5); enterprise pattern cho multi-surface |
| ❌ Bảng gộp / super table | 17/25 measure không cộng được; ghép lúc đọc rẻ hơn |
| ❌ Remap địa giới ngầm | §3 — lưu theo thời đại, chặn so sánh xuyên 63/34 |
| ❌ Cap số connector | chặn giá trị thay vì cắt nguyên nhân; kỷ luật sống ở kill-switch + log |
| ❌ Normalize nhỏ giọt trong bộ | cả bộ hoặc không (§1) |
| ❌ AI reviewer cho luồng A | metadata nguồn structured — LLM đoán lại thứ đã biết = tốn tiền + nhiễu + mất reproducibility |
| ❌ **LLM tự sinh/tự tính con số** | §8b V1+V2 — số phải là bản sao từ tool call; số học do tool làm |
| ❌ **Để LLM tự viết cảnh báo vintage/đơn vị** | §8b V3 — UI render từ tool response, LLM không kiểm soát thì không bỏ sót được |
| ❌ Chart builder · notebook · SQL panel | việc của agent |
| ❌ Vector DB / embedding | chưa chạm trigger criteria; BM25 đủ |
| ❌ PostgreSQL | ~300K dòng/bộ — parquet/CSV + đọc lúc cần |
| ❌ Fine-tune text-to-SQL | text-to-cube: schema đồng nhất per bộ, slot đối chiếu valueTexts được — bài toán đổi loại |
| ❌ MCP trước HTTP | vỏ cho ruột chưa có |
| ⏸️ Materialized bảng | defer đến khi agent vất vả multi-call |
| ⏸️ Microdata vào lớp Chuỗi | tổng hợp = quyết định biên tập |

---

## 12. Quyết định

### Đã chốt trong v3

| Quyết định | Kết quả |
|---|---|
| Chi phí nằm ở đâu | lời hứa hợp nhất, không phải số nguồn |
| Cap connector (R1 cũ) | **bỏ** — thay bằng luật không-trộn |
| Normalize theo demand (R3 cũ) | **bỏ** — cả bộ hoặc không; demand chọn *bộ*, không chọn *bảng* |
| Grain (mở #1 cũ) | **bảng = dataset, chỉ tiêu = nhóm hiển thị/search** |
| Địa giới | không harmonize, chặn so sánh xuyên thời đại |
| Tên cột + hiển thị | quy ước 5 quy tắc + hợp đồng hiển thị §4 |
| Trùng lặp | surface-don't-merge, nối link chéo, flag pxid |
| Trả lời khi alias trượt | **mặc định phơi bày** — cơ chế 2 tầng (§5): cùng ngôn ngữ tự trình cả hai, chéo ngôn ngữ chỉ qua alias + đo coverage bằng eval |
| Chính sách revision (v3.1) | changelog cấp cell (không ghi đè) + join Article Linking → báo tác giả. Build G2; G1 chỉ cần refresh không ghi đè (§5b) |
| Tripwire connector | bộ thứ 4 trở đi viết lý do vào §12 trước khi bắt đầu |
| **G0 (v3.2)** | ✅ **PASS** — đa số cần con số, phóng viên dữ liệu cần raw. G2 lên ưu tiên cao |
| **Chống số sai (v3.2)** | **V1–V6 §8b** là gate của G2, không phải polish. Số đến từ tool call; hậu kiểm bằng code, không bằng prompt |

### Còn mở

| # | Quyết định | Ghi chú |
|---|---|---|
| 1 | **Chạy G0** | mọi thứ sau là đặt cược không bằng chứng nếu bỏ qua |
| 2 | **Update constitution** | `mission.md:21` "không re-host GSO/WB — chỉ link"; metric "30-50 datasets"; roadmap "Post-Phase 3: automated fetching" — cả ba mô tả sản phẩm khác. Làm ngay khi doc này duyệt, trước `/feature-spec`. Kèm câu định vị §0 nguyên văn |
| 3 | **Bulk ingest endpoint** | cần cho G1; vẫn qua API |
| 4 | **Mở rộng tags controlled vocabulary** | map database/subject NSO vào tags — cần pass duyệt danh mục |
| 5 | **Sửa bảng tra tỉnh** `DATA_DICTIONARY.md` | bug thật (VN-LC trùng, 10/34 thiếu, scheme không nhất quán) nhưng không gấp — không chặn G0/G1 |

---

## 13. Chỗ design này có thể sai

- ~~**Giả định nền chưa đo**~~ → **G0 PASS 2026-08-24**, giả định được xác nhận. Rủi ro này đóng
- **Lỗi "sai câu hỏi" (§8b #1) không triệt được**: số đúng, nguồn đúng, nhưng trả lời câu khác. Mọi hậu kiểm đều pass. Chỉ giảm được bằng V4 + footnote + chặn so sánh xuyên thời đại. **Đây là rủi ro nghiệp vụ lớn nhất còn lại của toàn sản phẩm** — phải nói thẳng với phóng viên chứ không giấu sau giao diện tự tin
- **V1 (trích không sinh) có thể quá nghiêm**: chặn cả câu trả lời hợp lệ nếu LLM làm tròn hoặc đổi định dạng số (`1.8617801434` → `1,86`). Cần chuẩn hoá cách so khớp (làm tròn + dấu thập phân VN) trước khi bật chặn cứng — nếu không, tỷ lệ chặn nhầm cao sẽ khiến người ta tắt V1
- **§5 khó hơn tưởng**: ranh giới "alias curate tay" có thể bị đòi mở rộng — cánh cửa ontology quay lại. Cản trở đặc thù: **cầu chéo ngôn ngữ Việt↔Anh chỉ có alias** — tier-1 lexical không cứu được NSO↔WB, nên chất lượng trải nghiệm đa bộ phụ thuộc gần hết vào việc curate alias đều đặn. Tín hiệu cảnh báo: thiết kế §5 tốn >2 ngày, hoặc eval coverage alias giảm dần theo thời gian
- **Kỷ luật quy trình thay hàng rào cứng**: bỏ cap nghĩa là kill-switch + log phải được giữ thành nghi thức thật — không hợp lý hoá sau khi biết kết quả
- **Chi phí per-nguồn chỉ có 1 điểm dữ liệu** (NSO ~1 ngày). NSO có thể là nguồn dễ hoặc khó bất thường — G2 mới biết
- **Địa lý chỉ 36%** bảng NSO (đo 110 bảng) — đừng kỳ vọng mọi chỉ tiêu tra theo tỉnh
- **Lớp Chuỗi sẽ chủ yếu là NSO+WB**: quy tắc role khớp một phần với file upload. Nếu giữ nguyên, giá trị lớp Chuỗi phụ thuộc gần hết vào hai nguồn — chấp nhận, đừng bán là "mọi dataset tra được số"
- **Chưa verify**: `data.gov.vn`, `gis.nso.gov.vn` không kết nối được từ môi trường test (curl `000`)

---

## Phụ lục — Chi tiết nguồn NSO (spike 2026-08-24)

Giữ làm bằng chứng cho §1, §3, §6. Không cần đọc nếu chỉ quan tâm design.

**Truy cập**: `POST https://pxweb.nso.gov.vn/api/v1/vi/{db}/{table}.px`, `{"response":{"format":"json-stat"}}`. Query rỗng trả 404 — phải liệt kê đủ chiều. Strip byte `\x00` cuối. API chỉ phủ **5/12** database tiếng Việt; 7 DB còn lại cần postback ASP.NET. Cell limit 100.000. 3 luồng song song (6 bị 429).

**Format**: chỉ `json-stat` UTF-8 sạch. `csv`/`px` trả `Windows-1252`, dấu bị thay byte `0x3F` tại server — không codec nào cứu được.

**User-Agent phải prefix `Mozilla/5.0`**: ASP.NET browser-capability detection. Cùng POST, UA lạ → 78.531 byte không footnote; `Mozilla/5.0` → 81.773 byte có footnote.

**Đơn vị + footnote**: không có trong API. Lấy từ panel HTML table view (`information_unit_value`, `footnote_note_value`) qua postback. Trang Phương pháp luận có khái niệm nhưng không có field đơn vị.

Đơn vị heuristic tiếng Việt sai chắc: `Tỷ số giới tính → Số nam/100 nữ` (không phải %) · `Tỷ suất sinh thô → ‰` · `Tổng tỷ suất sinh → Số con/phụ nữ` · `Tỷ suất chết trẻ em → .../1000 trẻ em` · `Năng suất lao động → Triệu đồng/lao động`.

**Grain**: gom bảng theo stem trước "phân theo": 63 bảng → 31 nhóm. `Tỷ lệ thiếu việc làm` có 7 bảng. (Lưu ý: v3 đổi đơn vị catalog sang bảng — nhóm giữ làm display/search layer.)

**Quy mô**: ~610 cells/bảng (mẫu 30) → ~305K cells cho 500 bảng ≈ parquet 5-15 MB. Khớp mirror HF `tmquan/nso-gov-vn` (316.108).

**Bẫy khác**: homoglyph `Đ` U+0110 vs `Ð` U+00D0 (NFKC không sửa) · 4 cách gọi cùng chiều địa lý · vintage nhúng nhãn năm · V02.60 tên chiều `Thành thị, nông thôn` nhưng giá trị `Nam/Nữ` (lỗi nguồn).

**Review tay**: 4/31 nhóm cần sửa sau khi lấy đơn vị từ nguồn (trước đó 20). Ngoại suy 500 bảng: ~32 nhóm, dưới một giờ người.
