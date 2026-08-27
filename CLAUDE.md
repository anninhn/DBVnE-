# VNExpress Data Platform

## Constitution

This project uses Spec-Driven Development. Read these files before implementing any feature:

- `constitution/mission.md` — Why: data platform cho tòa soạn VNExpress, motivation, personas, 3 phases
- `constitution/tech-stack.md` — How: dataset-centric architecture, R2 + GitHub metadata, API, data model *(Supabase/PostgreSQL đã drop 2026-07-09)*
- `constitution/roadmap.md` — When: Phase 1 (Dataset Hub) ✅ → Phase 2 (Discovery Chat) ✅ → Phase 3 (Intelligence). Wrap-up: `docs/phase-1.md`, `docs/phase-2.md`

## Architecture Principle

**Dataset-centric, iterative**: Mọi thứ xoay quanh dataset (bất kỳ loại — CSV, PDF, MP3, GeoJSON). Phase 1 tập trung upload/browse/preview. Phase 2 thêm query capability. Phase 3 thêm RAG + intelligence. Mỗi phase xây trên phase trước, không redesign.

## Feature Workflow

1. **Specify**: Run `/feature-spec` to start the next phase — it reads the roadmap, interviews you, and writes a spec in `specs/YYYY-MM-DD-<name>/`
2. **Implement**: Point the agent at the spec files (requirements.md, plan.md, validation.md)
3. **Validate**: Follow validation.md checks before merging
4. **Changelog**: Run `/changelog` before merging to update CHANGELOG.md

## Process Rules

- No new dependencies without user approval
- Follow existing conventions in the codebase
- Each phase must be independently shippable
- Update constitution/roadmap.md during replanning between phases
- Mỗi feature = 1 spec riêng, không gộp

## Quy ước

- Văn phong tiếng Việt trong code comments và UI text
- Không thêm feature ngoài yêu cầu
- Dữ liệu thô (CSV, Excel) → xử lý bằng Python script (`data/scripts/`) → upload qua API → R2 + GitHub metadata
- File vật lý (PDF, MP3, XLSX) → Object Storage (R2), metadata chỉ lưu URL
- Column names trong `dictionary.md` phải khớp header file thật — không tự do đặt tên
- Tags chọn từ controlled vocabulary hardcoded ở `src/lib/tags.ts` — không gõ tự do
- Mỗi con số phải trace được nguồn (provenance qua git history + field `source` trong `metadata.yaml`)

## Skills

- `/feature-spec` — Start the next feature phase
- `/changelog` — Generate/update CHANGELOG.md from git history

## Maintenance Scripts

**Quan trọng**: KHÔNG edit trực tiếp GitHub repo hay R2 bucket mà không qua app. Mọi thay đổi (upload/edit/delete dataset) phải qua UI hoặc API để giữ sync giữa GitHub metadata và R2 files.

Nếu đã edit trực tiếp (hoặc nghi ngờ inconsistent), chạy script cleanup:

```bash
# Dry-run — scan + report orphans 2 chiều (GitHub metadata vs R2 objects)
node tools/cleanup-orphans.mjs

# Apply — xóa orphans thật
node tools/cleanup-orphans.mjs --apply
```

Loại orphan script xử lý:
- **GitHub orphan**: `metadata.yaml` references `r2_key` nhưng object không tồn tại trong R2 → xóa cả folder `datasets/<slug>/`
- **R2 orphan**: object tồn tại trong R2 nhưng không có metadata nào reference → xóa object

Setup CORS R2 (chỉ chạy 1 lần khi config bucket mới):
```bash
node tools/setup-r2-cors.mjs
```

