---

description: "Task list for Discovery Chat ở quy mô vài nghìn dataset"
---

# Tasks: Discovery Chat ở quy mô vài nghìn dataset

**Input**: Design documents from `/specs/005-discovery-chat-scale/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Dự án **không có test framework** và spec không yêu cầu TDD. Cổng kiểm chứng
là `npm run typecheck`, `npm run lint`, bộ đo `npm run eval:chat`, và các kịch bản tay
trong [quickstart.md](./quickstart.md) (xem `research.md` § R11). Vì vậy **không có task
viết unit test**; thay vào đó mỗi phase kết thúc bằng một task kiểm chứng gắn với
success criteria cụ thể.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: chạy song song được (khác file, không phụ thuộc task chưa xong)
- **[Story]**: user story mà task thuộc về (US1–US6)
- Mỗi task ghi đường dẫn file cụ thể

## Path Conventions

Theo layout hiện có của dự án: `src/lib/<domain>/` cho logic, `src/app/api/` cho route,
`src/components/` cho UI, `tools/` cho script vận hành, `eval/` cho bộ đo.

---

## ⚠️ Thứ tự phase KHÔNG theo thứ tự ưu tiên — cố ý

Template mặc định xếp phase theo ưu tiên P1 → P3. Ở feature này **thứ tự thi công khác
thứ tự ưu tiên**, và làm theo ưu tiên sẽ không chạy được:

| Story | Ưu tiên | Vì sao vị trí thi công khác |
|---|---|---|
| **US6** | P3 | Bộ đo là **thước** cho SC-004→SC-008. Làm sau thì năm story kia không chứng minh được kết quả |
| **US3** | P2 | US1 phải bỏ dữ liệu mẫu và thay bằng danh sách giá trị cột — nên US3 là **điều kiện tiên quyết** của US1 |
| **US1** | P1 | Ưu tiên cao nhất (lỗi người dùng không tự phát hiện) nhưng phải chờ US3 |
| **US2** | P1 | Nặng nhất, cần thước đo của US6 để hiệu chỉnh trọng số trộn hai nhánh |

Ghi chú này đã có trong `spec.md` § Assumptions và `checklists/requirements.md`.
Ưu tiên vẫn là ưu tiên về **giá trị**; thứ tự dưới đây là thứ tự **thi công**.

---

## Phase 1: Setup

- [x] T003 [P] Tạo thư mục `src/lib/retrieval/` với `index.ts` rỗng export sẵn ba tên `searchDatasets`, `getDataset`, `lookupValue`

**Checkpoint**: T001, T002 (đo mốc) đã bỏ cùng Phase 3.

---

## Phase 2: Foundational (chặn mọi user story)

- [x] T004 [P] Định nghĩa kiểu đầu vào/đầu ra ba năng lực trong `src/lib/retrieval/types.ts` theo `contracts/search-datasets.md`, `contracts/get-dataset.md`, `contracts/lookup-value.md`
- [x] T005 [P] Tách hàm chuẩn hoá text (bỏ dấu, `đ`→`d`, lowercase) từ `src/lib/search/simple-filter.ts` ra `src/lib/retrieval/normalize.ts`, re-export lại ở chỗ cũ để không đổi hành vi ô search
- [x] T006 Viết `src/lib/retrieval/audit.ts` — ghi nhận lượt gọi năng lực kèm `caller`, tái dùng cơ chế log R2 sẵn có ở `src/lib/r2/chat-log.ts` (FR-059)
- [x] T007 Viết helper đọc/ghi object JSON trên R2 dùng chung cho hai chỉ mục trong `src/lib/retrieval/store.ts`

**Checkpoint**: `npm run typecheck` sạch. Chưa có hành vi nào đổi với người dùng.

---

## Phase 3: US6 — Đo chất lượng — ĐÃ BỎ (quyết định 2026-09-03)

Người quyết định chốt: **không làm bộ đo, không user test, build thẳng.**

Hệ quả cần biết:

- SC-004, SC-005, SC-006 **không kiểm được** — bỏ khỏi cổng nghiệm thu
- T053 (hiệu chỉnh trọng số trộn hai nhánh) không có cơ sở → đặt **50/50** cố định,
  chỉnh tay sau khi xem kết quả thật
- Kiểm chứng chuyển hoàn toàn sang **xem bằng mắt** trên câu hỏi thật, theo các kịch
  bản trong `quickstart.md`. Với tool nội bộ một người dùng chính thì đây là đánh đổi
  hợp lý, không phải bỏ kiểm chứng
- Hệ quả dây chuyền: US6 không còn chặn phase nào → **US3 là phase đầu tiên**

Sáu task T008–T013 bỏ. Không đánh số lại các task sau để giữ tham chiếu.

---

## Phase 4: US3 — Biết dataset có chứa địa bàn mình cần (P2, tiên quyết cho US1)

**Goal**: Câu "có dữ liệu nhiệt độ Đà Nẵng không" được trả lời chắc chắn, cả chiều phủ định.

**Independent Test**: 10 cặp câu hỏi có/không trên dataset phủ một phần địa bàn, cả hai chiều đúng.

- [x] T014 [US3] Nâng ngưỡng lưu giá trị cột phân loại từ 12 lên **200** trong `src/lib/ai/inspect/csv.ts` (FR-038)
- [x] T015 [US3] Nâng cùng ngưỡng trong `src/lib/ai/inspect/column.ts`
- [x] T016 [US3] Thêm cờ đánh dấu danh sách chưa đủ vào kiểu `ColumnStats` trong `src/lib/types/dataset.ts` (D5 — thiếu cờ này là nguồn của câu trả lời "không có Đà Nẵng" sai)
- [x] T017 [US3] Sửa `src/lib/dataset-render.ts` để ghi cờ chưa đủ vào `metadata.yaml`
- [ ] T018 [US3] Viết `tools/backfill-column-values.mjs` — đọc CSV từ R2, tính lại giá trị cột, cập nhật `metadata.yaml`; dry-run mặc định, **không gọi AI** (R10)
- [ ] T019 [US3] Chạy backfill cho 495 dataset đã có, kiểm không dataset nào mất `column_stats` cũ
- [ ] T020 [US3] Viết `src/lib/retrieval/value-index.ts` — dựng chỉ mục nghịch đảo `giá trị đã chuẩn hoá → {slug, column}[]`, gom các cách viết khác nhau về một entry (R7, FR-057)
- [ ] T021 [US3] Cài `lookupValue` trong `src/lib/retrieval/index.ts` theo `contracts/lookup-value.md`, **phân biệt ba trạng thái** "không có" / "chưa tra hết" / "chưa biết"
- [ ] T022 [US3] Cài `getDataset` trong `src/lib/retrieval/index.ts` theo `contracts/get-dataset.md`, kèm danh sách giá trị cột và cờ `complete`
- [ ] T023 [US3] Sửa `tools/prompts/discovery-chat.md` — thêm quy tắc: dùng danh sách giá trị cột để trả lời câu hỏi theo giá trị, và **cấm** kết luận "không có" khi cờ `complete` là false
- [ ] T024 [US3] Kiểm theo `quickstart.md` kịch bản 4 — Đà Nẵng có, Cần Thơ không, `Qui Nhơn` tìm ra (SC-008)

**Checkpoint**: US3 ship được độc lập. Danh sách giá trị cột đã sẵn để US1 dùng thay dữ liệu mẫu.

---

## Phase 5: US1 — Không nhận con số không kiểm chứng được (P1, ưu tiên cao nhất)

**Goal**: Câu hỏi cần tính toán không bao giờ nhận về con số; thay vào đó được chỉ đúng đường.

**Independent Test**: 5 câu dạng tính toán (có và không gắn dataset), không câu nào chứa con số.

- [ ] T025 [US1] Viết `src/lib/chat/intent.ts` — phân loại câu hỏi thành *tìm kiếm* / *tính toán* / *cả hai*, dựa trên quy tắc trong prompt chứ không phải khớp từ khoá (R8)
- [ ] T026 [US1] Thêm quy tắc từ chối câu hỏi tính toán vào `tools/prompts/discovery-chat.md`, kèm khuôn câu trả lời: dataset + cột + phạm vi thời gian + đường dẫn xem trước (FR-039, FR-040)
- [ ] T027 [US1] Thêm quy tắc cấm hứa hẹn tính năng chưa có vào `tools/prompts/discovery-chat.md` (FR-063)
- [ ] T028 [US1] **Bỏ** khối dữ liệu mẫu khỏi `buildFocusBlock` trong `src/lib/chat/flatten-metadata.ts`, thay bằng danh sách giá trị cột lấy từ `getDataset` (quyết định ở `spec.md` § Clarifications)
- [ ] T029 [US1] Thêm quy tắc cấm kết luận về toàn bộ dataset từ một phần dữ liệu vào `tools/prompts/discovery-chat.md` (FR-042)
- [ ] T030 [US1] Thêm xử lý câu hỏi vừa tìm kiếm vừa tính toán — trả lời đầy đủ phần tìm kiếm, nói rõ phần tính toán chưa hỗ trợ (FR-043), trong `src/app/api/chat/discovery/route.ts`
- [ ] T031 [US1] Kiểm theo `quickstart.md` kịch bản 1, gồm ca gắn dataset rồi hỏi tính toán (SC-007, A10)

**Checkpoint**: US1 ship được. Đây là phase **nên deploy trước tất cả** — nó chặn con số
sai vào bài báo, và các phase khác hỏng thì phóng viên thấy ngay còn phase này thì không.

---

## Phase 6: US5 — Biết dataset phủ khoảng thời gian nào (P3, độc lập)

**Goal**: Phóng viên biết ngay dataset có dữ liệu từ năm nào tới năm nào và lọc được theo khoảng.

**Independent Test**: phạm vi thời gian được ghi cho dataset dạng bảng; lọc theo khoảng trả về đúng.

Chạy **song song** với Phase 4 — không dùng chung file nào.

- [ ] T032 [P] [US5] Suy phạm vi thời gian từ **cột năm của dữ liệu** (không từ tiêu đề) trong `src/lib/datasets/index-json.ts`, điền `year_range` (FR-047)
- [ ] T033 [P] [US5] Để `year_range` trống cho dataset không có chiều thời gian, không suy khoảng giả (FR-048)
- [ ] T034 [US5] Thêm điền `year_range` vào luồng commit tại `src/lib/dataset-commit.ts` để dataset upload sau này tự có
- [ ] T035 [US5] Thêm bước điền `year_range` cho 495 dataset đã có vào `tools/backfill-column-values.mjs` (dùng chung một lượt đọc CSV, không đọc hai lần)
- [ ] T036 [US5] Thêm lọc theo khoảng thời gian vào `src/components/DatasetExplorer.tsx`
- [ ] T037 [US5] Kiểm theo `quickstart.md` kịch bản 7, gồm ca tiêu đề ghi khoảng dài hơn dữ liệu thật (SC-011)

**Checkpoint**: US5 ship được độc lập.

---

## Phase 7: US2 — Tìm được dataset mà không bị chặn hạn mức (P1, nặng nhất)

**Goal**: Chi phí mỗi câu hỏi không tăng theo số dataset; hỏi đáp không làm trang danh mục ngừng hoạt động.

**Independent Test**: 10 câu liên tiếp, đo lượng dữ liệu nạp mỗi câu, trang danh mục vẫn tải bình thường.

### Chỉ mục tra cứu

- [ ] T038 [US2] Viết `src/lib/retrieval/embed.ts` — gọi `gemini-embedding-001` qua client `openai` sẵn có, chuẩn hoá text đầu vào theo `data-model.md` § RetrievalIndexEntry (R1)
- [ ] T039 [US2] Viết `src/lib/retrieval/vector-store.ts` — đọc chỉ mục vector từ R2, cache ở module scope, tính cosine trong memory (R2, R3)
- [ ] T040 [US2] Viết `src/lib/retrieval/keyword.ts` — nhánh khớp từ khoá tính điểm theo tần suất từ, dùng `normalize.ts` từ T005; **không** dùng AND như `SimpleFilterAdapter` (R5)
- [ ] T041 [US2] Viết `src/lib/retrieval/fuse.ts` — chuẩn hoá điểm hai nhánh về [0,1], cộng có trọng số, gộp trùng, cắt **top-20** (R6)
- [ ] T042 [US2] Cài `searchDatasets` trong `src/lib/retrieval/index.ts` theo `contracts/search-datasets.md` — hai nhánh chạy song song, `filters` là ràng buộc cứng áp trước khi cắt `limit`
- [ ] T043 [US2] Phân biệt lỗi "chỉ mục chưa dựng" với kết quả rỗng trong `searchDatasets` (ca biên bắt buộc ở contract)

### Dựng và giữ chỉ mục đồng bộ

- [ ] T044 [US2] Viết `tools/build-retrieval-index.mjs` — dựng chỉ mục vector + chỉ mục giá trị, ghi lên R2; dry-run mặc định, **báo danh sách entry lệch trước khi sửa** (R4)
- [ ] T045 [US2] Thêm `source_fingerprint` vào mỗi entry chỉ mục để phát hiện lệch (D3), trong `src/lib/retrieval/vector-store.ts`
- [ ] T046 [US2] Ghi lại vector + entry chỉ mục giá trị của **một** dataset trong luồng commit tại `src/app/api/upload/commit/route.ts` (FR-032)
- [ ] T047 [US2] Ghi lại tương tự trong luồng sửa tại `src/app/api/dataset/edit/route.ts` (FR-033)
- [ ] T048 [US2] Bỏ entry chỉ mục trong luồng xoá tại `src/app/api/dataset/delete/route.ts` và `tools/hard-delete-datasets.mjs` (D6)
- [ ] T049 [US2] Chạy `tools/build-retrieval-index.mjs --apply` dựng chỉ mục cho 495 dataset

### Nối vào luồng trả lời

- [ ] T050 [US2] Viết lại `src/lib/chat/flatten-metadata.ts` — bỏ hàm nạp toàn bộ dataset, chỉ dựng khối mô tả cho danh sách slug nhận vào
- [ ] T051 [US2] Sửa `src/app/api/chat/discovery/route.ts` — gọi `searchDatasets` rồi `getDataset` cho top-20, thay vì nạp toàn bộ
- [ ] T052 [US2] Xoá đường đọc metadata từng dataset khỏi `src/lib/chat/flatten-metadata.ts` — giảm từ hơn 1.000 lượt gọi GitHub API xuống ~21
- [ ] T053 [US2] Đặt trọng số trộn hai nhánh **50/50** trong `src/lib/retrieval/fuse.ts`, để hằng số ở đầu file kèm chú thích cách chỉnh tay (R6 — không còn bộ đo để hiệu chỉnh)
- [ ] T054 [US2] Kiểm theo `quickstart.md` kịch bản 2, 3, 6 và 9 (SC-001, SC-002, SC-003, SC-004→SC-006, SC-009)

**Checkpoint**: chi phí mỗi câu hỏi ≤15.000 token và **không tăng** khi nhân đôi số entry
chỉ mục. `avg_recall` ≥70%.

---

## Phase 8: US4 — Hỏi tiếp mà không phải nhắc lại ngữ cảnh (P2)

**Goal**: Phóng viên hỏi nhiều câu liên tiếp về cùng một hướng điều tra, mỗi câu chỉ nói phần mới.

**Independent Test**: 5 cuộc trò chuyện 3 lượt, lượt 2 và 3 dùng đại từ hoặc lược ngữ cảnh.

Phụ thuộc Phase 7 — viết lại câu hỏi theo ngữ cảnh chỉ có nghĩa khi việc chọn dataset
đã chạy trên cơ chế mới.

- [ ] T055 [US4] Thêm `history` vào kiểu `DiscoveryRequest` trong `src/app/api/chat/discovery/route.ts`
- [ ] T056 [US4] Gửi kèm lịch sử cuộc trò chuyện vào lượt gọi chọn dataset trong `src/app/api/chat/discovery/route.ts`, yêu cầu model hiểu câu hỏi trong ngữ cảnh **trước khi** tìm (R9, FR-044)
- [ ] T057 [US4] Thêm quy tắc vào `tools/prompts/discovery-chat.md`: lịch sử chỉ dùng để **hiểu** câu hỏi, **không** dùng để giới hạn phạm vi tìm kiếm — mỗi lượt tìm mới hoàn toàn (FR-045)
- [ ] T058 [US4] Giữ lịch sử phía client trong `src/components/chat/ChatBox.tsx`, bền qua việc tải lại trang (FR-062)
- [ ] T059 [US4] Thêm nút "Trò chuyện mới" vào `src/components/chat/ChatBox.tsx`, xoá ngữ cảnh khi bấm (FR-046)
- [ ] T060 [US4] Kiểm theo `quickstart.md` kịch bản 5 — đặc biệt lượt 3 phải **thoát khỏi** chủ đề của hai lượt trước (SC-010)

**Checkpoint**: US4 ship được.

---

## Phase 9: Polish & Cross-Cutting

- [ ] T061 Nới hạn mức lên 500 câu/người/ngày và 5.000 câu/hệ thống/ngày trong `src/lib/r2/chat-log.ts` (FR-054)
- [ ] T062 Phân biệt thông báo hết hạn mức cá nhân với hết hạn mức hệ thống trong `src/app/api/chat/discovery/route.ts` (FR-061)
- [ ] T063 [P] Kiểm theo `quickstart.md` kịch bản 8 — hai thông báo phải khác nhau
- [ ] T064 [P] Cập nhật `constitution/roadmap.md` — hybrid retrieval làm sớm hơn mốc Phase 3 và **không** dùng pgvector; ghi lý do để lần đọc lại không tưởng là làm sai thứ tự
- [ ] T065 [P] Cập nhật `docs/phase-2.md` — bổ sung mục kiến trúc mới cho Discovery Chat
- [ ] T066 [P] Chạy `/changelog` cập nhật `CHANGELOG.md`
- [ ] T067 Chạy `npm run typecheck` và `npm run lint`, cả hai phải sạch
- [ ] T068 Chạy `npm run eval:chat` lần cuối, so với mốc ở T013, xác nhận **không chỉ số nào hồi quy**

---

## Dependencies

```
Phase 1 (Setup)
   │
   └─→ Phase 2 (Foundational)
          │
          ├─→ Phase 4  US3 ──→ Phase 5  US1  (US1 cần danh sách giá trị cột của US3)
          │
          ├─→ Phase 6  US5 (song song với Phase 4)
          │
          └─→ Phase 7  US2 ──→ Phase 8  US4  (US4 cần cơ chế chọn dataset mới)
                                         │
                                         └─→ Phase 9 (Polish)

