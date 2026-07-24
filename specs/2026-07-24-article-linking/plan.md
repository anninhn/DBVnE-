# Phase 1 Plan — Article Linking

## Group 1 — Types + Storage Foundation

1. **Cài đặt cheerio dependency**
   - `npm install cheerio @types/cheerio` (~50KB, user approved)
   - Verify vào `package.json`

2. **Tạo `src/lib/articles/types.ts`** — định nghĩa `ArticleEntry` interface (url, title, author?, published_at?, section?, thumbnail?, added_at, added_by)

3. **Update `src/lib/datasets/types.ts`** — add `articles?: ArticleEntry[]` vào `MetadataYaml` interface (duplicate type tại đây theo convention ColumnStats — tránh circular import)

4. **Update `src/lib/types/dataset.ts`** — add `ArticleEntry` interface (duplicate) + `articles?: ArticleEntry[]` vào `Dataset` runtime type

5. **Update `src/lib/datasets/read.ts`** — add `articles: meta.articles` vào return object của `metadataToDataset()` (sau line 249)

6. **Update `src/lib/dataset-render.ts`** — thêm `articles?: ArticleEntry[]` vào options của `renderMetadataYaml()`. Render section `articles:` cuối YAML trước `files:` block. Format mirror `files[]` (indent 2, dash list, double-quoted strings)

7. **Update `src/components/dataset/EditDatasetForm.tsx`** — line 112-125, truyền `articles: initialMetadata.articles` vào options của `renderMetadataYaml()`. **CRITICAL — nếu không fix, edit metadata sẽ mất articles**

## Group 2 — OG Fetch Helper

8. **Tạo `src/lib/articles/og-fetch.ts`** — server-only helper:
   - `assertVnexpressUrl(raw: string): URL` — validate hostname `endsWith("vnexpress.net")`, auto-add `https://` nếu thiếu scheme
   - `fetchOgMeta(url: URL): Promise<FetchedOgMeta>` — fetch HTML với User-Agent custom + `AbortSignal.timeout(8000)`, parse với cheerio: `og:title`, `og:image`, `article:author` (fallback byline regex), `article:published_time`, `article:section`
   - Check `res.url` hostname sau redirect không ra ngoài vnexpress.net
   - Throw Error nếu thiếu `og:title`

## Group 3 — API Routes

9. **Tạo `src/app/api/dataset/articles/og/route.ts`** — GET endpoint:
   - Query param `?url=...`
   - `requireUserOr401()` — auth gate (tránh abuse làm proxy)
   - `assertVnexpressUrl()` → 400 if invalid
   - `fetchOgMeta()` → 200 với OG tags, hoặc 502/504/422 tùy error
   - Response shape: `{ url, title, author?, published_at?, section?, thumbnail? }`

10. **Tạo helper `commitMetadataYamlOnly(slug, yamlText, commitMsg)`** trong `src/lib/git/commit.ts` — chỉ commit metadata.yaml, không đụng dictionary.md. Dùng `commitFiles()` wrapper với 1 file.

11. **Tạo `src/app/api/dataset/articles/route.ts`** — POST endpoint:
    - Body: `{ slug, article: { url, title, author?, published_at?, section?, thumbnail? } }`
    - `requireUserOr401()` — auth gate
    - Validate `article.url` + re-run `assertVnexpressUrl()` server-side
    - `getMetadataYamlRaw(slug)` — 404 nếu dataset không tồn tại
    - Parse YAML → check `articles[]` existing → 409 if URL duplicate (canonical compare)
    - Append entry với `added_at = new Date().toISOString()`, `added_by = user.username`
    - Stringify → `injectEdited(yamlText, user.username, "Thêm bài báo: <title>")` cho audit
    - `commitMetadataYamlOnly(slug, yamlText, commitMsg)` — atomic commit
    - Response: `{ success, slug, commitSha, commitUrl, message }`

## Group 4 — UI Components

