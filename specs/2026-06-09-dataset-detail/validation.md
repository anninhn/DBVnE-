# Spec 1.4 Validation — Dataset Detail Page

## Definition of Done

1. `npm run build` exit 0
2. `/datasets/[slug]` hiển thị dataset detail
3. Header: title + tag pills + breadcrumb
4. 3 tabs: Hồ sơ | Dữ liệu | Files
5. Tab switch không reload page, active tab yellow underline
6. Hồ sơ tab: description, overview cards (rows, files, size)
7. Dữ liệu tab: DataTable hiển thị structured_data
8. DataTable: pagination (prev/next) hoạt động
9. DataTable: filter dropdown filter đúng resources
10. Files tab: file list + download links
11. Right sidebar: category, tags, source, counts, quality, dates
12. Mobile: sidebar stacked
13. Không `<script>` trong RSC
