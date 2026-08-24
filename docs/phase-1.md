# Phase 1 — Dataset Hub

**Trạng thái**: Hoàn thành 2026-07-24 · Production-ready trên Vercel · Branch `main` duy nhất

Tài liệu chính thức đóng gói Phase 1 — mục tiêu, kiến trúc, feature map, out-of-scope, source-of-truth. Tham chiếu cho onboarding / handoff / planning Phase 2.

---

## Mục tiêu

**Demand discovery** cho tòa soạn VnExpress: thu thập + chuẩn hóa + track usage dataset để biết cái nào đáng đầu tư structured query (Phase 2). Phase 1 **không phải** "single source of truth" warehouse — chỉ là catalog + upload + preview + tracking.

Recap đầy đủ: `constitution/mission.md`, `constitution/tech-stack.md`, `constitution/roadmap.md`.

## Trạng thái

- **Production**: Vercel auto-deploy từ `main`, dynamic SSR (`force-dynamic`)
- **7 datasets thật đã upload**: `diem-thi-tot-nghiep-thpt-quoc-gia`, `quy-hoach-he-thong-cang-hang-khong-viet-nam-2030-2050`, `ranh-gioi-hanh-chinh-34-tinh-thanh-viet-nam`, `ranh-gioi-hanh-chinh-cap-phuongxa-cua-viet-nam`, `thong-tin-34-tinhthanh-pho`, `thu-tuc-hanh-chinh-theo-linh-vuc-va-co-quan-quan-ly`, `vi-tri-ha-tang-truyen-tai-dien-tai-viet-nam`
- **Milestone timeline**: CHANGELOG.md (entries 2026-05-09 → 2026-07-24)

## Kiến trúc (Architecture Snapshot)

| Layer | Technology |
|-------|------------|
| Runtime | Next.js 15 App Router, dynamic SSR trên mọi page fetch external data |
| Metadata (source of truth) | `datasets/<slug>/metadata.yaml` qua **GitHub Contents API** (authoritative, không CDN stale) |
| Dictionary (source of truth) | `datasets/<slug>/dictionary.md` |
| Binary files | Cloudflare R2 tại key `<fileId>/<filename>` (UUID-based, skip staging prefix) |
| Counters | R2 key `_counters/<slug>.json` (downloads all-time) |
| Auth | NextAuth v5 credentials + JSON user store (`datasets/_users/users.json`, git-tracked) |
| AI | Swap-able qua 3 env vars: `AI_BASE_URL` / `AI_MODEL` / `AI_ENV_VAR` |
| Storage | **Zero PostgreSQL** cho Phase 1 (drop 2026-07-09) |

**Data plane**: GitHub fetch runtime → `src/lib/datasets/{list,read}.ts` → `Dataset` object → UI. No DB.

## Feature Map (Shipped)

### User-facing

