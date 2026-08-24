# Phase 1 — HF Frontend Demo (Mock Data)

> **TRẠNG THÁI**: Demo. Frontend dùng **mock data hardcoded** trong `src/lib/mock/datasets.ts`.
> Chưa kết nối DB, chưa có API thật. Mục đích: chốt hướng UI trước khi migrate dữ liệu thật.

## Scope

Triển khai giao diện HF-style cho Dataset Hub — **chỉ frontend, mock data, không đụng DB/API**.
Bản sao của `prototype/hf-clone.html` (đã duyệt) chuyển sang React + Tailwind v4.

## Context

Phase 1 cần quyết định hướng UI trước khi đầu tư vào data migration. Đã build prototype HTML
để nhìn visual chung → duyệt → implement trong React. Spec này mô tả **gì đã được build**,
không phải kế hoạch tương lai.

## What Was Built

### Design tokens — `src/app/globals.css`
Tailwind v4 `@theme` directive đăng ký HF tokens thành utility classes:
- Colors: `hf-bg`, `hf-bg-subtle`, `hf-bg-muted`, `hf-border`, `hf-border-strong`,
  `hf-text`, `hf-text-muted`, `hf-text-faint`, `hf-yellow`, `hf-yellow-50`,
  `hf-link`, `hf-green`, `hf-red`
- Fonts: `--font-sans` (Source Sans 3), `--font-mono` (IBM Plex Mono)

### Fonts — `src/app/layout.tsx`
Google Fonts `<link>` (Source Sans 3 + IBM Plex Mono) trong `<head>`. Không CSS `@import`.

### Mock data — `src/lib/mock/datasets.ts`
Type `Dataset` + 5 datasets (Hero: "Hồ sơ 34 tỉnh thành 2025" với stats/wards/leadership;
4 dataset khác: GRDP, bầu cử, khí hậu, FDI). Mỗi dataset có: slug, title, description,
category, tags, license, year_range, row_count, file_count, total_size_mb,
**downloads, likes**, source, uploaded_by/at, resources[], data_dictionary[].

### Listing `/` — `src/app/page.tsx` + `src/components/DatasetExplorer.tsx`
HF compact-row listing:
- Top nav: 🤗 VNExpress Data + nav links + search mini
- Sidebar filters: Lĩnh vực / Quy mô / Định dạng / Tags (checkbox + count, yellow accent)
- Search bar + sort (Trending / Recently updated / Most downloaded / Most liked)
- **Compact rows** (KHÔNG phải card grid): `org/name` → `Viewer`/`Preview` badge →
  `Updated • rows • files • size` → `★ likes`
- Client-side filtering/sorting

### Detail `/datasets/[slug]` — `src/app/datasets/[slug]/`
HF dataset page:
- Header: `org/name` + like/follow buttons
- Metadata pills: Modalities / Formats / Size / Library / License
- 3 tabs (yellow underline): **Dataset card** | Files and versions | Community
- **DatasetViewer** (`DatasetViewer.tsx`) — dataset viewer:
  - Resource dropdown (province_stats · 34 rows, ...) — **KHÔNG có train/test split**
  - Per-column mini charts: histogram (numeric) + proportion bar (categorical), inline SVG
  - Type badges (`int64`/`float64`/`string`) + `min → max` / `N giá trị`
  - Right-aligned numbers (IBM Plex Mono, tabular-nums)
  - Pagination 10 rows/page + "End of preview · Expand in Data Studio"
- README section + data dictionary preview
- **MetadataSidebar** (`MetadataSidebar.tsx`): Tải về / Quy mô / Nguồn gốc
  (KHÔNG có Chất lượng box — đã gỡ theo feedback)

## Files

### Tạo
- `src/lib/mock/datasets.ts`
- `src/components/DatasetExplorer.tsx`
- `src/app/datasets/[slug]/page.tsx`
- `src/app/datasets/[slug]/DatasetViewer.tsx`
- `src/app/datasets/[slug]/TabSwitcher.tsx`
- `src/app/datasets/[slug]/MetadataSidebar.tsx`
- `prototype/hf-clone.html` (reference / ground truth, giữ lại)

### Sửa
- `src/app/globals.css` — HF tokens thay VNE palette
- `src/app/layout.tsx` — fonts + metadata + body classes
- `src/app/page.tsx` — rewrite thành HF listing

### Xóa
- `src/components/DatasetCard.tsx` (thay bằng compact rows)
- `src/app/datasets/[slug]/DataTable.tsx` (thay bằng DatasetViewer)

## Decisions

### Mock data, không đụng DB/API
**What**: Toàn bộ data từ file `src/lib/mock/datasets.ts`, import trực tiếp vào server components.
**Why**: Chốt hướng UI trước. Mọi thứ fully reversible — xóa mock file + component để revert.

### Clone HF, không Kaggle
**What**: Giao diện theo Hugging Face `/datasets`, không Kaggle.
**Why**: (1) Constitution (mission.md, tech-stack.md) chỉ định HF Hub làm model.
(2) Tab `Dataset card | Files | Community` map 1:1 với spec `Hồ sơ | Dữ liệu | Files`.
(3) HF yellow (`#FFD21E`) cùng họ với VNE yellow.

### Compact rows thay card grid
**What**: Listing dùng 1 row/dataset (HF style), KHÔNG card grid.
**Why**: HF thật là list, không grid. Card grid từ spec 2026-06-09-dataset-listing cũ đã obsolete.

### Dataset viewer có mini charts
**What**: Mỗi column header có histogram (numeric) hoặc proportion bar (categorical),
inline SVG không dependency.
**Why**: Đây là HF signature — "summarize stats at a glance". Histograms lộ outlier
(VD: HCM trong `population`), proportion bar cho categorical distribution.

### Gỡ Chất lượng box
**What**: Không hiển thị quality score / quality breakdown.
**Why**: HF không có concept này. Quality score là ý tưởng từ spec cũ, không phù hợp HF model.

### Không train/test split
**What**: Resource dropdown thay cho Subset/Split dropdown.
**Why**: ML concept, không apply cho newsroom dataset. Newsroom dataset = 1 table.

## Out of Scope (Demo)

- ❌ Kết nối Supabase thật (chưa có `datasets` table)
- ❌ API thật (các `/api/*` route giữ nguyên, không đụng)
- ❌ Upload functionality mới (giữ `/upload` cũ)
- ❌ Search ở server-side (chỉ client-side filtering)
- ❌ Authentication
- ❌ Mobile-specific optimization

## Không Đụng

- Tất cả `/api/*` routes
- `/entities/[id]` page + API
- `/upload` page + API
- `data/scripts/*` (SQL, Python)
- DB schema

## Validation

Xem `validation.md`.
