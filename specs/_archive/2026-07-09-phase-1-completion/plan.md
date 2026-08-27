# Phase 1 Completion — Plan

4 groups độc lập, mỗi group triển khai subagent song song (worktree isolation để tránh git conflict). Group 5 verify chạy sau khi 4 group merge.

**Spec reference**: requirements.md decisions D1-D7, validation.md check groups.

## Group 1 — Search Adapter Foundation + CatalogNav

1. Tạo `src/lib/search/types.ts`:
   - `SearchQuery` interface: `{ text: string; filters?: { categories?: string[]; tags?: string[]; sizes?: string[] } }`
   - `SearchResult` interface: `{ dataset: Dataset; score: number; matchedFields: string[] }`
   - `SearchCapabilities` type: `{ fullText: boolean; dictionary: boolean; fuzzy: boolean }`
   - `SearchAdapter` interface: `{ index(datasets: Dataset[]): void; search(query: SearchQuery): SearchResult[]; capabilities: SearchCapabilities }`

2. Tạo `src/lib/search/simple-filter.ts`:
   - `SimpleFilterAdapter` class implements `SearchAdapter`
   - `capabilities = { fullText: true, dictionary: false, fuzzy: false }`
   - `index(datasets)`: lưu vào private field `this.datasets`
   - `search({ text, filters })`: filter (matchesFilters) + score (scoreMatch) + sort desc
   - `scoreMatch(d, q)`: title 10 / slug 5 / tags 3 (per tag) / desc 2 / category 2
   - `findMatchedFields(d, q)`: return array field names match
   - `matchesFilters(d, filters)`: AND logic cho category/tags/sizes

3. Tạo `src/lib/search/index.ts`:
   - Export `createSearchAdapter()` factory → `return new SimpleFilterAdapter()`
   - Comment JSDoc: "Phase sau đổi return new FlexsearchAdapter()"

4. Tạo `src/components/search/SearchBox.tsx`:
   - Props: `{ query: string; onQueryChange: (q: string) => void; placeholder?: string }`
   - Controlled input với search icon SVG, dùng `hf-*` tokens (giữ pattern từ DatasetExplorer.tsx:184-198)
   - Pure presentational — không có state, không có filter logic

5. Tạo `src/components/CatalogNav.tsx` (client component, `"use client"`):
   - Extract `<nav>` HTML từ `src/app/page.tsx:14-36` (hiện đang trong server component)
   - Props: `{ query: string; onQueryChange: (q: string) => void }`
   - Render `<SearchBox query={query} onQueryChange={onQueryChange} placeholder="Search VNExpress data…" />` trong nav
   - Link "Datasets" tới `/`, link "+ Upload dataset" tới `/upload`
   - Sẽ reuse ở detail page sau (Group 4 task 20)

6. Refactor `src/components/DatasetExplorer.tsx`:
   - Lift query state (đã có ở line 31) — giữ trong DatasetExplorer
   - Bỏ inline `<input>` sidebar hiện tại (line 184-198) → thay `<SearchBox query={query} onQueryChange={setQuery} placeholder="Search datasets…" />`
   - Bỏ inline `useMemo` filter (line 52-94) → thay bằng adapter call:
     ```typescript
     const adapter = useMemo(() => createSearchAdapter(), []);
     useEffect(() => { adapter.index(datasets); }, [datasets, adapter]);
     const results = useMemo(() => adapter.search({ text: query, filters: { categories, tags, sizes } }), [adapter, query, ...]);
     ```

7. Update `src/app/page.tsx`:
   - Bỏ `<nav>` HTML lines 14-36 khỏi server component
   - Wrap `<DatasetExplorer>` trong layout có `<CatalogNav>` — hoặc DatasetExplorer render `<CatalogNav>` ở top + sidebar filter bên dưới
   - Pass query state từ DatasetExplorer xuống CatalogNav (lifted state, prop drilling — không Context)

## Group 2 — Pagination Listing

8. Trong `src/components/DatasetExplorer.tsx`:
   - Add state `page: number`, const `PAGE_SIZE = 20`
   - Slice results từ adapter.search(): `paginatedResults = results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)`
   - Render pagination UI: reuse pattern từ `DatasetViewer.tsx:138-166` (Previous / page numbers / Next)
   - useEffect reset `page = 0` khi query/filters/sort thay đổi (dependency array)

