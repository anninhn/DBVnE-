# Phase 1 Validation — Article Linking

## Definition of Done
All must be true before this branch is merged.

### 1. Code quality

```bash
npm run typecheck
```
Must exit 0. Không có TypeScript error.

```bash
npm run build
```
Must success. Next.js 16 strict mode pass (catch proxy.ts export issues per memory).

### 2. Dependencies

- `cheerio` + `@types/cheerio` in `package.json` dependencies
- `npm install` chạy clean (no peer dep warnings mới)

### 3. App runs

```bash
npm run dev
```

- `/datasets/<existing-slug>` load không error
- Tab "Bài báo" hiển thị ở vị trí tab cũ "Community"
- Empty state text đúng: "Chưa có bài báo liên kết. Thêm bài viết đã publish dùng dataset này."

### 4. Core functionality — Add article

Manual test trên 1 dataset có sẵn (vd: `thong-tin-34-tinhthanh-pho`):

| Step | Expected |
|------|----------|
| Click "Liên kết bài báo" | Form inline expand (không modal) |
| Paste `https://vnexpress.net/<real-article-url>` + click "Fetch" | GET `/api/dataset/articles/og?url=...` trả 200, form prefill title/author/section/date/thumbnail |
| Edit title → click "Liên kết" | POST `/api/dataset/articles` trả 200 với commitSha |
| Card mới xuất hiện trong list | Local state update ngay, không cần refresh |
| Refresh page | Card vẫn còn (YAML đã commit) |

### 5. Core functionality — Display

- Card hiển thị: thumbnail (nếu có), title (click → mở vnexpress.net tab mới), byline `author • section • dd/mm/yyyy`, "Thêm bởi <user> • dd/mm/yyyy, hh:mm"
- URL hiển thị truncated với ellipsis, hover show full (title attribute)
- Multiple cards xếp grid responsive (1 col mobile, 2-3 col desktop)

### 6. URL validation

| Input | Expected |
|-------|----------|
| `https://google.com` | 400 "Chỉ chấp nhận URL từ vnexpress.net" |
| `not-a-url` | 400 "URL không hợp lệ" |
| `vnexpress.net/article-xyz` (không scheme) | OK — auto-add `https://` |
| `https://video.vnexpress.net/...` (subdomain) | OK — accepted |
| `https://vnexpress.net/...` redirect ra `facebook.com` | 400 "Redirect ra ngoài vnexpress.net" |

### 7. Edge cases — OG fetch

| Case | Expected |
|------|----------|
| VNExpress URL 404 (bài gỡ) | 502 error, form vẫn cho manual nhập |
| OG fetch timeout (>8s) | 504 "Trang phản hồi chậm — thử lại" |
| Page không có `og:title` | 422 "Thiếu og:title — không phải bài báo hợp lệ", form cho manual nhập |
| Network error GitHub commit | 500, client show error, giữ form state để retry |

### 8. Duplicate URL

- Add cùng URL 2 lần → POST trả 409 Conflict
- Error UI: "URL này đã được liên kết."
- So sánh canonical: `new URL(raw).toString()` normalize (trailing slash, case)

### 9. Auth gate

```bash
# Without login
curl -X POST http://localhost:3000/api/dataset/articles \
  -H "Content-Type: application/json" \
  -d '{"slug":"test","article":{"url":"https://vnexpress.net/x","title":"x"}}'
```
Must return 401.

- Tab "Bài báo" trên page vẫn render read-only (initialArticles từ server)
- Nút "Liên kết bài báo" ẩn nếu user chưa login (check `useSession` client-side) HOẶC submit fail với redirect /login (giống edit pattern)

### 10. Edit metadata regression (CRITICAL)

| Step | Expected |
|------|----------|
| Add 1 article vào dataset X | Tab "Bài báo" hiển thị card |
| Vào `/datasets/X/edit` | Edit form load bình thường |
| Sửa title → save | Commit thành công |
| Verify metadata.yaml mới trong git | `articles:` section vẫn còn |
| Tab "Bài báo" sau edit | Card vẫn hiển thị |

**Nếu test này fail → data loss regression, phải fix `renderMetadataYaml()` trước merge.**

### 11. Audit trail

Sau add article, vào MetadataSidebar (tab "Dataset card") → "Hoạt động":
- Entry mới có summary `"Thêm bài báo: <title truncated>"`
- `last_edited_by` = user đã add
- `last_edited_at` = timestamp hiện tại (format `dd/mm/yyyy, hh:mm` VN timezone)

### 12. Homepage badge

- Dataset có articles.length > 0 → DatasetCard trên `/` hiển thị "N bài báo" badge
- Dataset không có articles → không hiển thị badge (không "0 bài báo")

### 13. Git commit message convention

Commit cuối cùng trên branch phải rõ ràng, ví dụ:
```
Add article linking feature (tab "Bài báo" + OG fetch + audit)

- Replace Community tab placeholder với ArticlesTab
- Auto-fetch OG tags từ vnexpress.net URL (cheerio)
- Articles[] stored trong metadata.yaml, audit qua edits[]
- Homepage badge "N bài báo" cho discoverability
- Fix renderMetadataYaml để giữ articles khi edit metadata
```

## Not Required

- ❌ Edit/delete article UI — out of scope MVP (re-add để fix)
- ❌ Automated tests — codebase chưa có test setup, manual verify đủ
- ❌ Browser rendering cross-browser — Chrome/Edge OK
- ❌ Mobile responsive pixel-perfect — basic responsive đủ
- ❌ Performance benchmark — feature thấp traffic, không cần measure latency
- ❌ i18n — Vietnamese-only per CLAUDE.md
- ❌ Reverse lookup (article → datasets) — Phase 2 territory
