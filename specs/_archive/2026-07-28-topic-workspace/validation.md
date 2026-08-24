# Phase 3 — Topic Workspace Validation

> **⚠️ ARCHIVED 2026-07-28: DECISION NOT TO BUILD.** Pure NotebookLM route chosen. See `requirements.md` header for context.

---

## Definition of Done

All must be true before merge `topic-workspace` → `main`.

### 1. Code quality

- `npm run typecheck` exits 0
- `npm run build` exits 0 (catch Edge Runtime, Next.js 16 quirks)
- `npm run lint` exits 0 — no new ESLint errors
- **Only 1 new dependency added**: `mammoth` (server-only, dynamic import)
- `mammoth` loaded via `await import("mammoth")` trong route handler (NOT static import — avoid bundle bloat per Phase 1 lesson `feedback_client_heavy_lib_code_split.md`)

### 2. App runs

- `npm run dev` starts successfully
- `/topics` returns 200 khi đã login (redirect `/login?callbackUrl=/topics` khi chưa)
- `/topics/new` returns 200 khi đã login
- `/topics/[slug]` returns 200 nếu user là member, 403/redirect nếu không
- Phase 1 + Phase 2 routes (`/`, `/datasets/[slug]`, `/hoi-du-lieu`, `/upload`) **không regression**

### 3. Topic CRUD

**Create topic**:
- POST `/api/topics` với `{ name, description, members }` → 200 + `{ slug }`
- `topics/<slug>/topic.yaml` commit lên GitHub với đúng schema (requirements.md D1)
- `topics/index.json` update với entry mới
- Owner (current user email) auto-add vào members[]
- Slug collision handled (append `-2` hoặc timestamp suffix)

**List topics**:
- GET `/topics` SSR với `unstable_cache` 60s (pattern Phase 1)
- Chỉ show topics user là member
- Empty state render nếu chưa có topic: "Chưa có topic nào. Tạo topic đầu tiên."

**Update topic**:
- PATCH `/api/topics/[slug]` update name/description/members
- Owner-only check
- Revalidate topics index

**Delete topic**:
- DELETE `/api/topics/[slug]` remove folder (R2 raw + GitHub metadata)
- Owner-only check
- Confirm dialog trong UI

### 4. Document parser pipeline

**`.md` input**:
- Upload file `2606_Rừng VN.md` (sample thật) → parsed.json có:
  - `sections[]` ≥ 4 (Story Pitch, Outline, Research, Notes — detected qua `#` headings)
  - `tables[]` ≥ 2 (độ che phủ 1943-2004, các loại rừng 2004)
  - `citations[]` ≥ 3 (`[^1]` footnotes + `Nguồn:` lines detected)
  - `content_hash` non-empty sha256

**`.docx` input**:
- Upload `.docx` export từ Google Docs của sample file → parsed.json có cùng structure như `.md` (within tolerance cho format conversion)
- `mammoth` successfully extract headings, tables, paragraph text
- Footnotes bibliographic entries detected (Google Docs export `[^N]: ...` ở cuối hoặc inline defs)

**Author detection**:
- File `-2` sample (có `# Research_Tiên` + `# Research_Ninh`) → `authors[]` = `["Tiên", "Ninh"]` (hoặc user email nếu config)
- File chỉ có 1 author → `authors[]` single entry

**Hash check**:
- Re-sync cùng file (content identical) → hash match → SKIP parse, return 200 "no change"
- Re-sync file thay đổi 1 byte → hash different → full re-parse, return 200 "updated"
- Verify `last_synced_at` update chỉ khi hash different

**Error handling**:
- Upload file không phải `.docx`/`.md` → 400 "Format không hỗ trợ"
- Upload file corrupt `.docx` (mammoth throw) → 500 "Không parse được file" + log error, raw vẫn lưu R2

### 5. Topic chat Q&A

**API `/api/chat/topic`**:
- POST `{ slug, query }` → 200 streaming JSON
- Response JSON schema:
  ```json
  {
    "answer": "Markdown Vietnamese prose",
    "citations": [{ "doc_slug", "author", "section", "quote" }],
    "follow_ups": ["string"]
  }
  ```
