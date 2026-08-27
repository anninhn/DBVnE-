# Phase 1 — Upload Wizard MVP Plan

## Group 1 — Infrastructure setup

1. **Cloudflare R2 bucket**: signup cloudflare.com → R2 → Create bucket `vnexpress-data`. Enable `staging/` prefix. (Manual qua dashboard — 5 phút)
2. **R2 API token**: R2 → Manage R2 API Tokens → Create → permission Object Read & Write → copy `Access Key ID` + `Secret Access Key` + `Account ID`.
3. **AI provider API key** (recommend Gemini free tier): https://aistudio.google.com/app/apikey → Create API key → copy key.
4. **`.env.local`**: thêm `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME=vnexpress-data`, `R2_PUBLIC_BASE` (để trống MVP), `GEMINI_API_KEY`.
5. **Install dependencies**: `npm install openai @aws-sdk/client-s3 @aws-sdk/s3-request-presigner papaparse xlsx` + `npm install -D @types/papaparse`.
6. **`datasets/` folder placeholder**: tạo `datasets/.gitkeep` (sẽ dùng cho metadata.yaml trong build chunk sau).

## Group 2 — Backend libraries (R2 + AI + tags)

7. **`src/lib/r2/client.ts`**: khởi tạo S3Client với `endpoint: https://<account_id>.r2.cloudflarestorage.com`, credentials từ env, region `auto`.
8. **`src/lib/r2/presign.ts`**: export `presignUpload(fileId, contentType)` — tạo PUT presigned URL cho key `staging/<fileId>`, TTL 15 phút, scope limit.
9. **`src/lib/r2/get.ts`**: export `getObject(key)` — server-side fetch R2 object, return Buffer.
10. **`src/lib/ai/inspect.ts`**: export `inspectFile(buffer, format)` — detect CSV/XLSX → parse (papaparse cho CSV, xlsx cho XLSX) → return `{ columns, dtypes, sampleRows, basicStats, rowCount }`. Limit sample 100 rows cho AI token budget.
11. **`tools/prompts/dataset-reviewer-tabular.md`**: system prompt cho AI — instruct đề xuất metadata (title, description, category, tags suggest, source, source_url, confidence) + dictionary (column, type, unit, description) + questions (uncertainty flags). Yêu cầu output JSON schema cố định.
12. **`src/lib/ai/dataset-reviewer.ts`**: export `analyzeDataset(inspection, filename)` — init OpenAI client với `AI_BASE_URL` + `AI_MODEL` + `AI_ENV_VAR` constants, gọi với system prompt từ file #11 + inspection JSON, parse response thành proposal object. JSON mode (`response_format: { type: "json_object" }`).
13. **`src/lib/tags.ts`**: export `getTags()` — fetch từ PostgreSQL `tags` table qua Supabase client đã có. Return `string[]`. Cache in-memory per request.

## Group 3 — API routes

14. **`src/app/api/upload/presign/route.ts`**: POST handler — nhận `{ filename, contentType, size }`, validate content-type (csv, xlsx, vnd.ms-excel, vnd.openxmlformats-officedocument.spreadsheetml.sheet) + size ≤ 100MB, generate `fileId = crypto.randomUUID()`, gọi `presignUpload()`, return `{ presignedUrl, fileId, r2Key }`. Set `export const maxDuration = 60`.
15. **`src/app/api/upload/analyze/route.ts`**: POST handler — nhận `{ fileId, r2Key, filename }`, gọi `getObject(r2Key)` → `inspectFile()` → `analyzeDataset()`, return `{ proposal, filePreview }`. Wrap trong try-catch, return `{ error }` nếu AI call fail. Set `export const maxDuration = 60`.
16. **`src/app/api/upload/commit/route.ts`**: POST handler — nhận `{ fileId, metadata, dictionary }`, render `metadata.yaml` (yaml string) + `dictionary.md` (markdown table), log "would commit" ra console, return `{ yamlPreview, markdownPreview, slug }`. KHÔNG git push, KHÔNG move R2 object. Set `export const maxDuration = 30`.

## Group 4 — Frontend wizard

> **Style guide**: tất cả components dùng `hf-*` tokens từ `src/app/globals.css` (xem requirements.md decision "Frontend style: HF clone tokens"). Density compact `text-[13px]`, border-not-shadow, accent `hf-yellow`. AI-proposed sections distinguish bằng `border-l-2 border-hf-yellow bg-hf-yellow-50/30 pl-3`. Fonts Source Sans 3 + IBM Plex Mono (đã wire trong layout).

