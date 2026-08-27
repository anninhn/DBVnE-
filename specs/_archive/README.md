# Spec archive — định dạng `/sdd` (2026-05 → 2026-07)

21 spec viết bằng skill `/sdd` trước khi project chuyển sang **GitHub Spec Kit** (2026-08-24).

**Không xoá** vì ba lý do:
1. `constitution/roadmap.md` mục Replanning Log trích dẫn trực tiếp nhiều spec ở đây
2. Chúng chứa mục `## Decisions` — phần **vì sao**, thứ mà template spec-kit không có chỗ chứa
3. Diff giữa spec cũ và code thật là thông tin (xem §3)

## 1. Vì sao phải chuyển vào `_archive/`

Script `create-new-feature.sh` của spec-kit quét `specs/*` tìm số cao nhất bằng regex `^[0-9]+`. Thư mục `2026-07-24-discovery-chat` bị đọc thành **số 2026** → spec mới sẽ được cấp số **2027**, rồi 2028, 2029…

Đã kiểm chứng: sau khi chuyển vào `_archive/`, đánh số reset về `001`.

*(Đã thử `SPECIFY_FEATURE_DIRECTORY=specs-v2` để giữ `specs/` nguyên vẹn — shell script bỏ qua biến này, vẫn ra 2027.)*

## 2. Hai format khác trục tổ chức

| | `/sdd` (ở đây) | spec-kit (`specs/NNN-*`) |
|---|---|---|
| File | `requirements.md` · `plan.md` · `validation.md` | `spec.md` · `plan.md` · `tasks.md` |
| Trục | Scope + Deliverables + **Decisions** | User Story P1/P2/P3 + Acceptance Scenarios + FR-001…N |
| Nặng về | quyết định gì, vì sao | người dùng quan sát được gì, test thế nào |

**Không dịch 1:1 được.** Nội dung tách về hai đích:
- Mục `## Decisions` → `.specify/memory/constitution.md` (luật toàn project)
- Phần hành vi → `spec.md` của spec mới tương ứng

## 3. Bản đồ spec cũ → spec mới

| Spec cũ | Trạng thái | Spec mới phủ |
|---|---|---|
| `2026-06-08-wiki-infrastructure-core-data` | ❌ chết theo PostgreSQL | — |
| `2026-06-09-schema` | ❌ chết theo PostgreSQL | — *(mô hình khái niệm còn sống trong `metadata.yaml`)* |
| `2026-06-09-upload-form` | ❌ thay bằng wizard 2026-07-03 | — |
| `2026-06-09-dictionary-quality-seed` | ❌ cả 3 phần bỏ (dictionary browse deferred vĩnh viễn, quality scoring drop hẳn, SQL seed chết) | — |
| `2026-06-09-dataset-listing` | ❌ SUPERSEDED 2026-06-23 (card-grid → compact row) | `001` |
| `2026-06-09-dataset-detail` | ❌ SUPERSEDED 2026-06-23 | `001` |
| `2026-06-09-design-system` | ⚠️ còn sống một phần | `001` |
| `2026-06-23-hf-frontend-demo` | ⚠️ UI pattern còn sống, data layer chết (mock data) | `001` |
| `2026-06-24-dataset-catalog` | ⚠️ đã ship rồi re-arch đổi data layer | `001` |
| `2026-06-24-column-statistics` | ⚠️ ý tưởng còn, cài đặt đổi (PostgreSQL migration → `column_stats` trong `metadata.yaml`) | `001` |
| `2026-06-24-data-dictionary-table` | ✅ đang chạy | `001` |
| `2026-06-24-markdown-description` | ✅ đang chạy | `001` |
| `2026-06-24-remove-legacy-entity-stack` | ❌ housekeeping đã xong | — |
| `2026-07-03-upload-wizard-mvp` | ✅ đang chạy — nền tảng wizard hiện tại | `002` |
| `2026-07-09-phase-1-completion` | ✅ đang chạy | `001` `002` |
| `2026-07-23-geojson-upload` | ✅ đang chạy | `001` `002` |
| `2026-07-24-auth-light` | ✅ đang chạy | `003` |
| `2026-07-24-article-linking` | ✅ đang chạy | `003` |
| `2026-07-24-discovery-chat` | ✅ đang chạy | `004` |
| `2026-07-24-pre-launch-refactor` | ✅ đã áp dụng (harden + cleanup, không thêm feature) | — |
| `2026-07-28-topic-workspace` | ❌ **QUYẾT ĐỊNH KHÔNG BUILD** — chọn NotebookLM. Giữ làm backup nếu NotebookLM đau thật | — |

Spec mới:

```
001-catalog-discovery    listing · search · facet · detail · preview CSV/XLSX/GeoJSON
002-upload-metadata      wizard 4 bước · AI assist · dictionary · edit/delete
003-auth-provenance      login · edit history · article linking · download counter
004-discovery-chat       hỏi đáp metadata · citation · thumbs · eval
005-nso-connector        [MỚI] Phase 2.5 G1
006-indicator-tools      [MỚI] Phase 2.5 G2
007-chat-numbers         [MỚI] Phase 2.5 G2
```

`001`–`004` là **retro-spec**: `Status: DELIVERED — retro-documented`, dừng ở `spec.md`, **không** chạy `plan`/`tasks`/`implement` (sẽ cố build lại thứ đang chạy production).

## 4. Chỗ code đã trôi khỏi spec — retro-spec phải theo CODE, không theo spec cũ

Phát hiện khi review toàn bộ repo 2026-08-24. Acceptance scenario của `001`–`004` phải viết từ **hành vi thật**, không từ ý định spec cũ:

| Spec cũ ghi | Thực tế đang chạy |
|---|---|
| `discovery-chat`: Gemini **2.0** Flash | Gemini **2.5** Flash |
| `upload-wizard-mvp`: commit là preview-only | commit ghi thật vào GitHub |
| `upload-wizard-mvp`: tags từ PostgreSQL | tags hardcoded `src/lib/tags.ts` |
| 4 spec `2026-06-24-*` header: `Status: Spec — not yet implemented` | cả 4 **đã** implement (commit `0757032`) |
| `phase-1.md`: hard delete **dev-only** | API đã bỏ guard `NODE_ENV` → **soft delete chạy được ở production** (git log có 3 commit "Soft-delete … by ninh"). Nhưng nút UI vẫn ẩn ở production — UI và API bất đồng |

## 5. Spec chưa bao giờ được viết

- `specs/2026-07-02-phase1-rearch/` — `roadmap.md` và `tech-stack.md` đều trỏ tới, **không tồn tại**. `roadmap.md:19` tự thừa nhận *"cần viết lại specs cho lần re-architecture này"*. Đây là lần pivot LỚN NHẤT của project (PostgreSQL → file-based) mà không có spec.
- Phase 2.5 — đúng quy trình, sẽ là `005`–`007`.
