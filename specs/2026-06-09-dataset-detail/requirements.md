# Spec 1.4 — Dataset Detail Page

## Scope

Trang chi tiết dataset `/datasets/[slug]` theo mô hình HF `/datasets/[id]`.

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Header: Dataset Title + Tag Pills                           │
│  Tabs: Hồ sơ | Dữ liệu | Files  (yellow underline)          │
├─────────────────────────────────────┬───────────────────────┤
│  Tab Content                        │  Right Sidebar (320px) │
│                                     │  ┌─────────────────┐   │
│  [Active tab content here]          │  │ Category        │   │
│                                     │  │ Tags            │   │
│                                     │  │ Source          │   │
│                                     │  │ Files: 5        │   │
│                                     │  │ Rows: 1,234     │   │
│                                     │  │ Size: 12.3 MB   │   │
│                                     │  │ Quality: 85/100 │   │
│                                     │  │ Uploaded: Ninh  │   │
│                                     │  │ Updated: 9/6    │   │
│                                     │  └─────────────────┘   │
└─────────────────────────────────────┴───────────────────────┘
```

## Features

### Header
- Dataset title (h1)
- Capsule tag pills (category, license, tags)
- Breadcrumb: `/` → dataset title

### Tab Navigation (client component)
- 3 tabs: Hồ sơ | Dữ liệu | Files
- Yellow 2px bottom border trên active tab
- Client-side switching (không reload)
- `"use client"` component

### Hồ sơ Tab
- Description (README-style, multiline)
- Overview cards: row_count, file_count, total_size_mb, year_range
- Source info
- Quality score breakdown (nếu có)
- Provenance: uploaded_by, uploaded_at, last_verified_at

### Dữ liệu Tab — Interactive Data Table
- Filter dropdown: filter resources by `resource_type` hoặc `year`
- Paginated table: hiển thị `structured_data` từ resources
- Column headers tự generate từ `columns` JSONB hoặc structured_data keys
- Rows per page: 25
- Previous/Next pagination
- Empty state: "Chưa có dữ liệu cấu trúc"

### Files Tab
- File list: mỗi resource có file_url
  - File type icon (CSV, XLSX, PDF, MP3...)
  - Title
  - File size
  - Download button
- Resources không có file_url: hiển thị dạng text-only (chỉ structured_data)

### Right Sidebar
- Metadata cards (stacked):
  - Category
  - Tags (capsule pills)
  - Source
  - File count + Row count
  - Total size
  - Quality score
  - Uploaded by + date
  - Last verified date

## Components mới

- `src/components/TabSwitcher.tsx` — `"use client"` 3 tabs + yellow underline
- `src/components/DataTable.tsx` — `"use client"` paginated table viewer
- `src/components/MetadataSidebar.tsx` — metadata cards (server component OK)

## Files

- `src/app/datasets/[slug]/page.tsx` — mới: dataset detail page

## Decisions

### Tab content lazy render
Chỉ render active tab content. Không render cả 3 tabs cùng lúc.

**Why**: Performance — trang có thể có nhiều resources.

### DataTable dynamic columns
Column headers từ `columns` JSONB nếu có, fallback to `Object.keys(structured_data[0])`.

**Why**: Không fixed schema — mỗi dataset khác columns.

### Sidebar server component
Sidebar chỉ hiển thị static metadata, không cần interactivity.

## Out of Scope
- Không edit/delete resource từ UI
- Không version history
- Không chart/visualization
- Không sort columns trong DataTable

## Validation
- 3 tabs render đúng, switch không reload page
- Active tab: yellow underline
- Hồ sơ tab: hiển thị description, overview cards, source
- Dữ liệu tab: DataTable hiển thị structured_data, pagination hoạt động
- Files tab: file list + download links
- Right sidebar: đầy đủ metadata cards
- Mobile: sidebar stacked dưới tab content
- `npm run build` exit 0