| # | Feature | Files chính | Notes |
|---|---------|-------------|-------|
| 1 | **Catalog Listing & Detail** | `src/app/page.tsx`, `src/app/datasets/[slug]/page.tsx`, `src/components/DatasetExplorer.tsx`, `src/lib/datasets/{list,read}.ts` | Compact rows HF-style, sidebar filters (category/tags/sizes/formats), pagination PAGE_SIZE=20 |
| 2 | **Upload Wizard (AI-assisted)** | `src/app/upload/page.tsx`, `src/components/upload/*`, `src/app/api/upload/{presign,analyze,commit}/route.ts` | 4 bước: drop → R2 presign PUT → AI inspect (metadata + dictionary) → review → commit GitHub Contents API |
| 3 | **Data Preview + File Viewer** | `src/app/datasets/[slug]/{DatasetViewer,R2FileViewer,FilesTabContent,DatasetCardTabs}.tsx`, `src/lib/parse/{csv,geojson,number,decimal-detect}.ts` | CSV HTTP Range 1MB chunk (153MB/1.58M rows → 2.3s), XLSX qua `xlsx` pkg, GeoJSON Leaflet toggle Map/Table, DataDictionary decouple khỏi preview data |
| 4 | **Search Adapter (forward-compatible)** | `src/lib/search/{types,simple-filter,index}.ts`, `src/components/search/SearchBox.tsx`, `src/components/CatalogNav.tsx` | `SimpleFilterAdapter` token-AND + diacritics-insensitive. `SearchAdapter` interface cho Phase 2 swap (Flexsearch/Pagefind) |
| 5 | **Edit / Delete Dataset** | `src/components/dataset/{EditDatasetForm,DeleteDatasetButton}.tsx`, `src/app/api/dataset/{edit,delete}/route.ts`, `src/lib/dataset-commit.ts`, `src/lib/dataset-render.ts` | Metadata-only edit (no file replace). **Soft** delete (`status: deleted` + audit log, raw file giữ nguyên), **dev-only** — guard `NODE_ENV` ở cả UI lẫn API (spec `002` FR-034, chốt 2026-08-24) |
| 6 | **GeoJSON Upload + Preview** | `src/lib/parse/geojson.ts`, `src/components/geo/*`, `src/app/datasets/[slug]/DatasetCardTabs.tsx` | Native parser (RFC 7946 validate, reject CRS khác WGS84). Leaflet ~40KB, CartoDB Positron grayscale. Deferred init bằng rAF tránh Canvas crash |
| 7 | **Frictionless Data Table Schema** | `src/lib/parse/{number,decimal-detect}.ts`, `src/lib/viz/column-stats.ts`, `src/components/upload/DictionaryEditor.tsx` | `decimal_char` + `group_char` per dictionary field. Storage giữ raw, parser đọc schema. Display convention: cell UI = raw, stats UI = vi-VN format |
| 8 | **Auth nhẹ + Provenance** | `src/proxy.ts`, `src/auth.config.ts`, `src/lib/auth/*`, `src/components/auth/*` | NextAuth v5 credentials + JSON user store. Actor tracking vào `metadata.yaml`: `created_by`, `last_edited_by`, `edits[]` timeline (reverse-chrono) |
| 9 | **Article Linking (reverse provenance)** | `src/lib/articles/*`, `src/app/api/dataset/articles/*`, `src/app/datasets/[slug]/ArticlesTab.tsx` | Gắn URL `vnexpress.net` vào dataset. Auto-fetch OG metadata (cheerio, user-approved dep ngoài stack). Card style VnExpress spotlight |
| 10 | **Download Counter** | `src/lib/r2/counter.ts`, `src/app/api/dataset/download/route.ts` | R2 JSON counter `_counters/<slug>.json` (all-time). Hide Star/Follow social UI |
| 11 | **Listing Render Perf** | `src/components/CatalogNav.tsx`, `src/components/DatasetExplorer.tsx` | `memo(CatalogNav)` + `memo(DatasetRow)` — sort/filter/page change skip re-render rows. ~225ms → ~25ms |

## Out of Scope (Explicit Deferred)

### Phase 2 (Discovery Chat)

- **Search dictionary content** (column names trong data_dictionary) — `SimpleFilterAdapter.capabilities.dictionary = false`, enable khi swap sang Flexsearch
- **Search analytics log** — log queries cho demand discovery signal

### Phase 3 (Intelligence Platform)

- **PDF upload** — Document RAG (3a) pickup upload flow, cả 2 loại (text-based `pdf-parse` + scanned OCR/AI vision)
- **MP3 upload** — Audio RAG (3b) pickup upload flow, Whisper ASR
- **Vector DB / semantic search trên metadata** — Phase 3f optional, trigger: catalog >100 + fuzzy intent ("kinh tế Nam Bộ" → "ĐBSCL")

### Post-Phase 3 / Out of roadmap

- Mobile responsive (internal tool, desktop-first)
- Public-facing data portal
- Real-time data feeds
- Automated fetching từ GSO, World Bank, etc.

## Known Gaps (Workaround hiện tại)

