# Phase 3 — Topic Workspace Plan

> **⚠️ ARCHIVED 2026-07-28: DECISION NOT TO BUILD.** Pure NotebookLM route chosen. See `requirements.md` header for context. Spec kept as backup plan if NotebookLM fails.

---

## Architecture Snapshot

```
┌──────────────────────────────────────────────────────────┐
│ /topics (listing) → /topics/new → /topics/[slug]         │
│                                            ├─ Chat tab   │
│                                            ├─ Docs tab   │
│                                            ├─ Members    │
│                                            └─ Settings   │
└──────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│ APIs                                                      │
│ /api/topics (CRUD)                                        │
│ /api/topics/[slug]/documents (upload/sync/delete)         │
│ /api/chat/topic (streaming Q&A)                           │
└──────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────┬─────────────────────────────────┐
│ Storage                │ Compute                          │
│ GitHub: topics/<slug>/ │ Next.js route handlers           │
│   topic.yaml           │ - mammoth.js parse (.docx→HTML)  │
│   documents/<s>/       │ - regex extractors               │
│     parsed.json        │ - Gemini Flash streaming         │
│ R2: raw files          │                                  │
│   topics/<slug>/...    │                                  │
└────────────────────────┴──────────────────────────────────┘
```

**Reuse tối đa** từ Phase 1/2:
- `src/lib/r2/*` (presign, get, delete, counter, chat-log)
- `src/lib/github/contents-api.ts`
- `src/lib/chat/flatten-metadata.ts` (adapt cho topics)
- `src/lib/chat/extract-json.ts` (stream parse)
- `src/components/chat/ChatBox.tsx` (extend hoặc fork)
- Gemini OpenAI-compatible endpoint (`AI_BASE_URL`/`AI_MODEL` swap)

## New Dependencies

| Package | Purpose | Size | Approval |
|---|---|---|---|
| `mammoth` | `.docx` → HTML | ~50KB server-only | **Cần user approval** (CLAUDE.md rule: no new deps without approval) |

`remark-parse` + `unified` không cần thêm — `react-markdown` có sẵn transitive, và MVP dùng regex extractors đơn giản hơn AST.

## Build Groups

### Group 1 — Topic entity foundation

1. **`src/lib/topics/storage.ts`** — topic CRUD helpers:
   - `listTopics()` — read `topics/index.json` (pattern Phase 1 `index.json`)
   - `getTopic(slug)` — read `topics/<slug>/topic.yaml` qua GitHub Contents API
   - `createTopic({ name, description, members })` — generate slug, commit `topic.yaml` to GitHub, update `topics/index.json`
   - `updateTopic(slug, patch)` — patch `topic.yaml` fields
   - `deleteTopic(slug)` — remove folder (R2 raw + GitHub metadata)
2. **`src/lib/topics/index.ts`** — `topics/index.json` cache (mirror Phase 1 dataset index pattern):
   ```json
   [
     {
       "slug": "rung-viet-nam",
       "name": "Rừng Việt Nam...",
       "description": "...",
       "member_count": 2,
       "document_count": 2,
       "last_activity": "2026-07-28T15:30:00Z"
     }
   ]
   ```
3. **`src/app/topics/page.tsx`** — listing page (SSR với `unstable_cache` 60s pattern Phase 1 wrap-up):
   - TopicCard grid cho topics user là member
   - "Tạo topic mới" CTA (owner role implicit)
   - Empty state nếu chưa có topic
4. **`src/app/topics/new/page.tsx`** — create form (auth required):
   - Fields: name, description, members[] (email input với autocomplete từ user base)
   - On submit → POST `/api/topics` → redirect `/topics/[slug]`
5. **`src/app/api/topics/route.ts`** — POST create topic:
   - Auth check
   - Validate input
   - Generate slug (slugify name + dedupe)
   - Commit `topic.yaml` to GitHub (Contents API pattern)
   - Update `topics/index.json`
   - Return `{ slug }`

### Group 2 — Document parser pipeline

6. **Install `mammoth`** — `npm install mammoth` (after user approval)
7. **`src/lib/topics/parse-document.ts`** — main parser:
   ```typescript
   async function parseDocument(rawBuffer: Buffer, format: 'docx' | 'md'): Promise<ParsedDoc>
   ```
   - Nếu `.docx`: `mammoth.convertToHtml({ buffer })` → HTML string → `convertHtmlToMarkdown(html)` (cheerio-based, simple regex transformations, không cần full Turndown)
   - Nếu `.md`: read UTF-8 directly
   - Call extractors (steps 8-11)
   - Compute `content_hash` (sha256)
   - Return `ParsedDoc` object theo schema trong requirements.md
