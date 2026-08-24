# Phase 1 Completion — Validation

## Definition of Done

Tất cả phải đúng trước khi merge 4 group về `main`. Mỗi group có thể validate độc lập khi subagent hoàn thành.

### 0. Pre-flight — R2_PUBLIC_BASE env

Verify `R2_PUBLIC_BASE` set trong `.env.local`:
```bash
grep R2_PUBLIC_BASE .env.local
```
Phải trả URL dạng `https://pub-xxx.r2.dev` hoặc R2 custom domain. Nếu missing → `buildFileUrl()` throw runtime, mọi file viewer call fail. **Set trước khi test Group 3.**

### 1. TypeScript check

```bash
npx tsc --noEmit
```

Exit 0 — không lỗi. Cover:
- `src/lib/search/{types,simple-filter,index}.ts`
- `src/components/search/SearchBox.tsx`
- `src/components/CatalogNav.tsx`
- `src/lib/r2/{client,get,delete}.ts`
- `src/lib/viz/column-stats.ts`
- `src/lib/parse/csv.ts`
- `src/lib/dataset-commit.ts`
- `src/lib/git/commit.ts` (deleteDatasetFiles mới + comment fix)
- `src/app/api/dataset/delete/route.ts`
- `src/app/datasets/[slug]/{page,R2FileViewer,DeleteDatasetButton,edit/page}.tsx`
- `src/components/dataset/{EditDatasetForm,DeleteDatasetButton}.tsx`
- `src/components/DatasetExplorer.tsx` (refactor)
- `src/components/upload/UploadWizard.tsx` (refactor commit call)

### 2. Dev server chạy

```bash
npm run dev
```

Server start tại `http://localhost:3000` không lỗi. Navigate `/` render listing không crash. Console browser không error đỏ. Visual check: tất cả UI dùng `hf-*` tokens, density đồng nhất HF pattern.

### 3. Search adapter — scoring + CatalogNav

Manual test:

1. Navigate `/` — `<CatalogNav>` render top (logo + nav links + search input + Upload button)
2. Top-nav search input focus được, type "grdp" → listing filter realtime
3. Sidebar search input cũng hiển thị "grdp" (cùng state, không cần sync vì cùng DatasetExplorer owner)
4. Verify scoring: dataset "grdp-34-tinh-2024-e2e-test" có "grdp" trong title (score 10) rank đầu
5. Type "thu tuc" → chỉ match description/tags → dataset khác rank thấp hơn
6. Clear query → tất cả datasets hiện lại
7. Filter category + search text cùng lúc → AND logic
8. Type "xyznotexist" → empty state "Không tìm thấy dataset phù hợp" + clear filter button

Assert: Network tab không có request fail (search thuần client-side). Không console error.

### 4. Pagination

Manual test:
1. Tạm set `PAGE_SIZE = 1` trong DatasetExplorer → restart dev server
2. Navigate `/` → pagination UI hiện với 2 pages (2 datasets hiện tại)
3. Click page 2 → listing show dataset thứ 2
4. Click Previous → disabled khi page 1
5. Click Next → disabled khi page cuối
6. Type search query → page reset về 1 (useEffect dependency)
7. Verify "Hiển thị X–Y trong Z datasets" line phía trên table
8. Restore `PAGE_SIZE = 20` sau test

### 5. R2 file viewer

Manual test:
1. Verify `R2_PUBLIC_BASE` từ pre-flight step #0
2. Navigate `/datasets/thu-tuc-hanh-chinh-theo-linh-vuc-va-co-quan-quan-ly`
3. Click "Files and versions" tab
4. Verify metadata table render (filename, size, download link)
5. Click "Xem trước" trên row → R2FileViewer render inline
6. Loading state 1-3s
7. Table render với preview 100 rows + histogram cho numeric columns
8. Network tab: request URL dạng `${R2_PUBLIC_BASE}/<r2_key>`, status 200, content-type `text/csv` hoặc `application/vnd.ms-excel`
9. Test error state: tắt network (DevTools Offline) → click "Xem trước" khác → error message "Không tải được file" + fallback download link
10. Test 0-files case: tạo dataset mock với metadata.yaml không có `files:` field → detail page Files tab hiển thị "Dataset này chưa có file"
11. Test PDF/MP3 format (nếu có dataset mẫu): PDF render `<iframe>`, MP3 render `<audio controls>`

