# Phase 1 Completion — Requirements

4 features độc lập để ship Phase 1 đầy đủ: Search adapter, Pagination listing, R2 file viewer, Edit/delete dataset.

## Scope

### Feature 1 — Search Adapter Foundation (forward-compatible)

**Phase 1 implementation**: `SimpleFilterAdapter` — filter mảng dataset đã load, metadata-only (title/slug/description/tags/category).

**Architecture (forward-compatible)**:
- `SearchAdapter` interface ở `src/lib/search/types.ts` — method `index()`, `search()`, field `capabilities`
- `SimpleFilterAdapter` class ở `src/lib/search/simple-filter.ts` — implement interface
- Factory `createSearchAdapter()` ở `src/lib/search/index.ts` — Phase sau đổi 1 dòng để swap adapter
- `SearchBox` presentational component ở `src/components/search/SearchBox.tsx` — chỉ input UI, nhận `query` + `onQueryChange` props
- `CatalogNav` client component ở `src/components/CatalogNav.tsx` — **extract từ server component page.tsx**, chứa top-nav HTML hiện tại (lines 14-36). Lý do: `<input>` tương tác không đặt được trong server component; nav cũng duplicate ở detail page (page.tsx:53-69) — consolidate.
- `query` state sống trong `DatasetExplorer` (đã có ở line 31), pass xuống `CatalogNav` + sidebar input qua prop. **Không dùng React Context** — over-engineering vì cả 2 input cùng trong cây `DatasetExplorer`, prop drilling đủ.

**Scoring** (recommend dataset phù hợp):
- Title match: 10 điểm
- Slug match: 5 điểm
- Tags match: 3 điểm (per tag)
- Description match: 2 điểm
- Category match: 2 điểm
- Sort results by score desc

**SearchBox placement**:
- Top-nav input (CatalogNav client component) — wire vào query state từ prop
- Sidebar input (DatasetExplorer:192) — giữ nguyên, cùng state (không cần sync vì dùng chung state từ DatasetExplorer)
- Filter (category/tags/sizes) giữ sidebar, không đổi

### Feature 2 — Pagination Listing

- Client-side pagination trong DatasetExplorer
- Page size 20 datasets (HF standard)
- Pagination UI: Previous / page numbers / Next (giống DatasetViewer.tsx:138-166)
- Reset page về 1 khi filter/search thay đổi

### Feature 3 — R2 File Viewer trong Detail

**Mục tiêu**: User xem detail → thấy nội dung file thực (không chỉ metadata table).

- Resource `file_url` map từ `r2_key` → `${process.env.R2_PUBLIC_BASE}/${r2_key}` trong `mapFilesToResources` (read.ts)
- Client component `R2FileViewer` ở `src/app/datasets/[slug]/R2FileViewer.tsx`
  - CSV: fetch → **native CSV parser** (`src/lib/parse/csv.ts`, ~30 dòng, handle quoted fields + embedded quotes + UTF-8 BOM) → render table (preview 100 rows + "Tải về để xem đầy đủ")
  - XLSX: fetch → `xlsx` package (đã có cho upload wizard) → render table (sheet đầu, 100 rows)
  - PDF: embed `<iframe src={file_url}>` (browser native PDF viewer)
  - MP3: `<audio controls src={file_url}>`
  - GeoJSON: defer (Phase sau, cần map library)
- Reuse histogram logic từ DatasetViewer hiện tại (extract ra `src/lib/viz/column-stats.ts` shared module)
- Loading state + error state (R2 unreachable, file corrupt, 0 files trong metadata)

### Feature 4 — Edit/Delete Dataset

**Edit flow** (metadata + dictionary only, không replace file):
- Component riêng `EditDatasetForm` ở `src/components/dataset/EditDatasetForm.tsx` (KHÔNG thêm mode prop vào UploadWizard — D5)
- 2 bước đơn giản: review prefilled → preview commit → commit
- Prefill metadata từ `getMetadataYaml(slug)` + dictionary từ `fetchRaw('datasets/<slug>/dictionary.md')`
- Dùng `MetadataEditor`, `DictionaryEditor`, `CommitPreview` (giữ nguyên, đã stateless presentational)
- Extract `commitMetadata()` function chung ở `src/lib/dataset-commit.ts` cho cả upload + edit
- Edit commit message: `Update dataset <slug>` (khác với upload `Upload dataset <slug>`)
- "Replace file" = out of scope (xem Out of Scope section)

