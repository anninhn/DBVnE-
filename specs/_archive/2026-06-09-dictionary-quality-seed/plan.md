# Spec 1.6 Plan — Data Dictionary, Quality & Seed Data

## Group 1 — Data Dictionary
1. Tạo API `GET /api/datasets/[slug]/dictionary` — trả dictionary entries cho dataset
2. Tạo/rewrite `src/app/dictionary/page.tsx` — bảng dictionary, group by dataset, filter + search

## Group 2 — Quality Score
3. Viết quality calculation function (completeness, freshness, documentation, provenance)
4. Integrate vào POST/PUT `/api/datasets` — auto-calculate score
5. Hiển thị quality score trên dataset card (listing) + sidebar (detail)

## Group 3 — Seed Data
6. Tạo `data/scripts/seed_datasets.py` — seed tags vocabulary + datasets + resources
7. Parse existing Excel/CSV data (từ `data/raw/`) → upload qua API
8. Verify: 4+ datasets hiển thị trên listing page

## Group 4 — Verify
9. `npm run build` — exit 0
10. `/dictionary` page hoạt động
11. Quality score hiển thị đúng
12. Seed data browse được trên listing + detail pages