17. **Archive `src/app/upload/page.tsx` cũ**: move sang `src/_archive/upload-page-f0.tsx` (F0 PostgreSQL style, không dùng `hf-*` tokens). Tạo `src/app/upload/page.tsx` mới — thin wrapper render `<UploadWizard />` trong layout có breadcrumb + heading "Upload Dataset" (`text-hf-text` heading, `text-hf-text-faint` subtitle). Mark `"use client"`.
18. **`src/components/upload/UploadWizard.tsx`**: state machine 4 bước với progress bar ngang (4 dots, dot active fill `hf-yellow`, dot done fill `hf-green`, dot pending `hf-border`). State: `{ step: 1|2|3|4, fileId, r2Key, filename, proposal, metadata, dictionary, commitPreview }`. Step transitions: 1→2 (PUT R2 OK), 2→3 (/analyze OK), 3→4 (user click "Preview commit"), 4 reset ("Upload another"). Layout `max-w-[1280px] mx-auto p-6`. Vietnamese labels.
19. **`src/components/upload/UploadDropzone.tsx`**: drag-drop zone + click-to-select. Container `border-2 border-dashed border-hf-border-strong rounded-md py-12 text-center hover:border-hf-yellow hover:bg-hf-yellow-50/30 transition`. Accept `.csv, .xlsx`. Validate size ≤ 100MB client-side → error `text-hf-red text-sm`. On file select: call `/api/upload/presign` → PUT file to presigned URL → onDone callback truyền `{ fileId, r2Key, filename }`. Error states: presign fail, PUT fail, network error.
20. **`src/components/upload/AIAnalyzingLoader.tsx`**: spinner (CSS spin) + progress text rotation "Đang tải file từ R2...", "Đang phân tích cấu trúc...", "Đang gọi AI...", "Đang tạo đề xuất...". Container `bg-hf-bg-subtle border border-hf-border rounded-md p-8 text-center`. Auto-call `/api/upload/analyze` khi mount → onDone callback truyền proposal.
21. **`src/components/upload/MetadataEditor.tsx`**: form `bg-hf-bg border border-hf-border rounded-md p-5 space-y-4`. Heading "Metadata" + AI badge `bg-hf-yellow-50 text-yellow-800 text-xs px-2 py-px rounded-full`. Fields: title (text input), description (textarea), category (select hardcoded: kinh-te, dan-so, giao-duc, y-te, moi-truong, khac), tags (multi-select từ `getTags()` — chip-style `bg-hf-bg-muted px-2 py-px rounded-full text-xs`), source (text), source_url (url), confidence (display-only badge: high=`bg-blue-100 text-blue-800`, medium=`bg-yellow-100 text-yellow-800`, low=`bg-red-100 text-red-800`). Inputs `border border-hf-border rounded-md focus:border-hf-yellow focus:ring-2 focus:ring-hf-yellow-50 text-sm py-2 px-3`. Validation: title + description required.
22. **`src/components/upload/DictionaryEditor.tsx`**: table `w-full text-sm`. Header row `bg-hf-bg-muted text-hf-text-muted text-xs uppercase`. Rows: column (text), type (select string/number/date/boolean/category), unit (text), description (text). Edit inline (`<input>` `border border-transparent hover:border-hf-border focus:border-hf-yellow`). Add row button `text-hf-link text-sm hover:underline`. Remove row icon button `text-hf-text-faint hover:text-hf-red`. Wrap container `border border-hf-border rounded-md overflow-hidden` + AI badge heading như MetadataEditor.
23. **`src/components/upload/CommitPreview.tsx`**: 2 tabs/panes side-by-side `grid grid-cols-2 gap-4`. Tab 1 "metadata.yaml" — render `<pre>` `font-mono text-[13px] bg-hf-bg-muted p-4 rounded-md overflow-auto max-h-[600px]`. Tab 2 "dictionary.md" — render markdown qua `react-markdown` (đã có dep) với wrapper `prose prose-sm max-w-none`. Trên cùng banner thông báo `bg-hf-yellow-50 border border-hf-yellow/30 text-hf-text px-4 py-3 rounded-md` — "Đây là bản preview. Metadata chưa được commit vào git (sẽ có trong build chunk sau)." Nút "Upload another" `bg-hf-text text-white px-4 py-2 rounded-md hover:bg-hf-text-muted`.

## Group 5 — Verify

24. **`npm run typecheck`** (hoặc `npx tsc --noEmit`) — phải exit 0 không lỗi type.
25. **`npm run dev`** — server chạy không lỗi tại `http://localhost:3000/upload`.
26. **Test CSV upload**: drag file `data/tphcm_wards.json`... wait — CSV file nhỏ (vd: `data/scripts/sample.csv` hoặc tạo file test `grdp_test.csv` 5 rows × 4 cols). Verify wizard chạy 4 bước end-to-end: drop → AI analyzing (~5-10s) → review proposal → preview YAML + MD.
27. **Test XLSX upload**: tạo file test `grdp_test.xlsx` 1 sheet ~10 rows. Verify cùng flow.
28. **Verify R2 object**: check Cloudflare R2 dashboard → bucket `vnexpress-data` → `staging/` prefix có object với fileId UUID.
29. **Verify AI proposal chất lượng**: mở browser DevTools Network tab → check `/api/upload/analyze` response có đủ fields: `proposal.metadata.{title, description, category, tags, source, source_url, confidence}` + `proposal.dictionary[]` + `proposal.questions[]`. Nếu thiếu field → debug system prompt.
30. **Verify tags load từ DB**: mở wizard → Bước 3 → tags multi-select dropdown hiển thị danh sách tags thật từ PostgreSQL (kiểm tra Network tab `/upload` page load không có lỗi Supabase).
31. **Verify preview-only commit**: Bước 4 → click "Upload another" → reset wizard. Check console log có "would commit: ..." entry (không có git push thực tế).
