# 34 Tỉnh Thành — Hồ sơ toàn cảnh Việt Nam

## Constitution

This project uses Spec-Driven Development. Read these files before implementing any feature:

- `constitution/mission.md` — Why: wiki-style knowledge repository cho newsroom, motivation, personas, scope
- `constitution/tech-stack.md` — How: ~5 tables wiki architecture, R2 storage, pipeline, API, data model
- `constitution/roadmap.md` — When: 8 phases, wiki-first → data incremental → promote dashboard cuối

## Architecture Principle

**Wiki-first, promote sau**: Hệ thống là kho tri thức (giống Hugging Face Hub), không phải analytics engine. Mọi tài nguyên (số liệu, PDF, MP3) là 1 resource. Khi xác định được hot indicators → promote sang views/tables cho dashboard.

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

## Quy ước

- Văn phong tiếng Việt trong code comments và UI text
- Không thêm feature ngoài yêu cầu
- Dữ liệu thô (CSV, Excel) → xử lý bằng Python script (`data/scripts/parse_*.py`) → upload qua API → PostgreSQL + R2
- File vật lý (PDF, MP3, XLSX) → Object Storage (R2), database chỉ lưu URL
- JSONB keys trong `structured_data` phải khớp `indicator_metadata` — không tự do đặt tên
- Tags chọn từ controlled vocabulary (`tags` table) — không gõ tự do

## KPI & Lộ trình

Xem `PROJECT_PLAN.md` — 8 giai đoạn (Tháng 5–12), mỗi tháng bổ sung tài nguyên mới.

## Skills

- `/feature-spec` — Start the next feature phase
- `/changelog` — Generate/update CHANGELOG.md from git history