8. **`src/lib/topics/extractors/sections.ts`** — split markdown theo headings:
   - Detect `#`, `##`, `###` (regex hoặc simple line scan)
   - Each section: `{ id, heading, level, content_markdown, author_inferred? }`
   - Author inference: nếu heading match `^#\s*(Story Pitch|Research|Notes?|Menu|Thẻ)[_\-:]?(\w+)?$` → extract author từ suffix (VD `Research_Tiên` → author="Tiên")
   - Fallback: user-specified author tại upload time
9. **`src/lib/topics/extractors/tables.ts`** — extract markdown tables:
   - Regex match `\n\|.+\|\n(\|-+)+\n(\|.+\|\n)+`
   - Parse rows + headers
   - Look ahead 1-2 dòng sau table cho `**Nguồn:**` hoặc `Nguồn:` line → associate làm `source_text`
   - Output: `tables[]` với `{ id, caption?, source_text?, headers, rows }`
10. **`src/lib/topics/extractors/citations.ts`** — extract citation graph:
    - Footnotes `[^N]` → match với bibliography section cuối doc nếu có, hoặc inline defs `[^N]: ...`
    - Hyperlinks `[N](URL)` hoặc `[text](URL)` → external URLs
    - `**Nguồn:**` lines → source citations (sau tables hoặc paragraphs)
    - Merge vào `citations[]` unified
11. **`src/lib/topics/flatten.ts`** — flatten parsed.json × N docs thành prompt context:
    ```typescript
    function flattenTopicCorpus(documents: ParsedDoc[]): string
    ```
    - Per doc: `## <title> (by <author>)\n<sections flattened>\n<tables summaries>\n<citations>`
    - Cap 200K tokens — nếu exceed, log warning (trigger RAG upgrade path)
    - 60s cache (pattern `flatten-metadata.ts`)

### Group 3 — Document upload + sync

12. **`src/app/api/topics/[slug]/documents/route.ts`** — POST handler:
    - Auth check (must be topic member)
    - Validate `{ filename, author_email, title }`
    - Generate `doc_slug` (slugify title + dedupe within topic)
    - Return presigned R2 PUT URL cho `topics/<slug>/<doc_slug>/raw.<ext>`
    - On PUT complete (client confirms) → trigger parse (sync hoặc background)
    - Commit `parsed.json` + `metadata.yaml` to GitHub
    - Update `topic.yaml.documents[]` + `last_activity`
    - Revalidate `topics/index.json`
13. **`src/app/api/topics/[slug]/documents/[doc_slug]/sync/route.ts`** — POST re-sync:
    - Re-fetch raw từ R2 → re-parse → overwrite parsed.json/metadata.yaml
    - Hash check trước — nếu hash == last → return 200 "no change"
    - Update last_synced_at + content_hash
14. **`src/app/api/topics/[slug]/documents/[doc_slug]/route.ts`** — DELETE:
    - Remove document folder (GitHub + R2)
    - Update topic.yaml.documents[]
    - Revalidate index
15. **`src/components/topics/UploadDocument.tsx`** — drag-drop + form:
    - Reuse pattern `UploadDropzone` Phase 1 (presign → PUT → confirm)
    - Accept `.docx`, `.md`
    - Form fields: title (auto-extract từ filename), author_email (default current user)
    - On complete → refresh document list

### Group 4 — Topic detail UI

16. **`src/app/topics/[slug]/page.tsx`** — topic workspace:
    - `export const dynamic = "force-dynamic"` (Phase 1 lesson)
    - SSR topic metadata + document list
    - Tabs: Chat (default), Documents, Members, Settings
    - Members-only check (redirect nếu không phải member)
17. **`src/components/topics/TopicHeader.tsx`** — name + description + member count + last activity + role badge
18. **`src/components/topics/TopicChat.tsx`** — extends ChatBox Phase 2:
    - Input + streaming response render
    - Suggested prompts (3-4 hardcoded VD "Tiên đã tìm gì về rừng phòng hộ?")
    - Submit → POST `/api/chat/topic` → stream JSON
    - Render answer (react-markdown) + inline citation chips + footer CitationCards
    - Single-shot (no multi-turn MVP)
19. **`src/components/topics/DocumentList.tsx`** — list documents + upload button:
    - Per doc: title, author, last_synced_at, content_hash short, re-sync button, delete button (owner only)
    - Upload button mở UploadDocument modal
