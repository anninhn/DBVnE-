# Phase 2 Requirements — Discovery Chat

## Scope

Phase 2 = 1 feature duy nhất: **Discovery Chat — Metadata Q&A**. Phóng viên hỏi câu hỏi tiếng Việt tự nhiên về data tòa soạn → LLM đọc metadata + dictionary của tất cả datasets → trả lời dạng text + cite dataset cụ thể + suggest follow-up prompts.

### Deliverables cụ thể

**Page mới** — `/hoi-du-lieu` (dedicated discovery chat page)
- Initial state: empty input + 3-4 suggested prompts showcase (vd "Có data gì về kinh tế ĐBSCL?", "Dân số các tỉnh 2024?", "GRDP 5 năm gần đây?")
- Single-shot Q&A: mỗi câu hỏi độc lập, không memory context
- Login required — consistent với Phase 1 auth nhẹ
- Vietnamese-first UI + output

**API route mới** — `/api/chat/discovery`
- POST `{ query: string }` → stream JSON structured response
- LLM = Gemini 2.0 Flash free tier qua **OpenAI-compatible endpoint** (`https://generativelanguage.googleapis.com/v1beta/openai/`) — reuse `openai` SDK v6 đã có, không thêm dependency mới
- Input context: flatten metadata + dictionary của tất cả datasets (~300-400 tokens/dataset × N)
- Output schema (JSON structured):
  ```json
  {
    "answer": "string (Markdown, Vietnamese)",
    "datasets": [
      { "slug": "...", "reason": "...", "confidence": "high|medium|low" }
    ],
    "follow_ups": ["string", "string"]
  }
  ```
- Streaming tokens qua Edge Runtime (Next.js 16 route handler với `runtime = "edge"` nếu feasible, fallback Node runtime streaming)

**UI components mới** — `src/components/chat/`
- `ChatBox.tsx` — main interface (input + streaming response render)
- `CitationCard.tsx` — mini DatasetCard (title link + confidence badge + reason), render ngay sau answer text
- `FollowUpPills.tsx` — render `follow_ups[]` thành pill buttons, click → pre-fill input + submit
- `ThumbsFeedback.tsx` — 👍/👎 buttons + optional text feedback khi 👎
- `EmptyState.tsx` — render "Không tìm thấy dataset phù hợp" + suggest 3-4 topics (kinh tế, dân số, bầu cử, khí hậu)

**Logging** — R2 JSON append-only `logs/chat/<YYYY-MM-DD>.json`
- Schema: `{ id, timestamp, user_email, query, answer_summary, datasets_cited[], thumbs, feedback_text, latency_ms }`
- Append mỗi query (reuse pattern R2 `counter.ts` Phase 1)
- Feedback endpoint `POST /api/chat/feedback` cập nhật entry với thumbs

**Eval set** — `eval/gold-questions.json` (Ninh curate 20-50 câu)
- Schema: `{ id, query, expected_dataset_slugs[], expected_answer_pattern, vietnamese_only }`
- Eval script `scripts/eval-chat.mjs` + npm script `npm run eval:chat` → đo accuracy/recall, output `eval/reports/<YYYY-MM-DD>.json`

**Cross-linking CTA** — thêm "Hỏi về dataset này" button trên MetadataSidebar (dataset detail page) → `/hoi-du-lieu?prefill=<slug>`. ChatBox auto-fill query "Có thông tin gì về <title>?" khi có `?prefill` param.

**Nav link** — header thêm "Hỏi dữ liệu" → `/hoi-du-lieu`

## Out of Scope

- ❌ Full Data Q&A (con số cụ thể từ dataset) — đẩy Phase 3e (NL→SQL + DuckDB query)
- ❌ Multi-turn conversation với memory context
- ❌ Chart builder, SQL panel, query templates
- ❌ Dataset promotion Bronze → Silver
- ❌ Vector DB / semantic search (opt-in Phase 3f khi trigger criteria met)
- ❌ Caching common queries (no cache MVP)
- ❌ Recent/popular queries display (suggested prompts showcase only)
- ❌ Anonymous access (login required)
- ❌ Change password UI (defer từ Phase 1 wrap-up)
- ❌ AI observations Tier 1 (defer từ Phase 2 backlog 2026-07-16)
- ❌ Multi-file/multi-format upload (defer phase sau)
- ❌ Token pre-filter (keyword/vector) — over-engineering sớm
- ❌ Per-user quota UI (admin view) — log only MVP

## Decisions

### Tier 1 — Metadata Q&A (KHÔNG Full Data Q&A)
LLM đọc metadata + dictionary của tất cả datasets → output câu trả lời dạng text + cite dataset. KHÔNG query data rows. Tier 2 (Full Q&A với DuckDB query) đẩy Phase 3e.

**Vì sao không phải Discovery cards cũ** (decision 2026-07-24): Phóng viên muốn câu trả lời cho câu hỏi, không phải list datasets. Output phải là text answer + cite dataset cụ thể + cột cụ thể. Cũ (Discovery cards) → loại hoàn toàn.

**Vì sao không Full Data Q&A luôn**: cần guardrails phức tạp (read-only DB level, row limit, timeout, verify loop). Tier 1 = cầu nối giá trị cao / phức tạp thấp.

