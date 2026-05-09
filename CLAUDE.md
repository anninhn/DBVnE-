# 34 Tỉnh Thành — Hồ sơ toàn cảnh Việt Nam

## Constitution

This project uses Spec-Driven Development. Read these files before implementing any feature:

- `constitution/mission.md` — Why: vision, motivation, personas, scope, success metrics
- `constitution/tech-stack.md` — How: system design, pipeline, API, data model, dependencies
- `constitution/roadmap.md` — When: phased plan with replanning log

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
- Dữ liệu thô (CSV, Excel) → xử lý bằng Python script (`scripts/parse_*.py`) → lưu vào PostgreSQL
- Browser chỉ load data qua API, không load file trực tiếp

## KPI & Lộ trình

Xem `PROJECT_PLAN.md` — 8 giai đoạn (Tháng 5–12), mỗi tháng bổ sung chỉ số mới vào cấu trúc 34×N.

## Skills

- `/feature-spec` — Start the next feature phase
- `/changelog` — Generate/update CHANGELOG.md from git history
