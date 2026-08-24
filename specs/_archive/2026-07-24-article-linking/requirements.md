# Phase 1 Requirements — Article Linking

## Scope

Cho phép liên kết bài báo VNExpress (URL) vào dataset để hiển thị **provenance ngược** — "dataset này đã được dùng trong bài báo nào". Đây là Phase 1 enhancement (sau Phase 1 ship main 2026-07-09, bổ sung feature như downloads counter / search wire-up gần đây).

### Deliverables

1. **Tab "Bài báo" trên Dataset detail page** — thay thế placeholder "Community" hiện tại (clone từ HuggingFace)
   - Empty state: "Chưa có bài báo liên kết. Thêm bài viết đã publish dùng dataset này." + nút "Liên kết bài báo"
   - List state: card grid — thumbnail (OG image), title (click ra vnexpress.net), author • section • published_at, "Thêm bởi <user> • <timestamp>"
   - Inline add form (collapsed by default, expand on click — không modal vì codebase chưa có modal)

2. **Add article flow** với auto-prefill:
   - User paste URL vnexpress.net → server fetch OG tags → prefill form (title, author, section, published_at, thumbnail) → user có edit trước khi save
   - Submit → commit article mới vào `metadata.yaml` của dataset
   - Audit: append entry vào `edits[]` với summary `"Thêm bài báo: <title>"`

3. **Data model**:
   ```yaml
   articles:
     - url: https://vnexpress.net/...   # vnexpress.net URL (canonical, required)
       title: "..."                       # og:title hoặc user edit (required)
       author?: "..."                     # article:author hoặc byline
       published_at?: "2026-07-15"        # ISO date — article:published_time
       section?: "Thời sự"                # article:section
       thumbnail?: "https://..."          # og:image
       added_at: "2026-07-24T..."         # ISO datetime (auto)
       added_by: "ninh"                   # username (auto from session)
   ```

4. **Homepage badge**: DatasetCard hiển thị "N bài báo" khi `articles.length > 0` (cho discoverability — reader thấy dataset này đã được dùng)

5. **Multi-dataset per article**: Cùng 1 URL vnexpress.net có thể link từ nhiều datasets (không có global articles table — mỗi dataset giữ `articles[]` riêng). Ví dụ: bài investigative dùng 3 datasets → URL xuất hiện trong cả 3.

### Out of Scope

- ❌ Edit article đã link — defer (user re-add để fix sai sót)
- ❌ Delete article đã link — defer
- ❌ Reverse view (browse theo bài báo) — Phase 2 territory
- ❌ Auto-discovery (scrape vnexpress.net tìm mention dataset) — Phase 2/3
- ❌ Impact analytics (sort datasets theo số articles, leaderboard) — Phase 2+
- ❌ Comment/discussion (giữ tinh thần tab "Community" đã replace)
- ❌ Author profiling (phóng viên nào dùng dataset nhiều nhất)

## Decisions

### Display: Tab "Bài báo" thay "Community"
Thay placeholder "Community" (HF clone pattern, chưa bao giờ active) bằng "Bài báo". Label ngắn gọn theo yêu cầu user ("viết ngắn gọn lại hơn"). Vị trí: sau "Files and versions". Card grid với thumbnail + byline + timestamp provenance.

Lý do: Community/discussion không fit newsroom workflow — phóng viên cần track usage chứ không chat. Article linking là provenance thực sự.

### Auto-fetch OG metadata
User paste URL → server fetch OG tags → prefill form. User có edit tất cả fields trước save (fix sai số khi OG tag thiếu/sai). Implementation: server-side fetch với User-Agent custom + 8s timeout.

### URL scope: chỉ vnexpress.net
Validate hostname `endsWith("vnexpress.net")` — chấp nhận subdomain (vd: `video.vnexpress.net`). Reject redirect ra ngoài domain. Lý do: tòa soạn nội bộ, data dùng cho báo VNExpress. Đơn giản hóa fetch logic.

