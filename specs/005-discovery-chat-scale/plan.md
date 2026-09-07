# Implementation Plan: Discovery Chat ở quy mô vài nghìn dataset

**Branch**: `005-discovery-chat-scale` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-discovery-chat-scale/spec.md`

## Summary

Kho tăng từ 17 lên 495 dataset và sẽ lên vài nghìn. Cách làm hiện tại nạp toàn bộ
metadata mọi dataset vào từng câu hỏi — 202.876 token/câu và hơn một nghìn lượt gọi
GitHub API mỗi lần hết cache, dùng chung hạn mức với trang danh mục nên có thể làm
trang chủ ngừng hoạt động.

Cách làm: tách việc tra cứu thành **ba năng lực độc lập với mặt tiền** (tìm dataset /
lấy mô tả dataset / tra giá trị), tầng chọn dùng **hybrid retrieval** (vector ngữ nghĩa
+ khớp từ khoá chính xác) nên chi phí prompt không phụ thuộc số dataset. Kèm bốn việc
phụ trợ: lưu đủ danh sách giá trị cột, điền phạm vi thời gian, giữ ngữ cảnh cuộc trò
chuyện, và chặn việc đưa ra con số không kiểm chứng được.

Nguồn số liệu và phần so sánh phương án: [`docs/de-xuat-ama-quy-mo-lon.md`](../../docs/de-xuat-ama-quy-mo-lon.md).

## Technical Context

**Language/Version**: TypeScript 5.x trên Next.js 16.2.11 (App Router, React 19).
Python 3.13 cho script xử lý dữ liệu ngoài luồng chạy (`data/scripts/`).

**Primary Dependencies** (đã có, không thêm mới): `openai` (client OpenAI-compatible
trỏ tới endpoint Gemini), `@aws-sdk/client-s3` (R2), `@octokit/rest` + GitHub Contents
API (metadata), `yaml`, `next-auth`.

**Storage**:
- Metadata + dictionary → GitHub repo (`datasets/<slug>/`), git history = provenance
- Raw file, log chat, counter download → Cloudflare R2
- **Mới**: chỉ mục tra cứu (vector + chỉ mục giá trị) → R2, không phải git

**Testing**: dự án **không có test framework**. Kiểm chứng bằng:
- `npm run typecheck` (tsc --noEmit) và `npm run lint`
- `npm run eval:chat` — bộ đo sẵn có (`scripts/eval-chat.mjs`, `eval/gold-questions.json`)
- Kiểm tay theo `quickstart.md`

Thêm test framework = thêm dependency → cần bạn phê duyệt riêng, không nằm trong phạm vi này.

**Target Platform**: Vercel serverless (Node runtime) + trình duyệt. Không có tiến
trình chạy dài, không có bộ nhớ dùng chung giữa các lần gọi.

**Project Type**: web app full-stack (Next.js), một mặt tiền duy nhất trong đợt này.

**Performance Goals**: ≤15.000 token input mỗi câu hỏi ở mọi quy mô (SC-001); chữ đầu
tiên hiện trong 4 giây (SC-012); ≤30 lượt gọi GitHub API mỗi câu hỏi.

**Constraints**:
- Không thêm dependency runtime mới (quy tắc CLAUDE.md)
- Không thêm PostgreSQL/vector database (`constitution/tech-stack.md` § Constraints)
- Raw file và dữ liệu sinh ra không commit vào git — chỉ metadata text
- GitHub REST 5.000 lượt/giờ, **dùng chung** với luồng danh mục
- Serverless: không giữ được state giữa các request, cold start phải tính vào SC-012
- Toàn bộ chữ hiển thị bằng tiếng Việt

**Scale/Scope**: 495 dataset hôm nay → vài nghìn. 5–20 phóng viên. Trần 500 câu/người/
ngày, 5.000 câu/hệ thống/ngày (FR-054). Chỉ mục vector ~6 MB ở 2.000 dataset.

## Constitution Check

*GATE: phải qua trước Phase 0. Kiểm lại sau Phase 1.*

`.specify/memory/constitution.md` là template chưa điền. Constitution thật của dự án
nằm ở `constitution/` + quy tắc quy trình trong `CLAUDE.md`. Các cổng lấy từ đó:

| # | Cổng | Kết quả | Ghi chú |
|---|---|---|---|
| G1 | Không thêm dependency mới khi chưa được phê duyệt | ✅ Qua | Embedding gọi qua HTTP bằng client `openai` sẵn có hoặc `fetch`; vector lưu R2 bằng `@aws-sdk/client-s3` sẵn có |
| G2 | Không thêm PostgreSQL / vector database | ✅ Qua | Vector là một object trong R2, đọc vào memory mỗi lần gọi. Xem lý do ở `research.md` |
| G3 | Metadata text → GitHub; dữ liệu nhị phân → R2 | ✅ Qua | Vector là **dữ liệu sinh ra, tái tạo được**, không phải metadata → R2. Commit 6 MB số thực vào git là sai chỗ và làm git history vô dụng |
| G4 | Mỗi con số trace được nguồn | ✅ Qua | FR-059 ghi nhận mọi lượt gọi năng lực kèm người gọi. FR-039→FR-043 chặn việc đưa ra con số không kiểm chứng được |
| G5 | Tiếng Việt toàn bộ phần hiển thị | ✅ Qua | Câu từ chối, nút "Trò chuyện mới", thông báo hết hạn mức |
| G6 | Tool nội bộ — không tối ưu quá mức | ✅ Qua | Chính vì thế mới không dùng vector database: 2.000 vector nằm gọn trong memory |
| G7 | Mỗi phase phải ship độc lập được | ✅ Qua | 6 user story đều có `Independent Test` riêng |

**Không có vi phạm nào cần biện minh** → mục Complexity Tracking bỏ trống.

Một điểm **cần lưu**: `constitution/tech-stack.md` mô tả Phase 3 là "RAG Pipeline
(pgvector hoặc separate vector store)". Đợt này làm hybrid retrieval **sớm hơn** mốc
đó và **không** dùng pgvector. Đây không phải vi phạm mà là thu hẹp: lý do là kế hoạch
dữ liệu đã đổi (vài nghìn dataset), và quy mô đó vẫn chưa cần vector store riêng.
Roadmap nên được cập nhật sau khi đợt này ship.

## Project Structure

### Documentation (this feature)

```text
specs/005-discovery-chat-scale/
├── plan.md              # File này
├── research.md           # Phase 0 — quyết định kỹ thuật + phương án đã loại
├── data-model.md         # Phase 1 — thực thể, trường, quy tắc
├── quickstart.md         # Phase 1 — cách kiểm chứng feature chạy đúng
├── contracts/            # Phase 1 — hợp đồng ba năng lực tra cứu
│   ├── search-datasets.md
│   ├── get-dataset.md
│   └── lookup-value.md
├── checklists/
│   └── requirements.md   # Cổng chất lượng spec (16/16)
└── tasks.md              # Phase 2 — do /speckit-tasks sinh, KHÔNG phải file này
```

### Source Code (repository root)

```text
src/lib/retrieval/                  # MỚI — ba năng lực tra cứu, độc lập mặt tiền
├── index.ts                        # public API: searchDatasets, getDataset, lookupValue
├── types.ts                        # kiểu đầu vào/đầu ra của từng năng lực
├── embed.ts                        # gọi model embedding, chuẩn hoá text đầu vào
├── vector-store.ts                 # đọc/ghi chỉ mục vector trên R2, cosine trong memory
├── keyword.ts                      # nhánh khớp từ khoá chính xác
├── fuse.ts                         # trộn hai nhánh, cắt top-20
├── value-index.ts                  # chỉ mục nghịch đảo giá trị → slug
└── audit.ts                        # ghi nhận lượt gọi kèm người gọi (FR-059)