9. Render metadata line phía trên table: `"Hiển thị ${start+1}–${end} trong ${total} datasets"` (HF style)

## Group 3 — R2 File Viewer trong Detail

10. Verify `R2_PUBLIC_BASE` env đã set trong `.env.local`. Nếu chưa → throw rõ ràng ở init, không fail silent.

11. Thêm helper `buildFileUrl(r2Key: string): string` trong `src/lib/r2/client.ts`:
    - Return `${process.env.R2_PUBLIC_BASE}/${r2Key}`
    - Throw Error với message rõ nếu env missing

12. Update `mapFilesToResources` trong `src/lib/datasets/read.ts` (line 107-126):
    - Set `file_url: buildFileUrl(f.r2_key ?? '')` cho mỗi resource (thay `file_url: undefined`)
    - Handle case `r2_key` missing → throw hoặc skip với console.warn

13. Extract column-stats logic từ `DatasetViewer.tsx` ra `src/lib/viz/column-stats.ts`:
    - Export: `numericStats(rows, colName)`, `histogramBins(rows, colName)`, `countDistinct(rows, colName)`, `categoricalSegments(rows, colName)`
    - Pure functions, no React deps
    - Update DatasetViewer.tsx import từ module mới (không phá existing functionality)

14. Tạo `src/lib/parse/csv.ts` (native parser, ~30 dòng):
    ```typescript
    export function parseCSV(text: string): string[][] {
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip UTF-8 BOM
      // State machine: inQuotes, field buffer, row buffer
      // Handle: quoted fields, embedded quotes (""), \r\n line endings
      // NOT handle: quoted newlines (rare, fail gracefully)
    }
    ```

15. Tạo `src/app/datasets/[slug]/R2FileViewer.tsx` (client component):
    - Props: `{ resource: Resource }`
    - Detect format từ `resource.file_type`
    - CSV: `fetch(resource.file_url)` → `parseCSV(text)` → state `rows: string[][]` → render table (preview first 100 rows + header)
    - XLSX: `fetch` → `XLSX.read(arrayBuffer)` → first sheet → `XLSX.utils.sheet_to_json()` → render
    - PDF: `<iframe src={resource.file_url} className="w-full h-[800px]" />`
    - MP3: `<audio controls src={resource.file_url} className="w-full" />`
    - GeoJSON/unknown: message "Preview không hỗ trợ format này. <a>Tải về</a>"
    - 0 files trong metadata: message "Dataset này chưa có file"
    - Loading state: spinner "Đang tải file từ R2…"
    - Error state (fetch fail, parse fail): "Không tải được file. <a href={file_url}>Tải về trực tiếp</a>"
    - Histogram cho numeric columns (reuse column-stats module)

16. Update Files tab trong `src/app/datasets/[slug]/page.tsx` (line 149-186):
    - Giữ metadata table như hiện tại
    - Add expandable row hoặc button "Xem trước" mỗi row → render `<R2FileViewer resource={r} />` inline (sử dụng `<details>` HTML element hoặc state toggle)

## Group 4 — Edit/Delete Dataset

17. Thêm helper `deleteObject(key: string): Promise<void>` trong `src/lib/r2/get.ts` (hoặc tạo `src/lib/r2/delete.ts`):
    - Dùng `DeleteObjectCommand` từ `@aws-sdk/client-s3`
    - Throw error rõ nếu R2 delete fail (để API handle)

18. Update `src/lib/git/commit.ts`:
    - Add function `deleteDatasetFiles(slug: string): Promise<CommitResult>`:
      - Lấy current tree → find `datasets/<slug>/metadata.yaml` + `datasets/<slug>/dictionary.md` SHA (qua `octokit.rest.repos.getContent`)
      - Create tree với items `{ path, mode: null, type: null, sha: fileSha }` để mark delete
      - Commit + push với message `Delete dataset <slug>`
    - Fix misleading comment trong `FileToCommit` interface (line 36-37): `mode` là Unix permission (`100644`), KHÔNG phải create/update semantic. Sửa comment.