- Streaming render: text xuất incremental (verify `curl -N`)
- Auth check: 401 nếu chưa login, 403 nếu không phải member
- Rate limit: 429 khi user exceed 100/day
- 1 query/min cap (Gemini 15 RPM shared với Discovery Chat)

**Sample queries với Rừng VN topic**:
- "Tiên đã tìm gì về rừng phòng hộ?" → answer có mention specific section trong `tien-research`, citation chip `[Tiên — Research_Tién/Bảng 5]`
- "Ninh đã nghĩ gì về story cross-border?" → answer mention `Story 5` + citation `[Ninh — Research_Ninh/Story 5]`
- "Có data nào về độ che phủ 1943 không?" → answer trả con số "14.300 nghìn ha" + citation table
- "xyz123" (no match) → "Tôi không tìm thấy thông tin này trong research của topic" + follow_ups suggest 3 câu hỏi phổ biến

**No hallucination check**:
- Query về info KHÔNG có trong corpus (VD "Dân số HCM 2024?") → answer nói "Tôi không tìm thấy thông tin này trong research của topic" — KHÔNG bịa câu trả lời
- Verify: every claim trong answer phải có citation chip tương ứng

**Citation UI**:
- Inline `[Author — Section]` chips trong answer render clickable
- Click → scroll đến DocumentList section tương ứng (hoặc open document viewer modal)
- Footer CitationCards (adapting Phase 2 CitationCard): doc title + author + section + quote snippet

### 6. Logging + quota

- Mỗi query log vào R2 `logs/topic-chat/<YYYY-MM-DD>.json` với schema đầy đủ
- Quota file `logs/topic-chat/_quota/<YYYY-MM-DD>.json` increment mỗi query
- Per-user quota track (keyed by user_email)
- Thumbs feedback POST `/api/chat/topic/feedback` cập nhật entry

### 7. Decision verification

- **D1 (doc upload not session distiller)**: không có slash command code, không có Claude Code integration, không có session transcript parser. Verify code review: chỉ có `.docx`/`.md` ingestion.
- **D2 (no versioning)**: re-upload cùng doc_slug → overwrite parsed.json + metadata.yaml. Không có `versions/` folder. Verify storage structure.
- **D3 (pure LLM not RAG)**: không có vector DB code, không có embedding call, không có retrieval function. Verify `flattenTopicCorpus()` trong `flatten.ts` returns full string (no chunking).
- **D4 (manual sync MVP)**: không có cron job config, không có webhook handler. Sync trigger chỉ từ UI button.
- **D5 (hash check + full re-parse)**: re-sync route handler check hash trước, skip nếu match. Verify bằng manual test (Group 4 hash check).
- **D6 (file-based)**: storage trong GitHub `topics/` + R2 `topics/` — không có Supabase/PostgreSQL code mới.
- **D7 (per-investigation scope)**: 1 topic có thể có nhiều documents, không có "sub-topic" concept.
- **D8 (per-topic RBAC)**: members[] check trong mọi API route. Non-member → 403. Verify bằng test create 2 users (1 member, 1 non-member).

### 8. Polish + UX

- Nav link "Topics" trong header → `/topics`
- TopicCard trên listing page show: name, description, member_count, doc_count, last_activity (relative time OK, tuyệt đối khi hover)
- TopicHeader có edit/delete buttons cho owner, view-only cho member
- Upload document modal có progress indicator (Phase 1 pattern)
- Empty states: TopicList empty, DocumentList empty (trong topic mới tạo), ChatBox no-docs state ("Topic chưa có document nào — upload đầu tiên")
- Error states: API 401 → redirect login, 429 → "Bạn đã hỏi quá nhiều hôm nay", 500 → "Tạm không trả lời được"
- Vietnamese-first: tất cả UI text + system prompts + error messages

## Not Required (Out of Validation Scope)