12. **Tạo `src/app/datasets/[slug]/ArticlesTab.tsx`** — client component:
    - Props: `{ slug: string; initialArticles: ArticleEntry[] }`
    - State: `articles`, `showForm`, `error`, `submitting`, `ogFetching`
    - Sub-components (cùng file): `ArticleCard`, `ArticleAddForm`
    - ArticleCard: thumbnail 80×80 (object-cover), title link target=_blank, byline line, "Thêm bởi" line, URL truncated
    - ArticleAddForm: URL input + "Fetch" button → GET `/api/dataset/articles/og` → prefill fields → user edit → submit POST `/api/dataset/articles`
    - Error UI: red-bordered box "Lỗi:" + nút Đóng (UploadWizard pattern)

13. **Update `src/app/datasets/[slug]/page.tsx`** — replace Community tab:
    - Line 10: add `import ArticlesTab from "./ArticlesTab"`
    - Line 110-117: rename tab `{ key: "community", label: "Community" }` → `{ key: "articles", label: "Bài báo" }`
    - Line 167-170: replace placeholder div với `<ArticlesTab slug={slug} initialArticles={dataset.articles ?? []} />`

14. **Update `src/components/DatasetCard.tsx`** (or wherever card renders in homepage) — add badge "N bài báo" khi `articles?.length > 0`. Style: pill gray, dưới tags row hoặc cạnh downloads count.

## Group 5 — Verify

15. **Typecheck**: `npm run typecheck` — phải exit 0 (hoặc `npx tsc --noEmit` nếu không có script)

16. **Build check**: `npm run build` — phải success (catch Next.js 16 proxy export issues per memory `feedback_nextjs16_proxy_export.md`)

17. **Dev server smoke test**: `npm run dev` → vào `/datasets/<existing-slug>`:
    - Tab "Bài báo" hiển thị
    - Empty state đúng
    - Click "Liên kết bài báo" → form mở
    - Paste URL vnexpress.net thật → OG fetch prefill works
    - Submit → card mới xuất hiện + persisted sau refresh
    - Git repo có section `articles:` trong metadata.yaml

18. **Edge cases verify**:
    - URL không phải vnexpress.net → error "Chỉ chấp nhận URL từ vnexpress.net"
    - URL sai format → error "URL không hợp lệ"
    - URL thiếu `https://` → auto-add works
    - Duplicate URL → 409 error
    - OG fetch timeout → error thân thiện, form vẫn cho manual edit
    - User chưa login → nút "Liên kết bài báo" ẩn hoặc form submit fail với redirect /login

19. **Edit metadata regression test**:
    - Add 1 article
    - Vào `/datasets/<slug>/edit` → sửa title → save
    - Verify `articles:` vẫn còn trong YAML commit mới
    - Tab "Bài báo" vẫn hiển thị card

20. **Audit trail verify**:
    - Sau add article, vào MetadataSidebar "Hoạt động"
    - Entry mới: "Edit bởi <user> • <timestamp> • Thêm bài báo: <title>"

21. **Homepage badge verify**:
    - Dataset có articles → DatasetCard hiển thị "N bài báo" badge
    - Dataset không có articles → không hiển thị badge

## Implementation Notes

### Critical files (must read before coding)
- `src/app/api/dataset/edit/route.ts` — pattern template cho POST mutation
- `src/lib/datasets/read.ts:35-55` — `fetchRaw()` GitHub Contents API helper
- `src/lib/git/commit.ts:56-127` — `commitFiles()` atomic commit wrapper
- `src/lib/auth/inject-actor.ts` — `injectEdited()` audit function
- `src/lib/dataset-render.ts:100-212` — `renderMetadataYaml()` signature cần extend
- `src/app/datasets/[slug]/page.tsx:110-117,167-170` — Community tab cần replace

### Files to create (new)
- `src/lib/articles/types.ts`
- `src/lib/articles/og-fetch.ts`
- `src/app/api/dataset/articles/og/route.ts`
- `src/app/api/dataset/articles/route.ts`
- `src/app/datasets/[slug]/ArticlesTab.tsx`

### Files to modify (existing)
- `package.json` (cheerio dep)
- `src/lib/datasets/types.ts`
- `src/lib/types/dataset.ts`
- `src/lib/datasets/read.ts`
- `src/lib/dataset-render.ts`
- `src/lib/git/commit.ts` (new helper)
- `src/components/dataset/EditDatasetForm.tsx`
- `src/app/datasets/[slug]/page.tsx`
- `src/components/DatasetCard.tsx` (homepage badge)
