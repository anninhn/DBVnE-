# Spec 1.5 Plan — Upload Form

## Group 1 — Dataset Creation Form
1. Rewrite `src/app/upload/page.tsx` — Step 1: dataset metadata form (title, description, category, tags, source)
2. Slug auto-generation từ title
3. Submit → POST `/api/datasets`

## Group 2 — Resource Upload
4. Step 2 form: file upload + resource metadata (title, type, year)
5. R2 upload integration
6. CSV/XLSX auto-extract: structured_data preview + columns
7. Submit → POST `/api/datasets/[slug]/resources`

## Group 3 — Data Dictionary
8. Auto-generate dictionary entries từ CSV/XLSX columns
9. Edit form cho label_vi, unit, description

## Group 4 — Verify
10. `npm run build` — exit 0
11. Test: create dataset, upload file, verify data in API