### Model: Gemini 2.0 Flash free tier qua OpenAI-compatible endpoint
- Free tier: 15 RPM, 1500 RPD, 1M tokens/day — đủ cho 5-10 internal users
- Vietnamese capability tốt
- **Reuse `openai` SDK v6** đã có + `AI_BASE_URL`/`AI_MODEL`/`AI_ENV_VAR` swap pattern (consistent Phase 1, không thêm dependency)
- Gemini OpenAI endpoint: `https://generativelanguage.googleapis.com/v1beta/openai/`
- Model name: `gemini-2.0-flash-exp` (hoặc latest stable khi ship)
- API key: Google AI Studio generate, scope server-only

**Fallback chain**: Gemini API error/quota exceed → retry with GLM (current AI_BASE_URL nếu configured) → hard fail với Vietnamese error message. Logic trong route handler.

**Quota monitoring**: log daily usage vào R2 `logs/chat/_quota/<YYYY-MM-DD>.json`. Warn khi >80% limit.

**Backup plan**: Nếu LLM free tier không fit (quality kém với Vietnamese / cost exceed) → skip Phase 2, đẩy thẳng Phase 3.

### Output: JSON structured + streaming
- LLM output JSON schema cố định (`answer` + `datasets[]` + `follow_ups[]`)
- Stream tokens — UX responsive
- App parse JSON stream → render HTML incremental
- User KHÔNG thấy raw JSON — chỉ thấy text answer + cards + follow-up pills

### Citation UI: Answer text + card preview
- Answer dạng Markdown paragraph (render qua `react-markdown` đã có)
- Sau answer: 1-nhiều CitationCard (mini DatasetCard) cho mỗi dataset cite
- Card có: title (link → detail), confidence badge, reason 1 câu
- Follow-up pills cuối response — click → pre-fill input + submit

### Context budget: Full dictionary, no pre-filter
- Flatten metadata + full dictionary descriptions (~300-400 tokens/dataset)
- 50-100 datasets × 400 tokens = 20-40K input fits Gemini context (1M tokens/day free tier)
- Skip keyword/vector pre-filter (over-engineering sớm, sẽ pickup khi catalog >100 + miss pattern)

### Eval set: JSON + script
- Ninh curate 20-50 gold questions trong `eval/gold-questions.json`
- Eval script `npm run eval:chat` chạy qua API + đo accuracy/recall
- Run trước mỗi ship để catch regression
- Baseline threshold: accuracy ≥ 70% (adjust sau khi có data thật)

### Auth: Login required
- Reuse Phase 1 NextAuth v5 setup (proxy.ts function declaration pattern — Next.js 16 lesson)
- Log user email mỗi query cho provenance + analytics
- Rate limit per-user ~100 queries/day (Gemini 15 RPM global là bottleneck thật)

### Zero-match handling: Hard empty + suggest topics
- Khi LLM không confident match: render empty state "Không tìm thấy dataset phù hợp"
- Suggest 3-4 topics phổ biến (kinh tế, dân số, bầu cử, khí hậu) → click pre-fill query
- KHÔNG fake match với low confidence — transparency quan trọng cho journalism

### Logging: R2 JSON append-only
- Pattern consistent với Phase 1 download counter (`_counters/<slug>.json`)
- File `logs/chat/<YYYY-MM-DD>.json` — append-only array
- Provenance: mỗi entry có user_email + timestamp + query + response summary

### No cache MVP
- Mỗi query hit Gemini API
- OK cho 1500 RPD free tier
- Cache (TTL 24h hoặc invalidate khi metadata commit) = opt-in Phase 3 nếu cost tăng

## Context

### Tại sao Phase 2 tồn tại
Phase 1 DELIVERED 2026-07-24 (`docs/phase-1.md`). Catalog upload/browse/preview/auth/article-linking/download-counter đã ship. Phase 2 = layer tiếp theo: cho phép phóng viên **hỏi câu hỏi tự nhiên** về data thay vì browse/filter manually.

### Tại sao Tier 1 (Metadata Q&A) chứ không Full Data Q&A
- Full Q&A (NL→SQL + DuckDB query) cần guardrails phức tạp (read-only DB level, row limit, timeout, verify loop) — Phase 3e
- Tier 1 = cầu nối giá trị cao / phức tạp thấp
- Pivot từ Discovery cards (user feedback 2026-07-24): phóng viên muốn câu trả lời, không phải list datasets
- Tier 2 (Full Q&A) pickup ở Phase 3e sau khi có signal từ Phase 2

### Constraints
- Vietnamese-first (UI + output) — terminology English OK (Dataset, Data Dictionary, slug)
- Journalism tone register — rõ ràng, không marketing
- Internal tool, 5-10 users
- Mỗi câu trả lời phải cite được dataset cụ thể (provenance)
- Mỗi con số trong answer phải trace được (KHÔNG bịa con số — nếu không biết, nói "không có data")
- Backup plan: skip Phase 2 nếu LLM free tier không fit

## Stakeholder Notes

- **Hoa (Reporter)** — User chính. Non-technical, cần câu trả lời tiếng Việt tự nhiên + link tới dataset để tự verify. Single-shot Q&A + suggested prompts giảm friction. Cần empty state rõ khi không match để không waste time.
- **Minh (Editor)** — Upload dataset → muốn biết dataset có được discover không qua chat. Thumbs up/down feedback loop giúp improve. Có thể dùng chat để verify metadata quality (câu trả lời có nhắc tới dataset mới upload?).
- **Ninh (Data Journalist)** — Power user + curator. Curate eval gold set. Review logs để catch miss patterns → adjust prompts hoặc push upgrade (Postgres FTS / BM25+rerank / Vector) khi cần. Verifier Vietnamese-first output compliance.