20. **`src/components/topics/MemberList.tsx`** — list members + add/remove (owner only):
    - Add: email input → POST update topic.yaml
    - Remove: confirm dialog → update topic.yaml
21. **`src/components/topics/TopicSettings.tsx`** — edit name/description/delete (owner only)

### Group 5 — Topic chat API

22. **`src/app/api/chat/topic/route.ts`** — POST handler:
    - Auth check (must be topic member)
    - Validate `{ slug, query }`
    - Rate limit per-user 100/day (R2 `logs/topic-chat/_quota/<date>.json`)
    - Flatten topic corpus (Group 2 step 11)
    - Build system prompt (step 23)
    - Call Gemini streaming (reuse pattern `flatten-metadata.ts` + `gemini-client.ts` if extracted, hoặc inline openai SDK)
    - Stream JSON tokens to client (ReadableStream pattern Phase 2)
    - On complete: append entry to R2 `logs/topic-chat/<YYYY-MM-DD>.json`
23. **`tools/prompts/topic-chat.md`** — system prompt (Vietnamese-first):
    ```
    Bạn là research assistant cho topic investigation báo chí.

    Context: research contributions từ nhiều phóng viên (đánh dấu bằng ## headings).

    Nhiệm vụ:
    - Trả lời câu hỏi phóng viên dựa trên research context dưới đây
    - Mỗi claim PHẢI cite dạng inline [Author — Section name]
    - Nếu thông tin không có trong context: "Tôi không tìm thấy trong research của topic"
    - KHÔNG bịa con số, tên, ngày tháng
    - Tiếng Việt, tone journalism rõ ràng
    - Output JSON: { answer: string (Markdown), citations: [{doc_slug, author, section, quote}], follow_ups: string[] }
    ```
24. **`src/lib/r2/topic-chat-log.ts`** — append-only log helper (mirror `chat-log.ts` Phase 2):
    - Path: `logs/topic-chat/<YYYY-MM-DD>.json` + `_quota/<YYYY-MM-DD>.json`
    - Schema: `{ id, timestamp, user_email, topic_slug, query, answer_summary, citations_count, thumbs, feedback_text, latency_ms }`

### Group 6 — Feedback + cross-linking

25. **`src/app/api/chat/topic/feedback/route.ts`** — POST `{ query_id, thumbs, feedback_text? }` (mirror Discovery Chat feedback)
26. **`src/components/chat/ThumbsFeedback.tsx`** — reuse từ Phase 2 (hoặc fork nếu cần customization)
27. **Cross-link từ dataset detail** — edit `src/components/dataset/MetadataSidebar.tsx`:
    - Thêm "Thêm vào topic" button → topic picker modal → add `dataset_refs[]` vào topic.yaml
28. **Cross-link từ article** — extend Article Linking card: "Link to topic" action

### Group 7 — Nav + polish

29. **Nav link** — edit header/layout: thêm "Topics" → `/topics` (lucide icon: FolderKanban hoặc Collection)
30. **Topic card on homepage** — có thể thêm "Recent topics" section (optional, defer nếu homepage đã đủ content)
31. **Empty states** — TopicList empty, TopicChat empty (no docs yet → "Upload document đầu tiên")
32. **Error states** — 404 topic không tồn tại, 403 không phải member, 429 quota, 500 fallback

## File Structure

```
topics/                                      # GitHub repo
├── index.json                               # listing cache
└── <slug>/
    ├── topic.yaml                           # metadata + members + doc refs
    └── documents/
        └── <doc-slug>/
            ├── parsed.json                  # structured extract
            └── metadata.yaml                # hash + last_synced_at + author

R2:
topics/<slug>/<doc-slug>/raw.docx (or raw.md)
logs/topic-chat/<YYYY-MM-DD>.json
logs/topic-chat/_quota/<YYYY-MM-DD>.json
```

