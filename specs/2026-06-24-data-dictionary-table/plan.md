# Data Dictionary Table — Plan

## Group 1 — Component

1. Create `src/app/datasets/[slug]/DataDictionary.tsx`:
   - Server component (no client interactivity needed — pure render from props).
   - Props: `{ resources: Resource[]; dictionary: DataDictionaryEntry[] }`.
   - Build a lookup: `Map<column_name, DataDictionaryEntry>` from `dictionary` (first match wins; duplicate column_names share the same dict row by design).
   - Render: for each resource (skip resources with no `columns`), a sub-heading (resource title) + a table.
   - Table columns: `Trường` (column_name, mono), `Tên hiển thị` (label_vi), `Kiểu` (data_type), `Đơn vị` (unit), `Mô tả` (description; if `source` present, render it as a muted secondary line below).
   - For a resource's column with no matching dictionary row: render the column name with empty cells (don't omit).
   - Styling: reuse the HF table tokens already in the codebase (`bg-hf-bg-subtle` header, `border-hf-border`, `text-hf-text`, `font-mono` for the column name cell). Sub-heading: `text-sm font-semibold text-hf-text mt-5 mb-2`.

## Group 2 — Wire into detail page

2. Edit `src/app/datasets/[slug]/page.tsx`:
   - Import: `import DataDictionary from "./DataDictionary";`
   - Replace the existing bullet-list block (lines ~122-143, the `{dataset.data_dictionary.length > 0 && (...)}` block) with:
     ```tsx
     {dataset.resources.length > 0 && dataset.data_dictionary.length > 0 && (
       <div className="mt-6">
         <h2 className="text-lg font-semibold text-hf-text mt-5 mb-2 pb-1.5 border-b border-hf-border">
           Từ điển dữ liệu
         </h2>
         <DataDictionary
           resources={dataset.resources}
           dictionary={dataset.data_dictionary}
         />
       </div>
     )}
     ```
   - Change the heading from "Trường dữ liệu" to "Từ điển dữ liệu" (Data dictionary) to match what it now is.

## Group 3 — Verify

3. `npm run build` — exit 0.
4. `npm run dev`, open `/datasets/ho-so-34-tinh-thanh-2025`, Dataset card tab, scroll past the description.
5. Manually verify:
   - Three sub-headings appear, one per resource (province_stats / wards / leadership titles).
   - Each resource's table lists exactly that resource's columns (e.g. wards table has `ward_name`, not `grdp`).
   - Shared columns (`entity_id`) appear in all 3 tables.
   - `description` and `source` render where the seed populated them (e.g. `population` → "Tổng dân số" + source "Thongtintinhthanh.Danso").
   - Columns with empty description (e.g. `ward_name` has no description in seed) render with empty cell, not missing row.