**Delete flow** (hard delete, **dev-only** — D4 Option 3):
- Button "Xóa dataset" trên detail page **chỉ render khi `process.env.NODE_ENV !== 'production'`**
- Production (Vercel): KHÔNG có nút delete → admin muốn xóa phải dùng git CLI + R2 SDK manual
- Local dev click → modal "Gõ slug để xác nhận xóa" → input phải khớp `dataset.slug` → enable nút "Xóa vĩnh viễn"
- API `/api/dataset/delete`:
  - **Guard**: return 404 nếu `process.env.NODE_ENV === 'production'` — API chỉ hoạt động dev mode
  - Validate: `slug === confirmSlug` (backend check, không chỉ UI)
  - R2 `deleteObject(r2_key)` cho mỗi file trong metadata.yaml `files[]` — cần thêm helper `deleteObject` trong `src/lib/r2/`
  - Git delete `datasets/<slug>/metadata.yaml` + `dictionary.md` qua Octokit (commit với tree items có `sha: <existingFileSha>` để mark delete)
  - **Order quan trọng**: git commit delete TRƯỚC, R2 delete SAU. Nếu R2 delete fail → metadata đã khỏi git, R2 có orphaned object nhưng không phá UX (dataset không còn trong catalog). Reverse order (R2 first) = metadata vẫn tham chiếu dead R2 key.
  - Redirect về `/`

## Out of Scope

- **FlexsearchAdapter / PagefindAdapter** — chỉ tạo interface + SimpleFilter, adapter nâng cao là spec riêng Phase sau
- **Search dictionary content** (column names trong data_dictionary) — defer (SimpleFilterAdapter capabilities.dictionary = false, Phase sau enable khi dùng Flexsearch)
- **GeoJSON file viewer** — cần Leaflet/MapLibre, defer
- **File replacement** (re-upload file đè R2 object hiện có) — **GAP ĐÃ BIẾT**: data journalist sẽ gặp use case sửa typo trong CSV data (không phải metadata). Workaround hiện tại: delete dataset + upload lại (mất slug history, tốn AI analyze call lại). Đề xuất spec riêng `2026-07-1X-replace-file` cho use case này (presign PUT vào R2 key mới + update metadata.yaml `files[].sha256` + commit overwrite)
- **Soft delete / restore UI** — chọn hard delete dev-only (D4). Production không có nút xóa.
- **R2 cleanup mechanism** (orphaned objects) — defer. Phase 1 không generate orphaned vì delete là dev-only và order git-rm-first đảm bảo metadata clean.
- **Search analytics** (log queries cho demand discovery Phase 2) — defer
- **Mobile responsive** — internal tool, desktop first
- **Auth/permission cho edit/delete** — Phase 1 internal tool, không lock. Delete API dùng NODE_ENV guard thay vì auth.
- **papaparse dependency** — chọn native CSV parser (D6)

## Decisions

### D1 — Forward-compatible search qua Adapter Pattern

**Quyết định**: Tách search logic ra `SearchAdapter` interface + adapter implementation, không nhồi filter inline trong `DatasetExplorer`. **Không dùng React Context** — `query` state sống trong `DatasetExplorer`, pass xuống `CatalogNav` + sidebar input qua prop.

**Why**: Tránh refactor lớn khi catalog lớn và cần FlexSearch/Pagefind. UI chỉ gọi `adapter.search(query)`. Context over-engineering vì cả 2 input cùng trong cây `DatasetExplorer`, prop drilling đủ.

**Trade-off chấp nhận**: Layer abstraction nhỏ (1 interface + 1 class + factory) cho SimpleFilterAdapter hiện tại. Overhead minimal, không phải over-engineering vì đã có roadmap rõ ràng upgrade search Phase 2+.

### D2 — Resource file_url = public R2 URL, không proxy server

**Quyết định**: Map `r2_key` → `${R2_PUBLIC_BASE}/${r2_key}` trực tiếp. Browser fetch R2 public, không qua Vercel server.

**Why**:
- Đã config R2 bucket public + CORS cho vercel.app + localhost (xem memory `reference_external_dashboards.md`)
- Server proxy over-engineering cho Phase 1 — tốn Vercel bandwidth, thêm 1 hop không cần
- Files không sensitive (internal newsroom data)

**Trade-off**: URL public = ai có link download được. Phase 1 OK vì catalog public anyway. Phase sau nếu cần access control → thêm `/api/files/*` proxy.

**Validation note**: Verify `R2_PUBLIC_BASE` set trong `.env.local` TRƯỚC khi test file viewer. Nếu missing → `buildFileUrl` throw rõ ràng.

### D3 — Edit = metadata/dictionary only, không replace file

**Quyết định**: Edit flow chỉ sửa metadata + dictionary. Replace file = out of scope (ghi nhận gap, đề xuất spec riêng).

**Why**:
- 90% use case edit là sửa title/description/tags/source — không cần re-upload file
- Replace file flow có complexity riêng (presign PUT + update sha256 + version_id handling) — tách spec riêng cho rõ

**Gap đã biết**: Data journalist sẽ gặp use case sửa typo trong CSV data. Workaround: delete + upload lại (mất slug history). Spec riêng `2026-07-1X-replace-file` sẽ cover.

### D4 — Hard delete, dev-only (Option 3)