src/lib/chat/
├── flatten-metadata.ts             # SỬA — dựng khối mô tả cho ~20 slug, bỏ hàm nạp toàn bộ
└── intent.ts                       # MỚI — phân loại câu hỏi: tìm kiếm / tính toán / cả hai

src/app/api/chat/discovery/route.ts # SỬA — gọi năng lực, nhận lịch sử, viết lại câu hỏi
src/components/chat/ChatBox.tsx     # SỬA — giữ lịch sử phía client, nút "Trò chuyện mới"

src/lib/ai/inspect/csv.ts           # SỬA — ngưỡng lưu giá trị cột 12 → 200 (FR-038)
src/lib/ai/inspect/column.ts        # SỬA — cùng lý do
src/lib/datasets/index-json.ts      # SỬA — điền year_range (FR-047)

tools/prompts/discovery-chat.md     # SỬA — quy tắc từ chối câu hỏi tính toán
tools/backfill-column-values.mjs    # MỚI — tính lại giá trị cột cho 495 dataset đã có
tools/build-retrieval-index.mjs     # MỚI — dựng chỉ mục vector + chỉ mục giá trị
eval/gold-questions.json            # SỬA — mở rộng 8 → ≥25 câu, điền đáp án đúng
```

**Structure Decision**: theo đúng layout hiện có của dự án — `src/lib/<domain>/` cho
logic, `src/app/api/` cho route, `tools/` cho script vận hành, `data/scripts/` cho
Python xử lý dữ liệu.

Thư mục mới duy nhất là `src/lib/retrieval/`. Đặt nó **ngang cấp** với
`src/lib/chat/`, không nằm bên trong, vì đó chính là điều FR-058 đòi: năng lực tra cứu
không thuộc về mặt tiền chat. Nếu để trong `src/lib/chat/` thì lần thêm mặt tiền thứ
hai sẽ phải chuyển thư mục — và đó là dấu hiệu ranh giới đã sai từ đầu.

## Constitution Check — kiểm lại sau Phase 1

*Chạy lại sau khi có `research.md`, `data-model.md`, `contracts/`, `quickstart.md`.*

| # | Cổng | Trước Phase 0 | Sau Phase 1 | Bằng chứng trong thiết kế |
|---|---|---|---|---|
| G1 | Không thêm dependency mới | ✅ | ✅ | `research.md` R1 (embedding gọi qua HTTP bằng client sẵn có), R5 (nhánh từ khoá tự viết, không dùng thư viện BM25), R11 (không thêm test framework) |
| G2 | Không thêm PostgreSQL / vector database | ✅ | ✅ | R2 — vector là một object R2, cosine trong memory |
| G3 | Metadata text → GitHub; dữ liệu nhị phân → R2 | ✅ | ✅ | `data-model.md` D1/D2 — mọi chỉ mục tái tạo được từ metadata, nên là dữ liệu sinh ra chứ không phải nguồn sự thật |
| G4 | Mỗi con số trace được nguồn | ✅ | ✅ | Cả ba contract đều bắt buộc tham số `caller`; `lookup-value.md` phân biệt "không có" / "chưa tra hết" / "chưa biết" |
| G5 | Tiếng Việt toàn bộ phần hiển thị | ✅ | ✅ | `quickstart.md` kịch bản 1, 4, 8 kiểm đúng chữ hiển thị |
| G6 | Tool nội bộ — không tối ưu quá mức | ✅ | ✅ | R6 chọn cách cộng điểm thay vì RRF cho tới khi có bằng chứng cần; R8 không tách lượt gọi phân loại ý định |
| G7 | Mỗi phase ship độc lập được | ✅ | ✅ | `quickstart.md` § Thứ tự chạy — mỗi kịch bản kiểm được riêng, US1 ship trước tất cả |

**Vẫn không có vi phạm nào.** Thiết kế Phase 1 không phát sinh thêm hạ tầng nào ngoài
hai object trên R2.

Một quyết định thiết kế đáng nêu vì nó **chống lại** xu hướng phình: cả `research.md`
R6 và R8 đều chọn cách đơn giản hơn và ghi rõ **điều kiện** để đổi sang cách phức tạp
(bộ đo không đạt ngưỡng). Không làm trước khi có bằng chứng cần.

## Complexity Tracking

Không có vi phạm Constitution Check nào cần biện minh.
