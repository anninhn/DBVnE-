# Changelog

Mọi thay đổi đáng chú ý của dự án. Format dựa [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased] — Phase 1 Dataset Hub (đang phát triển)

### 2026-06-23 — HF Frontend Demo (mock data)

Triển khai giao diện HF-style — **chỉ frontend, mock data, không đụng DB/API**.
Bản sao của `prototype/hf-clone.html` (đã duyệt) → React + Tailwind v4. Mục đích: chốt
hướng UI trước khi migrate dữ liệu thật. Xem `specs/2026-06-23-hf-frontend-demo/`.

**Added**
- Design tokens HF trong `globals.css` qua Tailwind v4 `@theme` (colors + fonts)
- Google Fonts (Source Sans 3 + IBM Plex Mono) qua `<link>` trong `layout.tsx`
- Mock data `src/lib/mock/datasets.ts` — 5 datasets, hero là "Hồ sơ 34 tỉnh thành 2025"
- Listing `/` HF compact-row style (`DatasetExplorer.tsx`) + sidebar filters + sort
- Detail `/datasets/[slug]` HF layout: header `org/name`, metadata pills, 3 tabs
- **DatasetViewer** — dataset viewer với mini charts:
  - Histogram (numeric) + proportion bar (categorical), inline SVG, không dependency
  - Type badges + `min → max` / `N giá trị`
  - Resource dropdown (KHÔNG train/test split)
  - Pagination + "End of preview"
- `MetadataSidebar` — Tải về / Quy mô / Nguồn gốc
- Prototype `prototype/hf-clone.html` (giữ làm reference / ground truth)

**Changed**
- Listing: card grid → compact rows (HF style)
- `datasets.ts`: gỡ `quality_score`/`quality`/`last_verified_at`, thêm `downloads`/`likes`
- `page.tsx` (home): rewrite từ entity-grouped sang HF dataset listing

**Removed**
- `src/components/DatasetCard.tsx` (thay bằng compact rows)
- `src/app/datasets/[slug]/DataTable.tsx` (thay bằng DatasetViewer)
- Chất lượng box khỏi sidebar (HF không có concept này)
- VNE color palette (thay bằng HF tokens)

**Không đụng** — tất cả `/api/*`, `/entities/[id]`, `/upload`, DB schema, SQL/Python scripts.

> ⚠️ **Demo**: chưa kết nối Supabase. Data từ mock file. Khi migrate thật: tạo bảng
> `datasets`/`resources`/`data_dictionary`/`upload_log` (theo `tech-stack.md`), seed
> 34-tinh data, thay mock import bằng Supabase query. UI đã structured đọc từ `Dataset`
> type khớp schema đó.

### 2026-06-09 — Redefinition: 34 Tỉnh wiki → VNExpress Data Platform

Scope mở rộng từ "34 Tỉnh wiki" thành "VNExpress Data Platform" — mọi dataset tòa soạn.
3 phases: hub → query → intelligence. Thêm data quality, provenance, RAG roadmap.

### 2026-06-08 — Wiki infrastructure

Next.js 15 + Tailwind + Supabase. DB schema entity-centric (`entities_catalog`,
`resources`, `resource_versions`, `indicator_metadata`, `tags`). API + `/entities/[id]`
page + `/upload` form.

### 2026-05-09 — Initial: 34 Tỉnh dataset

Khởi tạo dataset lõi 34 tỉnh thành. Database schema + seed data.
