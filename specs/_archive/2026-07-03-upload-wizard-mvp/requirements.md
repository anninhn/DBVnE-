# Phase 1 — Upload Wizard MVP Requirements

## Scope

Build chunk đầu tiên của Phase 1 re-arch (xem `constitution/roadmap.md` 2026-07-02): upload wizard đa bước với AI-assisted metadata/dictionary proposal, dùng Cloudflare R2 storage thật + AI (OpenAI-compatible, đang dùng Gemini 2.5 Flash).

### Deliverables

**1. Upload wizard 4 bước** (`/upload` page):
- **Bước 1 — Drop file**: drag-and-drop hoặc click chọn. Accept `.csv` + `.xlsx`. Limit 100MB/file.
- **Bước 2 — AI Analyzing**: loading state trong khi server fetch file từ R2, inspect columns/sample, gọi AI → proposal.
- **Bước 3 — Review**: user edit metadata (title, description, category, tags, source, source_url) và dictionary (column, type, unit, description). Tags chọn từ PostgreSQL `tags` table. AI flag uncertainty (confidence field + questions).
- **Bước 4 — Preview commit**: render `metadata.yaml` + `dictionary.md` preview. KHÔNG git push (chỉ preview).

**2. API routes** (Next.js App Router, dynamic):
- `POST /api/upload/presign` — trả presigned PUT URL cho browser upload thẳng R2 `staging/` (TTL 15 phút).
- `POST /api/upload/analyze` — nhận `fileId`, server fetch object từ R2, inspect format-aware, gọi AI qua OpenAI SDK, trả proposal JSON.
- `POST /api/upload/commit` — preview-only: render metadata.yaml + dictionary.md content, log "would commit". KHÔNG git push, KHÔNG move R2 object.

**3. Storage layer** (`src/lib/r2/`):
- `presign.ts` — tạo presigned PUT URL (scope `staging/*`, 15 phút TTL) dùng `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.
- `get.ts` — server-side fetch R2 object bằng Access Key (private, không expose browser).
- R2 bucket layout: `staging/<fileId>` (uploads chờ commit), `<slug>/` (committed — chưa dùng trong MVP nhưng setup sẵn).

**4. AI layer** (`src/lib/ai/`):
- `dataset-reviewer.ts` — OpenAI SDK client với `AI_BASE_URL` + `AI_MODEL` + `AI_ENV_VAR` constants (switch provider bằng 3 dòng).
- System prompt template cho tabular (CSV + XLSX): đề xuất metadata + dictionary + questions.
- File inspection: papaparse (CSV) + xlsx/SheetJS (XLSX) → columns + dtypes + sample rows + basic stats (min/max/unique/null count).

**5. Tags vocabulary** (`src/lib/tags.ts`):
- Fetch từ PostgreSQL `tags` table hiện có (đã seed từ F1).
- Cache in-memory per request.

**6. Frontend components** (`src/components/upload/`):
- `UploadWizard.tsx` — state machine 4 bước.
- `UploadDropzone.tsx` — drag-drop + gọi `/api/upload/presign` + PUT R2.
- `AIAnalyzingLoader.tsx` — loading state Bước 2.
- `MetadataEditor.tsx` — form edit metadata, tags multi-select từ DB.
- `DictionaryEditor.tsx` — table edit dictionary (column, type, unit, description).
- `CommitPreview.tsx` — render YAML + Markdown preview.

## Out of Scope (defer)

- **Git commit automation** — `/api/upload/commit` chỉ preview metadata.yaml + dictionary.md content, không push.
- **R2 object move staging → final** — file ở `staging/` sau khi preview, không move (lifecycle rule auto-clean sau 24h setup sau).
- **Migrate "Hồ sơ 34 tỉnh" từ PostgreSQL sang files** — build chunk riêng (F1-R phần migrate).
- **SSG catalog rebuild từ metadata.yaml** — build chunk riêng (F2-R). Catalog display vẫn dùng listing PostgreSQL cũ.
- **Tracking/analytics** (Plausible/Umami) — build chunk riêng (F4-R).
- **Auth/RBAC** — MVP mở (no auth). Defer xuống Phase sau.
- **PDF/Parquet/MP3/GeoJSON support** — MVP chỉ CSV + XLSX.
- **Vercel production deploy** — local dev trước. Vercel Hobby plan (300s timeout với Fluid Compute) đủ cho demo — không cần upgrade Pro.
- **Quality scoring**, **Promotion pipeline**, **Public R2 read** — Phase 2+.

## Decisions

### Storage: Cloudflare R2 thật (presigned URL pattern)
Lý do: file dataset có thể vài MB đến 100MB. Vercel serverless có body size limit (~4.5MB Hobby). Browser upload thẳng R2 qua presigned URL = không giới hạn, không tốn Vercel bandwidth. R2 free tier 10GB vĩnh viên + zero egress.

### AI: Google Gemini 2.5 Flash (free tier) qua OpenAI SDK compatible
**Deviation từ `constitution/tech-stack.md`** (tech-stack nói Claude API). Lý do chọn Gemini:
- **Free tier vĩnh viễn**: 250 requests/day, 250K tokens/min — đủ demo hàng chục upload/ngày.
- **JSON mode native** (`response_format: { type: "json_object" }`) → output luôn hợp lệ, không fail parse.
- **Tiếng Việt tốt**: Google train đa ngôn ngữ mạnh, test thực tế proposal chất lượng cao (đúng category, tags, units; flag uncertainty chính xác).
- **OpenAI-compatible endpoint**: `https://generativelanguage.googleapis.com/v1beta/openai/` → dùng được `openai` npm package, switch provider sau chỉ đổi 2 hằng số.