### 6. Edit flow

Manual test:
1. Navigate `/datasets/thu-tuc-hanh-chinh-theo-linh-vuc-va-co-quan-quan-ly/edit`
2. Verify EditDatasetForm render step "review"
3. MetadataEditor prefill: title, description, category, tags, source, source_url
4. DictionaryEditor prefill: rows từ dictionary.md hiện tại
5. Edit title "Updated title" → click "Preview commit"
6. Step "preview" hiển thị:
   - YAML có `title: "Updated title"`, `slug: "thu-tuc-hanh-chinh-theo-linh-vuc-va-co-quan-quan-ly"` (giữ), `files[0].r2_key` không đổi
   - Markdown preview dictionary
7. Submit → redirect `/datasets/<slug>` → title mới hiển thị
8. Git log: commit "Update dataset thu-tuc-hanh-chinh-..."
9. Verify UploadWizard vẫn hoạt động (refactor commitMetadata không phá create flow)

### 7. Delete flow (dev-only)

Manual test:
1. Verify `NODE_ENV=development` (npm run dev default)
2. Navigate `/datasets/grdp-34-tinh-2024-e2e-test` (test artifact có thể xóa)
3. Nút "Xóa dataset" hiển thị trong detail header
4. Click → modal mở "Gõ slug để xác nhận xóa"
5. Type sai slug → button "Xóa vĩnh viễn" disabled
6. Type đúng `grdp-34-tinh-2024-e2e-test` → button enable (red bg)
7. Click "Xóa vĩnh viễn" → loading state
8. Response redirect về `/`
9. Dataset không còn trong listing
10. R2 dashboard: object `<fileId>/<filename>` đã delete
11. Git log: commit "Delete dataset grdp-34-tinh-2024-e2e-test"
12. GitHub repo: folder `datasets/grdp-34-tinh-2024-e2e-test/` không còn

### 8. NODE_ENV guard verification

1. Build production mode: `NODE_ENV=production npm run build && npm start`
2. Navigate `/datasets/<slug>` → nút "Xóa dataset" KHÔNG hiển thị (DeleteDatasetButton return null)
3. Try bypass UI:
   ```bash
   curl -X POST http://localhost:3000/api/dataset/delete \
     -H "Content-Type: application/json" \
     -d '{"slug":"test","confirmSlug":"test"}'
   ```
   → Return 404 "Delete disabled in production"
4. Restore `NODE_ENV=development`

### 9. Partial-failure states

**Edit commit fail** (network giữa commit):
- Simulate: tắt network trong DevTools trước click Submit
- Expected: error message hiển thị trong step preview, không redirect, form giữ state để retry

**Delete git fail** (GITHUB_TOKEN sai):
- Simulate: set `GITHUB_TOKEN=invalid` trong .env.local → restart dev → try delete
- Expected: API return 500, error message rõ, **R2 objects untouched** (order: git-rm-first verified)

**Delete R2 fail** (R2 credentials sai):
- Simulate: set `R2_SECRET_ACCESS_KEY=invalid` → try delete
- Expected: API git commit OK → R2 delete throws → log error → return success (orphaned R2 object accepted per D4 trade-off) → redirect `/`
- Verify dataset không còn trong listing (git rm thành công)

### 10. Decision verification — forward-compatible search (D1)

- `src/lib/search/types.ts` export `SearchAdapter` interface với `index`, `search`, `capabilities`
- `SimpleFilterAdapter` implements interface đầy đủ
- `createSearchAdapter()` factory trong `index.ts` — chỉ cần đổi 1 dòng để swap adapter Phase sau
- `DatasetExplorer` không có inline filter `useMemo` — chỉ gọi `adapter.search()`
- **Không có SearchContext.tsx** — query state trong DatasetExplorer, prop drilling xuống SearchBox/CatalogNav
- CatalogNav là client component (`"use client"` directive)

