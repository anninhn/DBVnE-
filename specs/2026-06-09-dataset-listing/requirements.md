# Spec 1.3 — Dataset Listing Page

## Scope

Trang chủ `/` hiển thị danh sách datasets theo mô hình HF `/datasets`.

## Layout

```
┌──────────────┬──────────────────────────────────────┐
│  Sidebar     │  Search bar + Sort                   │
│  (256px)     │──────────────────────────────────────│
│              │  Dataset Card Grid                    │
│  Categories: │  ┌──────┐ ┌──────┐ ┌──────┐         │
│  □ Kinh tế   │  │Card 1│ │Card 2│ │Card 3│         │
│  □ Xã hội    │  └──────┘ └──────┘ └──────┘         │
│  □ Chính trị │  ┌──────┐ ┌──────┐                   │
│  □ Khí hậu   │  │Card 4│ │Card 5│                   │
│  □ Hạ tầng   │  └──────┘ └──────┘                   │
│              │                                      │
│  Tags:       │                                      │
│  □ vĩ mô     │                                      │
│  □ GRDP      │                                      │
│  □ dân số    │                                      │
└──────────────┴──────────────────────────────────────┘
```

## Features

### Sidebar Filters (client component)
- **Category filter**: checkbox list (kinh-te, xa-hoi, chinh-tri, khi-hau, ha-tang)
- **Tag filter**: checkbox list (từ tags table)
- Nút "Xóa bộ lọc"
- Mobile: sidebar collapse/ẩn

### Search Bar (client component)
- Input: full-text search theo title + description
- Sort dropdown: Mới nhất, Cũ nhất, A-Z, Z-A
- Yellow focus ring (`ring-yellow-400`)

### Dataset Cards
- Title (link → `/datasets/[slug]`)
- Description (truncate 2 dòng)
- Capsule tag pills (border, không filled)
- Info row: file count, row count, size
- Quality score badge (nếu có)
- Updated date
- Hover: border → yellow transition

## Components mới

- `src/components/SearchFilter.tsx` — `"use client"` search + sort
- `src/components/FilterSidebar.tsx` — `"use client"` category + tag filters
- `src/components/DatasetCard.tsx` — dataset card với tags

## Files sửa

- `src/app/page.tsx` — rewrite: sidebar + search + card grid layout
- Xóa old entity-based homepage logic

## Decisions

### Client-side filtering
Tất cả filtering/search thực hiện client-side. RSC fetch tất cả datasets, truyền xuống client component.

**Why**: Phase 1 ít datasets (< 100), không cần server-side pagination. Đơn giản hơn.

**How**: Page RSC fetch datasets → truyền props xuống SearchFilter + FilterSidebar. Client component dùng `useState` filter.

### Xóa old routes
Xóa `/entities/[id]` route, `/api/entities/*` endpoints. Tất cả chuyển sang `/datasets/[slug]`.

**Why**: Routing mới là dataset-centric. Giữ cả hai gây nhầm lẫn.

## Out of Scope
- Không pagination (ít datasets)
- Không infinite scroll
- Không server-side search

## Validation
- Sidebar hiện categories + tags (từ API)
- Check category → filter cards đúng
- Check tag → filter cards đúng
- Search gõ keyword → filter đúng (case-insensitive, match title + description)
- Sort dropdown hoạt động
- Dataset cards hiển thị đúng: title, description, tags, info
- Click card → navigate `/datasets/[slug]`
- Mobile: sidebar ẩn/stacked
- `npm run build` exit 0