| Gap | Workaround | Spec đề xuất |
|-----|-----------|--------------|
| File replacement (re-upload đè R2 object) | Delete + upload lại (mất slug history, tốn AI analyze call lại) | `specs/2026-07-1X-replace-file/` (chưa tạo) |
| Restore UI cho dataset đã soft-delete | Chưa có. Muốn khôi phục = sửa `status` trong metadata.yaml qua git | Defer, rare operation |
| Xóa dataset ở production | Không hỗ trợ có chủ đích (spec `002` FR-034). Muốn dọn kho = chạy dev, hoặc `tools/cleanup-orphans.mjs --include-deleted` cho hard delete | Quyết định 2026-08-24 |
| R2 Object Versioning chưa GA (2026-07) | `sha256` (ChecksumMode=ENABLED) làm atomic reference thay `version_id` | Re-evaluate khi Cloudflare GA |
| TSV format | Drop 2026-07-23 (`parseCSV` hardcode comma delimiter). CSV/XLSX/XLS + GeoJSON only | Upgrade parser nếu có demand thực tế |
| Edit article (sửa/xóa sau khi add) | MVP: add + display only, không edit/delete | Defer |
| Race condition download counter (2 concurrent downloads có thể mất 1 count) | Acceptable Phase 1 low traffic | Phase sau: Vercel KV (new dependency) |
| User self-service change password | Admin-only: user nhờ admin chạy `tools/hash-password.mjs` → dán hash vào `users.json` → commit GitHub. User không tự đổi được | **Phase 2** — add `/api/auth/change-password` route + UI form |

## Source of Truth (Thư mục chính)

| Area | Path |
|------|------|
| Constitution | `constitution/{mission,tech-stack,roadmap}.md` |
| Specs history | `specs/2026-06-*` → `specs/2026-07-24-article-linking/` |
| Catalog data | `datasets/<slug>/{metadata.yaml,dictionary.md}` |
| Internal | `datasets/_users/users.json` (user store), `datasets/_audit/` (audit log dir) |
| App routes | `src/app/{page.tsx, login/, upload/, datasets/[slug]/, api/}` |
| Domain logic | `src/lib/{datasets,parse,search,viz,articles,auth,r2,git,ai}/` |
| UI components | `src/components/{auth,upload,search,dataset,geo}/` |
| Maintenance scripts | `tools/{cleanup-orphans,backfill-actor,hash-password,setup-r2-cors}.mjs`, `tools/prompts/` |
| Data scripts (Python) | `data/scripts/parse_*.py`, `data/scripts/sync_all.py` |
| Maintenance doc | `CLAUDE.md` (Maintenance Scripts section) |

## Environment / Deployment

| Variable | Purpose |
|----------|---------|
| `AI_BASE_URL` / `AI_MODEL` / `AI_ENV_VAR` | AI provider swap-able (provider-agnostic naming) |
| `R2_*` (account, access key, secret, bucket, public base) | Cloudflare R2 client + public URL |
| `GITHUB_TOKEN` | GitHub Contents API (metadata.yaml commit/fetch) |
| `AUTH_SECRET` / `NEXTAUTH_URL` | NextAuth v5 |

- **Branch**: `main` duy nhất (main-only workflow, không feature branch)
- **Production**: Vercel auto-deploy từ main, dynamic SSR
- **R2 public URL**: `https://pub-3c7cf6f34d3a49799247144e926b6df0.r2.dev`
- **CORS R2**: configured cho localhost + vercel.app (chạy `tools/setup-r2-cors.mjs` nếu config bucket mới)

## Quy ước (Recap)

- Văn phong tiếng Việt trong code comments + UI text
- Branding "VnExpress" (camelCase), không "VNExpress"
- Terminology English (Dataset, Data Dictionary, Trending, rows), wizard verbs + error messages Việt
- Không thêm dependency mới không approval
- Mọi thay đổi dataset qua UI/API (không edit trực tiếp GitHub hay R2) — sync giữa metadata GitHub và R2 files
- Provenance UI: timestamp tuyệt đối `dd/mm/yyyy, hh:mm` (giờ VN, `Asia/Ho_Chi_Minh`), không relative time

## Phase 2 Entry Point

Sau Phase 1 wrap-up, Phase 2 = **Discovery Chat** (LLM routing zero-infra, Claude thấy metadata tất cả datasets → trả top-3 cards + lý do phù hợp). Scope thu hẹp so với plan cũ — bỏ chart builder / SQL panel / text-to-SQL, đẩy Phase 3.

- Spec dir: `specs/2026-07-XX-discovery-chat/` (chưa tạo)
- Start: chạy `/feature-spec` để interview + draft spec
- Roadmap đầy đủ: `constitution/roadmap.md` section Phase 2