### 11. Decision verification — R2 public URL (D2)

- `buildFileUrl(r2Key)` return `${process.env.R2_PUBLIC_BASE}/${r2_key}` — không qua Vercel server
- Network tab verify request tới R2 domain, không phải Vercel domain
- Resource `file_url` field trong `mapFilesToResources` luôn set (không `undefined`)

### 12. Decision verification — edit metadata-only (D3)

- EditDatasetForm không gọi `/api/upload/presign` (skip R2 upload)
- Edit commit path identical với upload commit (`datasets/<slug>/metadata.yaml`) → GitHub overwrite
- `files[].r2_key` trong YAML sau edit = same key trước edit
- **Gap ghi nhận**: requirements.md Out of Scope section có entry rõ về "File replacement" với note đề xuất spec riêng

### 13. Decision verification — hard delete dev-only (D4)

- DeleteDatasetButton component return null khi `NODE_ENV === 'production'` (không render gì)
- `/api/dataset/delete` route return 404 khi `NODE_ENV === 'production'` (guard đầu function)
- API validate `slug === confirmSlug` ở backend (không chỉ UI)
- API order: `deleteDatasetFiles(slug)` (git) TRƯỚC, R2 `deleteObject` SAU
- Git commit delete cả `metadata.yaml` + `dictionary.md` (nếu tồn tại)

### 14. Decision verification — EditDatasetForm riêng (D5)

- **Không có mode prop** trong UploadWizard.tsx — wizard giữ nguyên structure 4 bước
- `EditDatasetForm` component riêng, 2 bước (review → preview commit)
- Shared `MetadataEditor`/`DictionaryEditor`/`CommitPreview` dùng trong cả 2 flow
- Shared `commitMetadata()` function trong `src/lib/dataset-commit.ts` — cả UploadWizard + EditDatasetForm đều gọi
- Commit message khác: upload `Upload dataset <slug>` vs edit `Update dataset <slug>`

### 15. Decision verification — native CSV parser (D6)

- `src/lib/parse/csv.ts` tồn tại, ~30 dòng
- Handle quoted fields: input `"hello, world"` → cell `hello, world` (comma trong quote không phải delimiter)
- Handle embedded quotes: input `"she said ""hi"""` → cell `she said "hi"`
- Handle UTF-8 BOM: input `\uFEFFhello,world` → strip BOM, cells `hello`, `world`
- Không có `papaparse` trong `package.json` dependencies

### 16. Decision verification — CatalogNav client component (D7)

- `src/components/CatalogNav.tsx` tồn tại, có `"use client"` directive
- `src/app/page.tsx` không còn inline `<nav>` HTML — render `<CatalogNav query={...} onQueryChange={...} />`
- `src/app/datasets/[slug]/page.tsx` không còn duplicate `<nav>` (hoặc dùng CatalogNav, hoặc bỏ top search input — chỉ giữ logo + link về `/`)

### 17. commit.ts comment fix

- `FileToCommit` interface `mode` field doc rõ: Unix permission `100644` (regular file), không phải create/update semantic
- `FileToCommit.type` field doc rõ: `"blob"` (default)

## Not Required

- **No automated tests** — manual test đủ Phase 1. Defer vitest/playwright cho Phase sau
- **No browser cross-browser test** — Chrome đủ
- **No mobile responsive** — internal tool, desktop first
- **No production deploy verification** — local dev OK. Defer Vercel verify cho khi user test thật
- **No GeoJSON viewer** — defer (cần Leaflet library)
- **No FlexsearchAdapter implementation** — chỉ interface + SimpleFilter
- **No file replacement** — out of scope (ghi nhận gap, spec riêng)
- **No search analytics logging** — defer Phase 2
- **No auth/permission check** — Phase 1 internal tool, delete dùng NODE_ENV guard
- **No undo/restore UI** — hard delete dev-only, git CLI revert là rollback cho metadata
- **No R2 orphan cleanup mechanism** — Phase 1 không generate orphaned thường xuyên (delete rare, dev-only)
- **No soft delete / trash folder** — D4 chọn dev-only hard delete
