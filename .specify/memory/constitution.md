<!--
SYNC IMPACT REPORT
==================
Version change: (chưa có) → 1.0.0
Loại bump: MAJOR — lần adopt đầu tiên, thay toàn bộ placeholder của template.

Principles được định nghĩa (5/5 slot):
  - [PRINCIPLE_1_NAME] → I. Accuracy First — Mỗi Con Số Trace Được Nguồn (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. Bộ Nguồn Không Trộn (NON-NEGOTIABLE)
  - [PRINCIPLE_3_NAME] → III. File Là Sự Thật, Chuỗi Là Dẫn Xuất
  - [PRINCIPLE_4_NAME] → IV. Demand-Driven, Không Đầu Cơ
  - [PRINCIPLE_5_NAME] → V. AI Đề Xuất, Người Quyết

Sections được định nghĩa:
  - [SECTION_2_NAME] → Ràng Buộc Kỹ Thuật
  - [SECTION_3_NAME] → Không Build (Luật, Không Phải Gợi Ý)

Removed sections: không có (template trống).

Nguồn nội dung:
  - constitution/mission.md (Key Principles, model ba lớp, hai luồng ingest)
  - constitution/tech-stack.md (Constraints + Constraints bổ sung Phase 2.5)
  - docs/product-design-proposal.md v3.2 (§1 luật trung tâm, §2 bất biến,
    §8b V1–V6, §9 kill-switch, §11 Không build)
  - CLAUDE.md (Process Rules, Quy ước)
  - specs/_archive/ (mục `## Decisions` của 21 spec /sdd)

CỐ Ý ĐỂ NGOÀI constitution (nguyên tắc: luật vào constitution, thiết kế vào
design doc, lịch sử vào roadmap):
  - Model ba lớp / grain / khuôn cột / quy ước tên → docs/product-design-proposal.md
  - Lịch sử quyết định + số liệu đo được → constitution/roadmap.md Replanning Log
  - Roadmap gate G0–G4 → constitution/roadmap.md

Follow-up TODO: không có. Mọi placeholder đã thay bằng nội dung cụ thể.
-->

# VnExpress Data Platform Constitution

## Core Principles

### I. Accuracy First — Mỗi Con Số Trace Được Nguồn (NON-NEGOTIABLE)

Sản phẩm phục vụ tòa soạn. Số sai lên bài dẫn tới đính chính, mất uy tín, có thể
kỷ luật. Độ chính xác không phải thuộc tính chất lượng — nó là điều kiện tồn tại.

Sáu luật kiểm chứng. Tất cả PHẢI được cưỡng chế **bằng code**, KHÔNG bằng chỉ dẫn
trong prompt — prompt có thể bị bỏ qua, hậu kiểm thì không:

- **V1** — Mọi token số trong câu trả lời PHẢI là bản sao nguyên văn một giá trị
  trong tool response. Hậu kiểm tất định sau khi generate; không khớp thì CHẶN.
- **V2** — LLM KHÔNG ĐƯỢC làm số học (tăng trưởng, chênh lệch, tổng, xếp hạng,
  quy đổi đơn vị). Tool tính, hoặc trả lời "chưa hỗ trợ".
- **V3** — Cảnh báo (`vintage`, đơn vị, footnote phương pháp) PHẢI do UI render
  từ tool response. LLM không kiểm soát thì không bỏ sót được.
- **V4** — Mọi câu trả lời PHẢI hiện truy vấn đã dùng (chỉ tiêu, bảng nguồn,
  filter, khoảng thời gian). Đây là cơ chế duy nhất bắt được lỗi "tra đúng ô
  nhưng trả lời sai câu hỏi".
- **V5** — Mỗi con số PHẢI có một đường kiểm chứng một-cú-bấm tới bảng gốc.
- **V6** — Không có dữ liệu thì PHẢI nói không có. Cấm lấy ô gần nhất, cấm nội
  suy, cấm đổi sang năm gần đúng.

Giới hạn PHẢI được nói thẳng với người dùng, không giấu sau giao diện tự tin:
hệ thống bảo đảm *con số này có trong nguồn X tại ô Y*; hệ thống KHÔNG bảo đảm
*con số này trả lời đúng câu hỏi của bạn*.

### II. Bộ Nguồn Không Trộn (NON-NEGOTIABLE)

Chi phí thật của platform nằm ở **lời hứa hợp nhất nguồn**, không nằm ở số lượng
nguồn. Đọc dữ liệu vào thì rẻ và lặp lại được; bắt các nguồn đồng ý với nhau thì
đắt vô hạn — mỗi câu trả lời lại mở ra ba câu hỏi mới.

- Mỗi nguồn là một **bộ riêng**. PHẢI giữ nguyên nhãn, đơn vị, cảnh báo và địa
  giới của chính nguồn đó.
- KHÔNG BAO GIỜ merge hai bộ thành một hệ số liệu chung, kể cả khi chúng cùng
  một khái niệm.
- Khi nhiều bộ cùng chứa một khái niệm, `get_series` PHẢI trả về **tất cả** kèm
  nguồn và khác biệt định nghĩa. CẤM chọn hộ người dùng.
- So sánh xảy ra **lúc trả lời**, trước mắt người hỏi — không lúc lưu trữ, nơi
  khác biệt bị giấu đi.

Ba hệ quả bắt buộc: chuẩn hoá **cả bộ hoặc không** (cấm nhỏ giọt trong một bộ) ·
KHÔNG chuẩn hoá file người dùng upload (bề mặt bẫy không giới hạn) · KHÔNG hợp
nhất địa giới hành chính giữa hai thời đại (63 tỉnh trước 2025 và 34 tỉnh là hai
hệ khác nhau; phần lớn measure theo tỉnh là tỷ lệ nên không cộng được).

### III. File Là Sự Thật, Chuỗi Là Dẫn Xuất

Cloudflare R2 (file thô) + git metadata (`metadata.yaml`, `dictionary.md`) là
nguồn sự thật duy nhất.

- Mọi artefact khác — chuỗi tidy đã chuẩn hoá, `index.json`, cache, changelog —
  PHẢI regenerate được từ nguồn sự thật và PHẢI xoá được an toàn.
- KHÔNG có dữ liệu dẫn xuất nào được coi là bản gốc.
- Provenance đến từ git history, KHÔNG viết lại nó bằng bảng audit riêng.

Lý do: đây là thứ giữ cho platform không rơi lại vào treadmill migration đã khai
tử kiến trúc PostgreSQL — mọi thay đổi hình dạng dữ liệu là chạy lại script,
không phải viết migration.

### IV. Demand-Driven, Không Đầu Cơ

PHẢI đo trước, xây sau. Không đầu tư năng lực cho nhu cầu chưa chứng minh.

Ba nghi thức bắt buộc, PHẢI được giữ như nghi thức thật chứ không hợp lý hoá sau
khi biết kết quả:

- **Gate** — mỗi giai đoạn có tiêu chí dừng viết trước. Không pass thì không đi tiếp.
- **Kill-switch** — thêm một bộ nguồn mới mà "lát đầu" (≥1 chỉ tiêu trả số đúng
  qua `get_series`) tốn hơn **2 tuần** thì PHẢI DỪNG và xem lại kiến trúc.
  Dưới 1 tuần là lành mạnh; 1–2 tuần thì review xem phần đắt nằm ở đâu.
- **Tripwire** — bộ nguồn thứ tư trở đi PHẢI viết lý do (nguồn gì, vì sao, dự
  kiến bao lâu) vào `docs/product-design-proposal.md` TRƯỚC KHI bắt đầu.

Mỗi lần thêm bộ nguồn PHẢI ghi log thời gian và phân loại chi phí (cơ khí parsing
vs quyết định ngữ nghĩa). Nếu ngữ nghĩa chiếm phần lớn, một luật nào đó đang bị
vi phạm.

### V. AI Đề Xuất, Người Quyết

AI viết nháp để người dùng không phải nhìn trang trắng. AI KHÔNG quyết.

- AI KHÔNG quyết đơn vị đo. Đơn vị lấy từ metadata của nguồn, hoặc người xác nhận.
- AI KHÔNG sinh và KHÔNG tính con số (xem V1, V2).
- AI KHÔNG viết cảnh báo (xem V3).
- AI KHÔNG kết luận hai nguồn là cùng một khái niệm.
- Nguồn đã có metadata structured thì PHẢI xử lý deterministic. CẤM cho LLM đoán
  lại thứ đã biết chắc — vừa tốn tiền, vừa thêm nhiễu, vừa mất khả năng tái lập.

Đoán sai một cách thầm lặng tệ hơn để trống: để trống thì người dùng biết mà
kiểm, đoán sai thì không ai phát hiện.

## Ràng Buộc Kỹ Thuật

Các ràng buộc dưới đây là điều kiện, không phải khuyến nghị.

| # | Ràng buộc | Lý do |
|---|---|---|
| 1 | KHÔNG thêm PostgreSQL/Supabase | Khối lượng dữ liệu nhỏ; đọc file lúc cần là đủ |
| 2 | File thô KHÔNG commit vào git | Chỉ ở R2; git chỉ giữ metadata dạng text |
| 3 | Browser upload PHẢI qua presigned URL | Tránh giới hạn body size của serverless |
| 4 | Mọi thay đổi dataset PHẢI đi qua API | Ghi trực tiếp GitHub/R2 làm lệch hai store |
| 5 | Refresh KHÔNG được ghi đè vô điều kiện | Phải sinh changelog cấp cell, key đủ chiều |
| 6 | KHÔNG thêm dependency khi chưa được duyệt | |
| 7 | Vietnamese-first, hybrid | Danh từ kỹ thuật tiếng Anh; động từ và thông báo lỗi tiếng Việt |
| 8 | Branding là "VnExpress" | KHÔNG viết "VNExpress" |
| 9 | Timestamp provenance PHẢI tuyệt đối | `dd/mm/yyyy hh:mm` giờ Việt Nam; cấm relative time |
| 10 | Mỗi dataset PHẢI có `metadata.yaml` | Kèm `dictionary.md` nếu là tabular hoặc geospatial |
| 11 | Mỗi feature là một spec riêng | Cấm gộp nhiều feature vào một spec |

## Không Build (Luật, Không Phải Gợi Ý)

Danh sách này tồn tại vì mỗi mục đã từng được cân nhắc và bị loại có lý do. Muốn
thêm lại thì PHẢI sửa constitution trước, không phải lách qua trong một spec.

**Cấm:**

- Hợp nhất dữ liệu xuyên bộ nguồn (cross-pack merge)
- Ontology chỉ tiêu toàn cầu hoặc semantic layer
- Bảng gộp / super table giữ sẵn
- Remap địa giới hành chính ngầm
- Đặt cap cứng cho số lượng connector (kỷ luật sống ở kill-switch, không ở cap)
- Chuẩn hoá nhỏ giọt từng bảng trong một bộ nguồn
- AI reviewer cho luồng ingest bằng máy
- LLM tự sinh hoặc tự tính con số
- LLM tự viết cảnh báo vintage/đơn vị
- Chart builder, notebook, SQL panel cho người dùng cuối
- Vector DB / embedding (chưa chạm trigger criteria)
- PostgreSQL
- Fine-tune text-to-SQL
- MCP adapter trước khi có HTTP tool layer

**Hoãn (chưa cấm vĩnh viễn, nhưng cần lý do mới để mở):**

- Materialized bảng dẫn xuất gộp sẵn
- Đưa microdata vào lớp chuỗi (tổng hợp microdata là quyết định biên tập)

## Governance

Constitution này **thắng mọi spec, plan và tasks**. Khi một spec mâu thuẫn với
constitution, PHẢI sửa spec — hoặc sửa constitution trước rồi mới sửa spec, không
bao giờ để hai bên mâu thuẫn tồn tại song song.

**Thủ tục sửa đổi:**

1. Đề xuất sửa đổi PHẢI nêu rõ luật nào đổi và vì sao.
2. Sửa `.specify/memory/constitution.md` và tăng version theo mục dưới.
3. Ghi lý do vào `constitution/roadmap.md` mục Replanning Log, kèm ngày.
4. Rà soát các spec đang mở xem có cái nào vừa trở nên mâu thuẫn không.

**Chính sách version (semantic versioning):**

- **MAJOR** — xoá hoặc định nghĩa lại một principle theo hướng không tương thích ngược.
- **MINOR** — thêm principle/section mới, hoặc mở rộng đáng kể một luật đã có.
- **PATCH** — làm rõ câu chữ, sửa lỗi diễn đạt, tinh chỉnh không đổi ngữ nghĩa.

**Kiểm tra tuân thủ:**

- Mọi spec PHẢI kiểm tra đối chiếu constitution trước khi sang bước `plan`.
- Mọi PR PHẢI kiểm tra không vi phạm mục "Không Build".
- Độ phức tạp phát sinh PHẢI được biện minh; không biện minh được thì cắt.
- Hướng dẫn vận hành hằng ngày (lệnh maintenance, quy ước code) nằm ở `CLAUDE.md`;
  thiết kế chi tiết nằm ở `docs/product-design-proposal.md`; lịch sử quyết định
  nằm ở `constitution/roadmap.md`. Constitution chỉ chứa luật.

**Version**: 1.0.0 | **Ratified**: 2026-08-24 | **Last Amended**: 2026-08-24
