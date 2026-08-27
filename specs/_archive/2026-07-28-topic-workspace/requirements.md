# Phase 3 — Topic Workspace Requirements

> **⚠️ ARCHIVED 2026-07-28: DECISION NOT TO BUILD.** Pure NotebookLM route chosen instead. This spec kept as backup plan — revive only if NotebookLM fails daily use case in 2-4 week test. Trigger criteria in `memory/project_topic_workspace_spec_2026_07_28.md`. Engineer bias counter pattern in `memory/feedback_notebooklm_over_build.md`.

---

## Scope

**Topic Workspace** = scoped knowledge base per topic/investigation. Phóng viên upload research documents (`.docx`/`.md` exports từ Google Docs) → system parse + index → teammate có thể Q&A scoped trong topic và nhận câu trả lời có citation đến research của đồng nghiệp.

**Bản chất**: NotebookLM-style workspace, nhưng:
- **Source unit = research document** (không phải PDF/url đơn lẻ)
- **Multi-contributor** (nhiều PV cùng upload vào 1 topic)
- **Per-author attribution** (system biết ai contribute gì, khi nào)
- **Vietnamese-first, journalism-grade** (citations, prose answer, không bịa)

Pattern: mỗi topic = 1 scoped Q&A interface. LLM thấy flatten corpus của topic đó. Trả lời dạng prose + inline citations đến document/author/section.

### Trigger / motivation

- Phase 2 Discovery Chat shipped (metadata Q&A toàn catalog) — đã có infrastructure
- Pain thật observed từ team: file research 600KB `2606_Rừng VN...md` chứa 2 PV contributions (Tiên + Ninh), nếu PV thứ 3 join phải tự đọc 600KB
- Session Claude Code (như session thiết kế feature này) mất khi close terminal → tất cả reasoning mất
- Mỗi topic điều tra lớn có 5-10 PV tham gia over months — cần leverage accumulated research
- Trước khi xây full Phase 3 RAG/Story Detection, cần **organizing primitive** (Topic entity) để scope knowledge

### Ví dụ use case thực tế

```
Topic: "Rừng Việt Nam thay đổi như thế nào?"

Documents:
  - Research_Tien.docx (Story Pitch + Outline + research sách CIFOR)
  - Research_Ninh.docx (5 story angles + Thẻ 5 data catalog)

Hoa (PV mới join) mở topic → hỏi:
  "Ninh đã nghĩ gì về story cross-border HAGL?"

→ System query documents by Ninh, retrieve section "Story 5"
→ Trả lời: "Theo **Research_Ninh**, Story 5 'Xuất khẩu mất rừng sang láng giềng'
   đề cập đến HAGL/VRG concessions ở Campuchia/Lào. Ninh đánh dấu
   (nhạy cảm). Data source: Open Development Cambodia ELC polygons."
→ Citation chip: "Research_Ninh — Story 5" → click scroll đến section
```

## Deliverables cụ thể

### 1. Topic entity + storage

**File-based** (consistent Phase 1):
- `topics/<slug>/topic.yaml` — metadata (name, description, members, created_at, last_activity)
- `topics/<slug>/documents/<doc-slug>/` — per-document folder
- Listing trong `topics/index.json` (pattern Phase 1 index.json cho SSR perf)

**Fields trong `topic.yaml`**:
```yaml
name: Rừng Việt Nam thay đổi như thế nào?
slug: rung-viet-nam-thay-doi-nhu-the-nao
description: Tuyến điều tra 3-bài về 30 năm phục hồi rừng
members:
  - email: ninh@vnexpress.net
    role: owner
  - email: tien@vnexpress.net
    role: contributor
created_at: 2026-07-28T10:00:00Z
last_activity: 2026-07-28T15:30:00Z
documents:
  - slug: tien-research
    title: Research_Tiên — Rừng VN
    author: tien@vnexpress.net
    last_synced_at: 2026-07-28T15:30:00Z
    content_hash: sha256:abc123...
  - slug: ninh-research
    title: Research_Ninh — Story menu + Thẻ 5
    author: ninh@vnexpress.net
    last_synced_at: 2026-07-28T11:00:00Z
    content_hash: sha256:def456...
```

### 2. Document ingestion pipeline

**Input**: `.docx` (Google Docs export) hoặc `.md` (markdown upload)

**Pipeline**:
1. Upload raw file → R2 (`topics/<slug>/documents/<doc-slug>/raw.docx` hoặc `raw.md`)
2. Parse: `mammoth.js` (.docx → HTML) → markdown AST (`remark`/`unified`)
3. Extract structured:
   - **Sections** (split theo `#`/`##`/`###` headings)
   - **Author attribution** (detect `# Research_<Tên>` pattern, fallback user input at upload)
   - **Tables** (markdown tables embedded — preserve as structured data)
   - **Footnotes** `[^N]` → bibliography entries
   - **Hyperlinks** `[N](URL)` → external URLs
   - **Source citations** `**Nguồn:** ...` lines → source refs