**Quyết định**: Hard delete (R2 delete + git rm) nhưng **chỉ доступ ở local dev** — nút delete chỉ render khi `process.env.NODE_ENV !== 'production'`. Production Vercel không có nút delete. API endpoint cũng guard NODE_ENV.

**Why**:
- R2 Object Versioning chưa GA (per memory `feedback_r2_object_versioning.md`) → R2 `deleteObject` vĩnh viễn, không undo
- Git revert chỉ khôi phục metadata — file R2 mất thật → scenario nguy hiểm data loss (Ninh clean dataset 5h, click nhầm, mất file)
- Soft-delete + restore (Option 1) phức tạp quá cho Phase 1 internal tool
- Delayed cleanup (Option 2) cần cron job/cleanup mechanism chưa có
- **Dev-only** = zero risk trên prod, Ninh local dev vẫn test được flow, prod muốn xóa thì git CLI + R2 SDK manual (rare operation)

**Trade-off**: Không tiện cho user trên prod — nhưng delete dataset là rare operation (chỉ khi test artifact sai hoặc metadata duplicate), afford full dev cycle OK.

### D5 — EditDatasetForm riêng, KHÔNG thêm mode prop vào UploadWizard

**Quyết định**: Tạo `EditDatasetForm` component riêng (2 bước: review prefilled → preview commit → commit). Dùng chung `MetadataEditor`, `DictionaryEditor`, `CommitPreview`, và extract `commitMetadata()` function.

**Why** (đổi từ draft ban đầu):
- UploadWizard đã phức tạp (4 bước, 6 state pieces, conditional rendering). Thêm mode prop sẽ rải conditional khắp wizard — debug khó
- Edit flow đơn giản hơn rõ rệt (2 bước vs 4 bước, không drop file, không AI analyze) → tách component clean hơn
- Shared logic nằm ở cấp độ function (`commitMetadata()`) và sub-component (MetadataEditor/DictionaryEditor) — không phải cấp độ wizard

**Trade-off**: Một số code commit logic trùng (gọi commitMetadata, handle error) — chấp nhận vì rõ ràng hơn.

### D6 — Native CSV parser, không papaparse dependency

**Quyết định**: Viết CSV parser ~30 dòng trong `src/lib/parse/csv.ts`. Handle quoted fields (`"hello, world"`), embedded quotes (`""` escape), UTF-8 BOM. Không handle quoted newlines (rare cho statistical CSV).

**Why**:
- CLAUDE.md cấm dependency mới không approved
- 90% dataset VNExpress là clean CSV (GSO exports, Excel save-as) — native đủ
- Khi gặp edge case (user báo CSV không preview được) → upgrade papaparse, không phá interface (cùng signature `parseCSV(text) → string[][]`)

**Trade-off**: CSV có quoted newlines (notes dài với line breaks) sẽ fail → message "Preview không khả dụng, tải về để xem". Acceptable cho Phase 1.

### D7 — CatalogNav client component, extract từ server page.tsx

**Quyết định**: Trích xuất `<nav>` HTML hiện tại (page.tsx:14-36, duplicate ở detail page.tsx:53-69) thành `src/components/CatalogNav.tsx` client component. Nhận `query` + `onQueryChange` props.

**Why**:
- `<input type="text">` tương tác không đặt được trong server component (page.tsx hiện tại là server component)
- Nav duplicate ở listing + detail → DRY
- Là precondition cho D1 (top-nav input cần wire interaction)

## Context

**Tại sao spec này tồn tại**: Phase 1 production-ready commit `9fd7fd9` (2026-07-09) ship core upload wizard + dynamic SSR catalog. Còn 4 gap quan trọng (xem `project_phase1_production.md` memory): search, pagination, file viewer, edit/delete. Spec này đóng các gap đó → Phase 1 đầy đủ, sẵn sàng demand discovery (tracking) và Phase 2 planning.

**Constraint**:
- Branch `main` duy nhất (main-only workflow, không feature branch theo memory `project_phase1_production.md`)
- 4 features độc lập → có thể triển khai subagent song song (Agent tool với `isolation: "worktree"` để tránh conflict git)
- Tiếng Việt trong UI/comments
- Không thêm dependency mới — `xlsx` đã có cho upload wizard, native CSV parser thay papaparse (D6)

**Proves**:
- Phase 1 shippable đầy đủ cho Ninh upload/browse/preview/edit/delete dataset
- Architecture search forward-compatible → Phase 2 không refactor lớn
- File viewer: user xem được nội dung file trên R2 mà không phải download

## Stakeholder Notes

- **Ninh (Data Journalist)**: Cần R2 file viewer + edit/delete để quản lý dataset hàng ngày. Search scoring giúp recommend dataset phù hợp khi research đề tài mới.
- **Minh (Editor)**: Pagination cần khi catalog lớn dần. Search để tìm dataset cho editorial decision.
- **Hoa (Reporter)**: Phase 2 persona, không dùng trực tiếp feature Phase 1 này.