Đã test Z.ai (GLM) trước — key hợp lệ nhưng API Platform account cần recharge (Coding Plan subscription không reuse cho API). Switch sang Gemini để demo ngay không cần nạp tiền.

Code `src/lib/ai/dataset-reviewer.ts` có 3 hằng số `AI_BASE_URL` + `AI_MODEL` + `AI_ENV_VAR` để switch provider dễ dàng sau này.

### Wizard UX: 4 bước riêng với progress bar
Lý do: flow phức tạp (upload + AI + review + commit), 4 bước rõ ràng dễ demo, dễ debug. State machine trong `UploadWizard.tsx`.

### File size limit: 100MB/upload
Lý do: đủ cho dataset XLSX lớn (niên giám GSO có thể 50-80MB). Presigned URL vẫn cần cap để tránh abuse khi open auth. Hardcode trong `/api/upload/presign` route guard.

### Tags source: PostgreSQL `tags` table hiện có
Lý do: đã seed từ F1, có data thật. Tránh rebuild controlled vocabulary từ đầu. Fetch qua Supabase client đã có sẵn. Defer `tags.yaml` file-based cho build chunk sau.

### Auth: mở (no auth) cho MVP
Lý do: internal tool, demo nội bộ. Defer auth/RBAC. Mitigation: file size cap + rate limit (chưa implement trong MVP — flag trong requirements).

### Commit: preview-only (no git push)
Lý do: GITHUB_TOKEN setup + git push từ server-side thêm complexity. MVP chỉ demo flow upload + AI. Preview metadata.yaml + dictionary.md render cho user xem "what would be committed". Build chunk sau thêm git push thật.

### Deploy: local dev trước, Vercel Hobby OK sau
Vercel Fluid Compute (enabled by default) cho Hobby plan timeout **300s (5 phút)** — đủ dư cho AI call (~5-15s kể cả file lớn). KHÔNG cần upgrade Pro cho demo. Local dev trước để iterate nhanh, deploy Vercel Hobby khi muốn share URL demo. Set `export const maxDuration = 60` trên `/api/upload/analyze` route (chỉ cần 60s, không cần dùng hết 300s quota).

### Dependencies mới cần thêm (theo CLAUDE.md cần user approval)
User đã approve:
- `openai` — AI client (OpenAI-compatible)
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` — R2 presigned URL
- `papaparse` + `@types/papaparse` — CSV parsing
- `xlsx` (SheetJS) — XLSX parsing

### Frontend style: HF clone tokens (`hf-*` từ `src/app/globals.css`)
Bám sát pattern `DatasetExplorer.tsx` hiện tại — KHÔNG dùng VNE palette (`constitution/vne-color-palette.md`) trong spec này (việc migration sang VNE palette là decision riêng, ngoài scope).

**Quy ước**:
- Token prefix: `hf-*` (bg, bg-subtle, bg-muted, border, border-strong, text, text-muted, text-faint, yellow, link, green, red).
- Density: compact — `text-[13px]`, `text-sm`, `text-xs`. Padding ít (`py-2.5`, `gap-2`).
- Border-chứa-không-shadow: `border border-hf-border rounded-md`.
- Accent: HF yellow `#ffd21e` cho focus ring + checkbox + AI highlight.
- Fonts: Source Sans 3 (body) + IBM Plex Mono (YAML/MD preview, code).
- AI-proposed sections: visual distinguish bằng `border-l-2 border-hf-yellow pl-3 bg-hf-yellow-50/30` để user biết phần nào AI đề xuất.

**Archive**: `src/app/upload/page.tsx` hiện tại (F0, dùng `bg-gray-*`/`bg-blue-*` Tailwind mặc định) — move sang `_archive/` trước khi viết wizard mới.

## Context

Phase 1 re-architecture (chốt 2026-07-02) chọn file-based substrate + AI-assisted upload thay vì PostgreSQL-centric. Lý do chính: demand discovery + AI-assisted standardization tại upload time. Xem `specs/2026-07-02-phase1-rearch/` và `constitution/roadmap.md` entry 2026-07-02.

Spec này là **build chunk #3 + #4 gộp** trong roadmap (Upload wizard UI + AI Dataset Reviewer backend) — gộp vì UI và API không shippable độc lập. Các build chunk khác (#1 migration foundation, #2 catalog SSG, #5 tracking) được defer — không cần thiết cho demo upload wizard.

**Mục tiêu demo**: Ninh upload 1 dataset CSV (vd: GRDP 34 tỉnh) → wizard 4 bước → AI propose metadata/dictionary → user review/edit → preview commit. Demo trên local `npm run dev` (`http://localhost:3000/upload`).

**Điều kiện thành công**:
- Upload + AI + review flow chạy end-to-end không lỗi.
- AI proposal có fields chuẩn (title, description, category, tags suggest, source, dictionary rows).
- File lưu ở R2 `staging/` (verify qua Cloudflare dashboard).
- Preview metadata.yaml + dictionary.md render đúng format.

## Stakeholder Notes

- **Ninh (Data Journalist)** — primary user Phase 1. Cần upload dataset mới < 15 phút (success metric trong `mission.md`). Wizard phải intuitive, AI proposal phải chính xác (đặc biệt guess source/units). Ninh sẽ demo cho Minh (Editor) trên máy mình.
- **Minh (Editor)** — secondary user Phase 1. Sẽ xem demo từ Ninh. Cần flow đơn giản — Minh không technical. AI proposal phải đủ tốt để Minh chỉ cần review, không phải viết metadata từ trang trắng.
- **Hoa (Reporter)** — KHÔNG có requirements Phase 1. Hoa dùng catalog listing PostgreSQL cũ để browse dataset có sẵn. Sẽ cần Phase 2+ khi có query layer.