4. Store `parsed.json` + `metadata.yaml` per document
5. Update `topic.yaml` documents[] + last_activity

**Output `parsed.json` schema**:
```json
{
  "doc_slug": "tien-research",
  "title": "Research_Tiên — Rừng VN",
  "authors": ["tien@vnexpress.net"],
  "sections": [
    {
      "id": "story-pitch",
      "heading": "Story Pitch_Tiên",
      "level": 1,
      "content_markdown": "...",
      "subsections": [...]
    },
    {
      "id": "research-tien",
      "heading": "Research_Tiên",
      "level": 1,
      "author_inferred": "Tiên",
      "content_markdown": "..."
    }
  ],
  "tables": [
    {
      "id": "forest-coverage-1943-2004",
      "caption": "Độ che phủ rừng của Việt Nam qua các giai đoạn (1000 ha)",
      "source_text": "FIPI 1995, Bộ NN&PTNT 2006",
      "rows": [...]
    }
  ],
  "citations": [
    { "ref": "[^1]", "bib_entry": "FIPI 1995 — Chương trình Theo dõi..." },
    { "ref": "[1]", "url": "https://landcarbonlab.org/..." }
  ],
  "content_hash": "sha256:abc123..."
}
```

### 3. Topic chat (scoped Q&A)

**Page**: `/topics/[slug]` — topic workspace UI
- Header: topic name + member count + document count + last activity
- Document list (left sidebar hoặc tab) — show uploaded docs + upload button
- Chat interface (main) — single-shot Q&A, reuse ChatBox pattern Phase 2

**API**: `/api/chat/topic` — POST `{ slug, query }` → stream JSON structured response

**Pattern reuse từ Discovery Chat**:
- Flatten corpus (parsed.json × N docs trong topic) → ~500-2000 tokens/doc
- Gemini 2.5 Flash qua OpenAI-compatible endpoint (`AI_BASE_URL`/`AI_MODEL` swap pattern)
- Streaming JSON qua ReadableStream
- System prompt Vietnamese-first + citation instructions
- Rate limit per-user 100/day (reuse `logs/chat/_quota/` pattern)
- R2 JSON log `logs/topic-chat/<date>.json` (provenance)

**Output schema**:
```json
{
  "answer": "Markdown prose answer (Vietnamese)",
  "citations": [
    {
      "doc_slug": "ninh-research",
      "author": "Ninh",
      "section": "Story 5 — Xuất khẩu mất rừng",
      "quote": "HAGL, VRG concession ở Campuchia/Lào"
    }
  ],
  "follow_ups": ["Câu hỏi follow-up 1", "..."]
}
```

**Citation UX**:
- Answer text có inline citations dạng `[Ninh — Story 5]` (Markdown link hoặc button)
- Click → scroll đến document section trong sidebar hoặc open document viewer
- Footer: CitationCards (adapt từ Phase 2) cho mỗi unique citation

### 4. Topic CRUD UI

**Page `/topics`**: list all topics user là member
- TopicCard: name, description, member count, doc count, last activity
- "Tạo topic mới" button (owner only)

**Create topic flow** (`/topics/new`):
- Form: name, description, members[] (autocomplete email)
- Owner = current user
- Submit → `topics/<slug>/topic.yaml` commit GitHub → revalidate topics index

**Topic detail `/topics/[slug]`**:
- Tab "Chat" (default) — scoped Q&A
- Tab "Documents" — list + upload + delete (members only)
- Tab "Members" — list + add/remove (owner only)
- Tab "Settings" — edit name/description/delete topic (owner only)

### 5. Upload document UI

**Within topic detail, tab Documents**:
- Drag-drop zone (reuse `UploadDropzone` Phase 1 pattern)
- Accept `.docx`, `.md`
- Metadata form: title, author (default = current user email)
- Presign R2 URL → PUT → call `/api/topics/[slug]/documents` → parse + store

**API**: `/api/topics/[slug]/documents` POST `{ filename, author, title }`:
- Generate doc_slug
- Return presigned R2 URL cho upload
- On upload complete: trigger parse pipeline (synchronous hoặc queue — MVP sync)
- Update `topic.yaml` documents[]

### 6. Cross-linking

- Dataset detail page (`/datasets/[slug]`): thêm "Thêm vào topic" action → picker → add reference vào topic.yaml `dataset_refs[]`
- Article Linking card (đã có): extend "Link to topic" action

