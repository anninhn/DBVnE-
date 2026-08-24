# Phase 1 Validation — HF Frontend Demo (Mock Data)

## Definition of Done

All verified 2026-06-23.

### 1. Build sạch
`npm run build` — exit 0, no TypeScript errors. ✓

### 2. Listing `/`
- HF top nav (🤗 VNExpress Data)
- 5 dataset rows hiển thị dạng compact (`org/name` + badge + meta + likes)
- Sidebar filters (Lĩnh vực / Quy mô / Định dạng / Tags) có count
- Search filter đúng (client-side, match title/slug/description/tags)
- Sort dropdown hoạt động (Trending / Recent / Downloaded / Liked)
- Click row → `/datasets/[slug]` ✓

### 3. Detail `/datasets/[slug]`
- Header `org/name` + like/follow buttons
- Metadata pills (Modalities / Formats / Size / Library / License)
- 3 tabs switch không reload, yellow underline trên active
- DatasetViewer: resource dropdown switch data
- Mini charts: histogram (numeric) + proportion bar (categorical) render đúng
- Pagination hoạt động (10 rows/page)
- Sidebar: Tải về / Quy mô / Nguồn gốc (KHÔNG có Chất lượng box) ✓

### 4. Decisions implemented
- Mock data only (import trực tiếp, không fetch) ✓
- Compact rows (không card grid) ✓
- No train/test split (chỉ resource dropdown) ✓
- Chất lượng box removed ✓
- HF tokens, không VNE palette ✓

## Not Required (Demo)

- Không cần kết nối DB thật
- Không cần API thật
- Không cần browser cross-check từng pixel (prototype HTML là ground truth)
- Không cần tests tự động