```
src/
├── app/
│   ├── topics/
│   │   ├── page.tsx                         # listing
│   │   ├── new/page.tsx                     # create form
│   │   └── [slug]/page.tsx                  # workspace
│   └── api/
│       ├── topics/
│       │   ├── route.ts                     # POST create
│       │   └── [slug]/
│       │       ├── route.ts                 # GET/PATCH/DELETE topic
│       │       └── documents/
│       │           ├── route.ts             # POST upload
│       │           └── [doc_slug]/
│       │               ├── route.ts         # DELETE
│       │               └── sync/route.ts    # POST re-sync
│       └── chat/
│           └── topic/
│               ├── route.ts                 # POST streaming chat
│               └── feedback/route.ts        # POST thumbs
├── components/
│   └── topics/
│       ├── TopicCard.tsx
│       ├── TopicHeader.tsx
│       ├── TopicChat.tsx (extends ChatBox)
│       ├── DocumentList.tsx
│       ├── UploadDocument.tsx
│       ├── MemberList.tsx
│       └── TopicSettings.tsx
└── lib/
    ├── topics/
    │   ├── storage.ts                       # CRUD
    │   ├── index.ts                         # index.json cache
    │   ├── parse-document.ts                # main parser
    │   ├── flatten.ts                       # corpus → prompt context
    │   └── extractors/
    │       ├── sections.ts
    │       ├── tables.ts
    │       └── citations.ts
    └── r2/
        └── topic-chat-log.ts
```

## Implementation Sequence

**Tuần 1 — Foundation**:
- Day 1-2: Group 1 (topic entity + listing + create)
- Day 3-4: Group 2 (parser pipeline, bắt đầu bằng .md trước vì simpler, .docx sau khi có mammoth)
- Day 5: Group 3 (upload + sync API)

**Tuần 2 — UI + Chat**:
- Day 6-7: Group 4 (topic workspace UI)
- Day 8-9: Group 5 (topic chat API)
- Day 10: Group 6 (feedback + cross-linking) + Group 7 (nav + polish)

**Day 11-12 (buffer)**: Validation, bug fixes, sample data seeding.

## Sample Data Seed

Để demo và test, seed 1 topic thật từ file sample:

```bash
# Trong dev: script seed sample topic
node scripts/seed-topic-rung-vn.mjs
```

Topic "Rừng Việt Nam" với 2 documents:
- `tien-research`: từ file `2606_Rừng Việt Nam thay đổi như thế nào?.md` (file -1)
- `tien-ninh-research`: từ file `2606_Rừng Việt Nam thay đổi như thế nào?-2.md` (file -2 có cả Tiên + Ninh)

Serves as:
- Realistic test data cho parser
- Demo cho user validation với Tiên/Ninh thật
- Eval baseline cho chat quality

## Risks + Mitigations

| Risk | Mitigation |
|---|---|
| Parser fail trên doc structure lạ | Graceful degradation — fallback to plain text, log warning, still store raw |
| `mammoth` adds bundle weight | Server-only import (dynamic import trong route handler, không vào INITIAL chunk) |
| GitHub Contents API rate limit (60/hr unauth, 5000/hr auth) | Reuse Phase 1 pattern — auth via `GITHUB_TOKEN`, cache responses |
| R2 storage growth (multiple docs × MB each) | Lifecycle rule optional — defer, R2 free tier 10GB đủ cho 50 topics × 5 docs |
| Pure LLM context exceed (>200K tokens) | Cap + truncate oldest content, log warning. Triggers RAG upgrade path. |
| Gemini quota exceed (1500 RPD free) | Reuse quota tracking từ Phase 2. Fallback GLM if configured. |
| Member sync race condition (2 users edit topic.yaml cùng lúc) | GitHub Contents API SHA check — last-write-wins với retry. Defer optimistic locking. |

## Validation Hooks (cho validation.md)

- `npm run typecheck` exit 0
- `npm run build` exit 0 (catch Edge Runtime issues)
- `npm run lint` exit 0
- Manual: tạo topic → upload file sample → chat → verify citation
- Manual: hash check skip (re-upload same file → no re-parse)
- Manual: re-sync after edit → new hash → re-parse → Q&A sees new content

## Open Questions (resolve trước hoặc trong build)

1. **Topic slug collision** — slugify có thể produce duplicate slugs (VD 2 topic cùng tên "Rừng VN"). Strategy: append `-2`, `-3`, hoặc timestamp suffix.
2. **Member email validation** — verify exist trong user base, hay accept any email? Recommend: accept any (PV có thể add external collaborator), nhưng RBAC check dựa email match.
3. **Document deletion safety** — soft delete (keep R2 raw, mark deleted trong metadata) hay hard delete? Recommend: hard delete + audit log entry (consistent Phase 1 dataset delete pattern).
4. **Topic deletion** — owner-only với confirm dialog. Cascade delete documents (R2 + GitHub). No undo MVP.
5. **Chat history persistence** — log only (R2 JSON) hay UI display? Recommend: log only MVP. UI history display = v1.5.
