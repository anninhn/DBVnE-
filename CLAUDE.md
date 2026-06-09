# VNExpress Data Platform

## Constitution

This project uses Spec-Driven Development. Read these files before implementing any feature:

- `constitution/mission.md` — Why: data platform cho tòa soạn VNExpress, motivation, personas, 3 phases
- `constitution/tech-stack.md` — How: dataset-centric architecture, Supabase, R2, API, data model
- `constitution/roadmap.md` — When: Phase 1 (Dataset Hub) → Phase 2 (Query Layer) → Phase 3 (Intelligence)

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
- Dữ liệu thô (CSV, Excel) → xử lý bằng Python script (`data/scripts/parse_*.py`) → upload qua API → PostgreSQL + R2
- File vật lý (PDF, MP3, XLSX) → Object Storage (R2), database chỉ lưu URL
- JSONB keys phải khớp `data_dictionary` — không tự do đặt tên
- Tags chọn từ controlled vocabulary (`tags` table) — không gõ tự do
- Mỗi con số phải trace được nguồn (provenance qua `upload_log`)

## Skills

- `/feature-spec` — Start the next feature phase
- `/changelog` — Generate/update CHANGELOG.md from git history