- No automated unit tests (manual test qua sample data đủ)
- No browser pixel-perfect check — responsiveness OK
- No load testing (7 users internal)
- No A/B testing chat quality
- No multi-turn conversation (single-shot only)
- No cache layer (no cache MVP)
- No vector DB / RAG (D3)
- No Google Docs integration (D4 defer)
- No session distiller (D1 rejected)
- No version history UI (D2)
- No PDF/audio ingestion (Phase 3a/3b pickup)
- No real-time sync webhook (D4 defer)
- No topic data catalog with caveats (Thẻ 5 pattern — defer)
- No conflict detection giữa contradictory sources
- No sensitivity tiers per-source
- No chat history UI display (log only MVP)
- No gold eval set cho topic chat (defer v1.5 — cần real usage data trước)

## Manual Test Plan (run trước mỗi ship)

### Setup
1. Seed sample topic qua `node scripts/seed-topic-rung-vn.mjs`
2. Login as `ninh@vnexpress.net` (owner)
3. Verify `/topics` shows 1 topic card

### Test 1: Tạo topic mới
4. Click "Tạo topic mới" → form `/topics/new`
5. Điền name "Test Topic", description "Test", add member email
6. Submit → redirect `/topics/test-topic`
7. Verify `topics/test-topic/topic.yaml` committed lên GitHub
8. Verify `topics/index.json` updated

### Test 2: Upload document
9. Trong topic vừa tạo, tab Documents → "Upload document"
10. Drag-drop file `2606_Rừng VN.md` sample
11. Wait for upload + parse (~3-5s)
12. Verify document appear trong list với `last_synced_at` recent
13. Verify `parsed.json` committed lên GitHub với sections/tables/citations populated

### Test 3: Re-sync (hash check)
14. Click "Re-sync" trên document vừa upload → verify response "no change" (hash match)
15. Modify file locally (thêm 1 dòng text) → re-upload (chưa support UI; test qua API)
16. Click "Re-sync" → verify "updated" (hash different)

### Test 4: Topic chat
17. Tab Chat → input "Tiên đã tìm gì về suy thoái rừng?"
18. Verify streaming response render incremental
19. Verify answer có inline citation `[Tiên — Research_Tiên/Forest Degradation]`
20. Verify footer CitationCards render
21. Verify follow-up pills click → new query submit

### Test 5: No-match handling
22. Input "Dân số HCM 2024?" (info không có trong corpus)
23. Verify answer: "Tôi không tìm thấy thông tin này trong research của topic"
24. Verify NO hallucinated numbers

### Test 6: RBAC
25. Logout, login as user KHÔNG phải member
26. Navigate `/topics/test-topic` → redirect or 403
27. Verify API POST `/api/chat/topic` trả 403

### Test 7: Quota + logging
28. Submit 5 queries → verify R2 log `logs/topic-chat/<date>.json` có 5 entries
29. Submit thumbs feedback → verify entry update
30. Verify quota file increment

### Test 8: Phase 1/2 regression
31. Navigate `/` → verify homepage still loads
32. Navigate `/datasets/[some-slug]` → verify detail still loads
33. Navigate `/hoi-du-lieu` → verify Discovery Chat still works
34. Navigate `/upload` → verify upload wizard still works

## Pre-Ship Checklist

- [ ] `npm run typecheck` exit 0
- [ ] `npm run build` exit 0
- [ ] `npm run lint` exit 0
- [ ] Manual tests 1-8 pass
- [ ] Sample topic seed script works
- [ ] `topics/index.json` + `topic.yaml` schemas match spec
- [ ] System prompt `tools/prompts/topic-chat.md` committed
- [ ] `.env.example` document new vars (nếu có — should be none, reuse `GEMINI_API_KEY`/`AI_BASE_URL`)
- [ ] README update: thêm "Topics" section explaining feature
- [ ] Update `docs/phase-1.md` or new `docs/phase-3.md` notes (optional, defer)
- [ ] CHANGELOG entry (run `/changelog` before merge)
- [ ] Memory update: ship log entry cho session sau (project_topic_workspace_shipped.md)

## Post-Ship (Next Session)

- Curate 20-50 gold eval questions cho topic chat (mirror Phase 2 pattern)
- Monitor Gemini quota — nếu exceed, fallback GLM
- Monitor parser failures — sample 5-10 real docs từ team để catch edge cases
- Trigger criteria tracking: count docs/topic, log warning khi > 5 docs hoặc > 200K tokens
- Plan v1.5: scheduled hourly sync + cross-linking from dataset/article