19. Tạo `src/lib/dataset-commit.ts` (extract shared commit logic):
    - Function `commitMetadata({ slug, metadataYaml, dictionaryMarkdown, mode: "create" | "update" }): Promise<CommitResult>`
    - Wrap existing `commitMetadataFiles` từ git/commit.ts
    - Handle commit message khác theo mode: `Upload dataset <slug>` vs `Update dataset <slug>`
    - Cả UploadWizard + EditDatasetForm đều gọi function này

20. Tạo `src/components/dataset/EditDatasetForm.tsx` (client component):
    - Props: `{ initialSlug: string; initialMetadata: MetadataYaml; initialDictionary: DataDictionaryEntry[] }`
    - State: `metadata` (editable), `dictionary` (editable), `step: "review" | "preview"`
    - Step "review": render `<MetadataEditor>` + `<DictionaryEditor>` với initial values
    - Step "preview": render `<CommitPreview>` với YAML + markdown render từ current state
    - Submit: call `commitMetadata({ slug: initialSlug, ..., mode: "update" })`
    - On success: redirect tới `/datasets/${initialSlug}`
    - On error: show error message, giữ ở step "preview" để retry

21. Tạo `src/app/datasets/[slug]/edit/page.tsx` (server component):
    - Fetch metadata qua `getMetadataYaml(slug)` + dictionary qua `fetchRaw()`
    - 404 redirect nếu slug không tồn tại
    - Render header + `<EditDatasetForm initialSlug={slug} initialMetadata={meta} initialDictionary={dict} />`
    - Reuse `<CatalogNav>` từ Group 1 cho top nav (replace duplicate nav trong detail page.tsx)

22. Tạo `src/app/api/dataset/delete/route.ts`:
    - **NODE_ENV guard đầu tiên**: `if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: "Delete disabled in production" }, { status: 404 })`
    - POST body: `{ slug: string; confirmSlug: string }`
    - Validate: `slug !== confirmSlug` → 400 "Slug không khớp"
    - Fetch metadata.yaml → list `files[].r2_key`
    - **Order: git rm TRƯỚC, R2 delete SAU**:
      1. Call `deleteDatasetFiles(slug)` — git commit xóa metadata.yaml + dictionary.md
      2. For each file: `deleteObject(r2_key)` — R2 delete
      3. Nếu R2 delete fail: log error, KHÔNG rollback git (metadata đã clean là state đúng; orphaned R2 object acceptable)
    - Return `{ success: true, redirect: "/" }`

23. Tạo `src/components/dataset/DeleteDatasetButton.tsx` (client component):
    - Props: `{ slug: string }`
    - **Conditional render**: `if (process.env.NODE_ENV === 'production') return null` — không render gì trên prod
    - State: `modalOpen: boolean`, `confirmInput: string`
    - Button "Xóa dataset" (red text) → open modal
    - Modal: input `value={confirmInput}` placeholder `slug` → button "Xóa vĩnh viễn" disabled khi `confirmInput !== slug`
    - Submit: `fetch('/api/dataset/delete', { method: 'POST', body: JSON.stringify({ slug, confirmSlug: confirmInput }) })`
    - Success: `window.location.href = '/'`
    - Error: alert + giữ modal

24. Update `src/app/datasets/[slug]/page.tsx`:
    - Add Edit button: `<Link href={`/datasets/${slug}/edit`}>Edit metadata</Link>` trong header actions
    - Add Delete button: `<DeleteDatasetButton slug={slug} />` (component tự skip render trên prod)
    - Replace inline `<nav>` HTML (lines 53-69) bằng `<CatalogNav query="" onQueryChange={() => {}} />` từ Group 1 — hoặc giữ nav server-rendered và không có search input ở detail page (đơn giản hơn)
    - **Simpler choice**: Detail page KHÔNG có top search (user đã trong 1 dataset, search không cần). Bỏ search input khỏi detail nav, chỉ giữ logo + link về `/`.

25. Update `src/components/upload/UploadWizard.tsx`:
    - Refactor commit call (line 202-226 hiện tại) → dùng shared `commitMetadata()` từ `src/lib/dataset-commit.ts`
    - **Không thêm mode prop** (D5)

## Group 5 — Verify