### Permission: mọi user đã login
Bất kỳ user đã authenticate (qua NextAuth v5 hiện có) đều có thể add article vào bất kỳ dataset nào. Audit qua `edits[]` + `last_edited_by`. Lý do: friction thấp cho collaboration cross-team; if abuse xảy ra, có thể restrict sau.

### OG parser: cheerio
User approve thêm dependency `cheerio` (~50KB) cho HTML parsing robust. Regex bị fragile với HTML structure thay đổi. Cheerio là standard cho task này, zero-config,TypesScript types có sẵn.

### Render fix (CRITICAL — Data integrity)
`renderMetadataYaml()` hiện tại build YAML từ scratch không có `articles` param. `EditDatasetForm` dùng function này → edit metadata sẽ **mất toàn bộ articles**. Phải thêm `articles?: ArticleEntry[]` vào options của render function + EditDatasetForm truyền `initialMetadata.articles`. Nếu không fix → data loss khi user edit metadata.

### Storage: array trong metadata.yaml
Articles là array trong `metadata.yaml` của dataset, không entity riêng. Lý do: không có lifecycle độc lập, không cần query cross-dataset (Phase 1), single source of truth vẫn git history.

## Context

### Tại sao feature này tồn tại
Phase 1 đã ship với tracking (downloads counter) — đo demand **định lượng**. Article linking bổ sung dimension **định tính**: không chỉ "dataset này được download bao nhiêu lần" mà "dataset này đã sinh ra bài báo nào". Cho data journalism ở tòa soạn, đây là chỉ báo impact mạnh hơn downloads.

### Personas affected
- **Ninh (Data Journalist)**: primary user — link bài mình viết với data đã dùng, build portfolio provenance
- **Minh (Editor)**: track qualitative usage của datasets (bên cạnh downloads counter)
- **Hoa (Reporter)**: đọc giả click vào dataset → thấy "đã dùng trong 3 bài" → trust + inspiration cho bài mới

### Constraints
- Vietnamese-first UI (label "Bài báo", error messages tiếng Việt)
- File-based substrate — articles[] trong metadata.yaml, không PostgreSQL
- Provenance: mọi add article có audit trail qua `edits[]`
- No public auth (internal tool Phase 1) — nhưng auth nhẹ đã shipped (NextAuth v5)
- Absolute timestamps (dd/mm/yyyy hh:mm VN) — không relative time (per user feedback memory)

### Existing patterns reused
- Mutation flow: `getMetadataYamlRaw()` → mutate → `commitMetadata()` (mirror `/api/dataset/edit`)
- Auth: `requireUserOr401()` từ `src/lib/auth/requireUser.ts`
- Audit: `injectEdited()` từ `src/lib/auth/inject-actor.ts` (reuse, không variant mới)
- Date format: `formatTimestamp()` từ MetadataSidebar
- Error UI: red-bordered box "Lỗi:" + nút Đóng (UploadWizard pattern)
- Tab structure: `TabSwitcher` component hiện có

### Risk flags (đã resolve qua user interview)
1. **cheerio dependency** — user đã approve
2. **EditDatasetForm data loss** — fix bắt buộc trong scope này
3. **commitMetadata wrapper commit cả dictionary.md** — thêm helper `commitMetadataYamlOnly()` trong `src/lib/git/commit.ts`
4. **Audit summary chiếm nhiều dòng** — acceptable cho journalism provenance

## Stakeholder Notes

- **Ninh (Data Journalist)** — primary user, cần link bài publish với dataset đã dùng để build track record + verification chain. Cần flow nhanh (paste URL → confirm → save dưới 30s).
- **Minh (Editor)** — secondary user, xem impact定性 của datasets. Cần badge homepage dễ scan ("dataset nào đã ra bài").
- **Hoa (Reporter)** — reader-side, đọc dataset detail → thấy articles list → verify data đằng sau bài báo + tìm inspiration.