Phase 3 (US6) đã bỏ — không còn phụ thuộc nào vào thước đo.
```

**Bốn phụ thuộc thật** (mọi cái khác là độc lập):

| Phụ thuộc | Lý do |
|---|---|
| US3 → US1 | US1 bỏ dữ liệu mẫu, phải có danh sách giá trị cột thay thế |
| US2 → US4 | Viết lại câu hỏi theo ngữ cảnh chỉ có nghĩa trên cơ chế chọn dataset mới |
| Phase 7 → T061 (nới hạn mức) | Nới trước khi chi phí giảm là mở cửa cho hoá đơn tăng |

---

## Parallel Execution

**Trong Phase 2**: T004, T005 chạy song song (khác file, không phụ thuộc nhau).

**Phase 4 và Phase 6 chạy song song hoàn toàn** — US3 sửa `src/lib/ai/inspect/*` và
`src/lib/retrieval/value-index.ts`; US5 sửa `src/lib/datasets/index-json.ts` và
`src/components/DatasetExplorer.tsx`. Không giao file nào.

Riêng **T035 phải làm sau T018** vì cùng file `tools/backfill-column-values.mjs` — và
cố ý gộp vào một script để chỉ đọc CSV từ R2 **một lượt** cho cả hai việc.

**Trong Phase 7**: T038, T039, T040 chạy song song (ba file khác nhau). T041 chờ cả ba.

**Trong Phase 9**: T063, T064, T065, T066 chạy song song.

---

## Implementation Strategy

### MVP — ship gì trước

**Phase 1 → 2 → 3 → 4 → 5**, rồi **deploy**.

Tới đó đã có: thước đo đáng tin, câu hỏi theo giá trị trả lời chắc chắn cả hai chiều, và
**không còn đường để hệ thống đưa ra con số không kiểm chứng được**. Đó là phần giá trị
cao nhất và cũng là phần rủi ro cao nhất nếu để lâu.

Chưa có: chi phí vẫn cao, vẫn có rủi ro rate limit. Nhưng hai thứ đó **phóng viên thấy
ngay khi xảy ra** — còn con số bịa thì không ai thấy.

### Các đợt sau

| Đợt | Phase | Giá trị |
|---|---|---|
| 2 | 6 (US5) | Lọc theo thời gian — nhỏ, độc lập, làm song song đợt 1 được |
| 3 | 7 (US2) | Chi phí giảm ~10 lần, hết rủi ro rate limit. Nặng nhất |
| 4 | 8 (US4) | Hội thoại nhiều lượt |
| 5 | 9 | Nới hạn mức + cập nhật tài liệu |

### Hai chỗ dễ làm sai

**T001 không lấy lại được.** Chạy bộ đo lấy mốc **trước** khi sửa dòng code nào. Sửa rồi
thì mốc cũ mất, và không còn cách chứng minh thay đổi có làm tốt lên.

**T044 quan trọng hơn vẻ ngoài của nó.** Cơ chế phát hiện chỉ mục lệch là thứ duy nhất
chặn được lỗi im lặng nặng nhất của cả đợt: vector cũ + metadata mới thì hệ thống vẫn
trả lời, chỉ là trả lời sai dataset, và không có triệu chứng nào. Nếu script báo "không
có gì lệch" trong khi metadata vừa bị sửa tay thì cơ chế đang không hoạt động — và đó
tệ hơn việc lệch.
