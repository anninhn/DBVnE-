# Spec 1.4 Plan — Dataset Detail Page

## Group 1 — Tab Component
1. Tạo `src/components/TabSwitcher.tsx` — 3 tabs, yellow underline, client component

## Group 2 — Tab Content
2. Tạo Hồ sơ tab content — description, overview cards, source info
3. Tạo `src/components/DataTable.tsx` — paginated table, dynamic columns, client component
4. Tạo Dữ liệu tab content — DataTable + filter dropdowns
5. Tạo Files tab content — file list with download buttons

## Group 3 — Sidebar & Page
6. Tạo `src/components/MetadataSidebar.tsx` — metadata cards
7. Tạo `src/app/datasets/[slug]/page.tsx` — header + tabs + sidebar layout

## Group 4 — Verify
8. `npm run build` — exit 0
9. Test: tabs, data table, file list, sidebar, responsive