26. Run `npx tsc --noEmit` — exit 0. Cover tất cả files mới/sửa.

27. Run `npm run dev` — server start tại `localhost:3000` không lỗi. Navigate `/` render listing không crash. Console browser không error đỏ.

28. Test Search + CatalogNav:
    - Navigate `/` — `<CatalogNav>` render top, search input có focus state
    - Type "grdp" → listing filter realtime qua adapter
    - Verify scoring: dataset "grdp-34-tinh-2024-e2e-test" có "grdp" trong title rank đầu (score 10)
    - Type "thu tuc" → filter lại, không có dataset match → empty state "Không tìm thấy"
    - Clear query → tất cả datasets hiện lại
    - Filter category + search text cùng lúc → AND logic

29. Test Pagination:
    - Tạm `PAGE_SIZE = 1` để test với 2 datasets → pagination UI hiện 2 pages
    - Click page 2 → listing show dataset thứ 2
    - Click Previous/Next → disabled ở boundaries
    - Type search query → page reset về 1
    - Restore `PAGE_SIZE = 20` sau test

30. Test R2 File Viewer:
    - Verify `R2_PUBLIC_BASE` trong `.env.local` (vd `https://pub-xxx.r2.dev`)
    - Navigate `/datasets/thu-tuc-hanh-chinh-theo-linh-vuc-va-co-quan-quan-ly`
    - Files tab → click "Xem trước" → R2FileViewer render
    - Verify loading state 1-3s, sau đó table render với 100 rows + histogram numeric columns
    - Network tab: request tới `${R2_PUBLIC_BASE}/<r2_key>`, status 200, content-type đúng
    - Test error state: tắt network → click "Xem trước" khác → error message + fallback download link
    - Test 0-files case: tạo dataset mock với metadata.yaml không có `files:` field → "Dataset này chưa có file"

31. Test Edit flow:
    - Navigate `/datasets/thu-tuc-hanh-chinh-theo-linh-vuc-va-co-quan-quan-ly/edit`
    - Verify EditDatasetForm render step "review" với MetadataEditor prefilled + DictionaryEditor prefilled
    - Edit title "Updated title" → click "Preview commit"
    - Verify step "preview" hiển thị YAML có:
      - `title: "Updated title"`
      - `slug: "thu-tuc-hanh-chinh-theo-linh-vuc-va-co-quan-quan-ly"` (giữ nguyên)
      - `files[0].r2_key` không đổi
    - Submit commit → redirect về `/datasets/<slug>` → title mới hiển thị
    - Git log: commit message "Update dataset <slug>"

32. Test Delete flow (dev-only):
    - Verify chạy ở `NODE_ENV=development` (npm run dev default)
    - Navigate `/datasets/grdp-34-tinh-2024-e2e-test`
    - Verify nút "Xóa dataset" hiển thị
    - Click → modal → type sai slug → button disabled
    - Type đúng slug → button enable
    - Click "Xóa vĩnh viễn" → loading → redirect `/`
    - Verify dataset không còn listing
    - R2 dashboard: object đã delete
    - Git log: commit "Delete dataset grdp-34-tinh-2024-e2e-test"
    - GitHub repo: folder `datasets/grdp-34-tinh-2024-e2e-test/` đã sạch

33. Test NODE_ENV guard:
    - Set `NODE_ENV=production` locally → `npm run build && npm start`
    - Navigate `/datasets/<slug>` → nút "Xóa dataset" KHÔNG hiển thị
    - Try `curl -X POST http://localhost:3000/api/dataset/delete -d '{"slug":"test","confirmSlug":"test"}'` → 404 "Delete disabled in production"

34. Test partial-failure states:
    - Edit commit fail: tắt network giữa commit → error message hiển thị, vẫn ở step preview, không redirect
    - Delete R2 fail: simulate bằng cách set `R2_SECRET_ACCESS_KEY` sai → API git rm commit OK, R2 delete throws → API log error, return success anyway (orphaned R2 object acceptable per D4), redirect `/`
    - Delete git fail: simulate GITHUB_TOKEN sai → API return 500, R2 objects untouched (order git-first)

35. Verify `commit.ts` FileToCommit comment fixed — `mode` field doc nói rõ là Unix permission `100644`, không phải create/update.