## Out of Scope

### Hard defer (not MVP)
- ❌ **Session distiller** (Claude Code slash command) — rejected: curation overhead, fine-tuning endless, trust issue
- ❌ **Google Docs integration** (OAuth/webhook) — defer v1.5+, manual upload MVP đủ
- ❌ **Version history** — Google Docs handles (last-write-wins trong system)
- ❌ **RAG / vector DB** — pure LLM đủ cho <5 docs/topic, trigger criteria khi >5 docs hoặc >200K tokens
- ❌ **Topic data catalog** (Thẻ 5-style với caveats column) — defer tới khi có user demand
- ❌ **Definition comparison engine** (cross-source methodology tracker)
- ❌ **Coverage matrix** (story × data)
- ❌ **Sensitivity tiers / per-source RBAC** —RBAC per-topic đủ MVP
- ❌ **Conflict detection** giữa contradictory sources
- ❌ **Audio/PDF ingestion** — Phase 3a/3b pickup
- ❌ **Real-time sync webhook** — manual/scheduled sync MVP

### Soft defer (consider for v1.5)
- Per-doc auto-summary khi >5 docs (hierarchical LLM)
- Topic-level chat history (multi-turn memory)
- Gold eval set cho topic chat (giống Discovery Chat pattern)
- Export topic corpus (zip download)
- Re-sync document button (manual trigger)
- Scheduled hourly sync (cron)

## Decisions

### D1. Ingestion: `.docx`/`.md` upload, KHÔNG session distiller

**Choice**: PV export research từ Google Docs → upload file vào topic workspace.

**Rejected**: Session distiller (slash command Claude Code → AI summary → upload).

**Reasoning**:
- Session có noise (dead-ends, debugging, intermediate thoughts) → AI phải filter → PV review → fine-tuning endless
- Trust issue: PV không tin auto-distill, sẽ phải verify → same workload
- Doc uploads là workflow PV đã quen (Google Docs collab → export → share)
- File thật signal (file Tiên/Ninh sample) đã structured: headings per author, sections, footnotes, tables → parser handle được, không cần AI filter
- Zero new cognitive load cho PV

### D2. No versioning trong system — Google Docs handles

**Choice**: Mỗi sync = overwrite. Last-write-wins. No version history.

**Reasoning**:
- Google Docs đã có version history chất lượng cao (Google đầu tư billions)
- Duplicate version history = 2 sources of truth → confusing
- Storage simplification: 1 doc = 1 set files (raw.docx, parsed.json, metadata.yaml)
- PV mental model: "current state of doc" — system mirror
- Q&A simpler: luôn đọc current, không version picker

**Trade-off acknowledged**: Provenance snapshot tại thời điểm xuất bản bài báo mất. Acceptable vì:
- Bài cite specific sources (URL/table/quote), không cite "doc state at time T"
- Nếu cần trace → Google Docs version history

### D3. Pure LLM (context-stuffing), KHÔNG RAG cho MVP

**Choice**: Flatten parsed.json × N docs → stuff vào Gemini context → answer.

**Rejected**: Vector embedding + retrieval (RAG pattern NotebookLM).

**Reasoning**:
- Doc sizes thực tế: 1-3 docs × 600KB ≈ 300K tokens — fits Claude Sonnet/Gemini 1M context
- Quality tổng hợp cao hơn pure LLM (no retrieval errors, full cross-doc synthesis)
- Cost OK: Gemini Flash 200K input × $0.075/M = ~$0.015/query. 20 query/day × 30 = $9/month
- Zero infrastructure mới — reuse 100% Discovery Chat pattern
- Citation precision: inline prose (`[Author — Section]`) đủ cho journalism standards

**Upgrade triggers** (đẩy Phase 3f):
- Topic corpus > 5 docs HOẶC > 200K tokens → thêm per-doc auto-summary
- > 10 docs HOẶC > 500K tokens → hierarchical RAG (summary pass + detail pass)
- > 20 docs HOẶC > 1M tokens → full vector RAG (pgvector + multilingual-e5-large)

### D4. Sync trigger model: manual MVP, scheduled/webhook upgrade path

**Choice MVP**: PV click "Re-sync" button khi upload again hoặc after edits.

**Why not real-time**:
- Disrupts Q&A (corpus thay đổi mid-query → inconsistent)
- Wasted compute trên draft messy state
- Sync = explicit signal "ready to share" (feature, không bug)

**v1.5**: Scheduled hourly cron (catch all changes from hour)
**v2.0**: Webhook real-time (Google Drive push notification) — chỉ nếu PV demands

**Parse strategy**: hash check + full re-parse. No diff logic.

### D5. Sync mechanics: hash check + full re-parse

**Choice**: Khi re-sync, compare content hash với last synced. Nếu khác → full re-parse (~3s), overwrite all files.

**Rejected**: Diff-based incremental update.

**Reasoning**:
- Cascading changes (added 1 paragraph → all footnotes renumbered)
- Structural changes (new heading → section boundaries shift)
- Diff logic fragile + maintain nặng
- Full re-parse 3 giây cho 600KB — cost nhỏ hơn diff engineering effort
- Rule: diff chỉ worth khi parse time > 30s. Dưới 3s, full re-parse luôn rẻ hơn

### D6. Storage: file-based (consistent Phase 1)

**Choice**: GitHub `topics/<slug>/topic.yaml` + parsed.json + R2 raw.docx.

**Reasoning**:
- Phase 1 đã chốt file-based (re-arch 2026-07-02), PostgreSQL defer Phase 2/3
- Pattern proven: dataset catalog hoạt động 24 ngày production không issue
- Git history cho topic.yaml = audit log + provenance free
- R2 cho file lớn (600KB-2MB .docx)

### D7. Topic scope = per-investigation, không per-article

**Choice**: 1 topic = "Rừng VN" (bao gồm 3-bài series + 5 story angles), không 1 topic per bài.

**Reasoning** (từ sample file -2):
- File sample có 2 PV contribute complementary angles trong 1 topic
- Tiên: narrative/policy research (sách, luật, định nghĩa)
- Ninh: data-driven story angles (Hansen, IBTrACS)
- Cùng topic → cross-pollinate insights (Ninh Story 1 = Tiên Note về 1.3M ha contradiction)
- 1 topic = 1 investigation, nhiều output articles

### D8. Auth: members-only, per-topic RBAC

**Choice**: Topic có members[]. Only members xem/chat/upload. Owner quản lý members.

**Reasoning**:
- Internal newsroom tool, 7 users
- Topic chứa unreleased research → cần access control
- Owner = người tạo topic. Contributors = members thêm vào.
- Defer: sensitivity tiers per-source (story 5 nhạy cảm) → v2 khi có demand

## Context

### Tại sao Phase 3 bắt đầu bằng Topic Workspace

Phase 3 (Intelligence) trên roadmap có 3a-3f:
- 3a Document RAG
- 3b Audio RAG
- 3c Multi-source Reasoning
- 3d Story Detection
- 3e NL→SQL
- 3f Optional extensions (vector DB / semantic layer)

**Nhưng thiếu organizing primitive**: thực tế investigation luôn xoay quanh **topic**. Mọi feature 3a-3d plug vào topic scope:
- 3a Document RAG → documents sống trong topic
- 3b Audio RAG → phỏng vấn thuộc topic
- 3c Multi-source reasoning → reason trong scope topic
- 3d Story detection → scan corpus topic

Topic Workspace = container primitive cho Phase 3. Build trước, mọi feature sau plug in.

### Constraints

- **Vietnamese-first** UI + output (terminology English OK — Topic, Document, Citation)
- **Journalism tone register** — rõ ràng, không marketing, không hallucinate
- **Internal tool**, 7 users (Ninh + 6 editors/PV early adopter)
- **Citations bắt buộc** — mỗi claim phải trace đến document + author + section
- **No hallucination** — nếu context thiếu, "Tôi không tìm thấy thông tin này trong research của topic"
- **Phase 1 reuse tối đa**: file-based storage, R2, Gemini/OpenAI SDK, NextAuth, ChatBox pattern

### Backup plan

Nếu pure LLM context-stuffing không fit (cost exceed hoặc quality kém với Vietnamese):
- v1.5: hierarchical summary (per-doc auto-summary khi sync)
- v2.0: full RAG với pgvector (Supabase plan Phase 3)

## Stakeholder Notes

- **Tiên (Phóng viên/Researcher)** — User chính. Narrative-style research (sách, luật, định nghĩa). Cần retention của footnote citations, bilingual excerpts. Pain: file 600KB, đồng nghiệp không đọc hết.
- **Ninh (Data Journalist)** — Power user + owner. Data-driven angles, external datasets (Hansen, IBTrACS). Cần fast ingest + scoped Q&A để verify teammates' findings. Curate gold eval set.
- **Hoa (PV mới join topic)** — Beneficiary lớn nhất. Hỏi "Ninh đã nghĩ gì về X?" → nhận synthesis thay vì đọc 600KB. Không cần biết technical.
- **Minh (Editor)** — Quản lý topic membership. Tạo topic mới cho investigation mới. Track contributions qua activity log.
