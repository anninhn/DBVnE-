# Phase 2 — Discovery Chat

**Trạng thái**: Hoàn thành 2026-07-24 · Production-ready trên Vercel · Merged main qua PR #2 (a9b38ab)

Tài liệu chính thức đóng gói Phase 2 — mục tiêu, kiến trúc, feature map, out-of-scope, source-of-truth. Tham chiếu cho onboarding / handoff / planning Phase 3.

---

## Mục tiêu

**Discovery Chat — Metadata Q&A**: phóng viên hỏi câu hỏi tiếng Việt tự nhiên về data tòa soạn → LLM đọc metadata + data dictionary của tất cả datasets → trả lời dạng text + cite dataset cụ thể + suggest follow-up prompts.

Tier 1 (Metadata Q&A) — KHÔNG query data rows. Tier 2 (Full Q&A với NL→SQL + DuckDB) đẩy Phase 3e. Pivot từ Discovery cards (user feedback 2026-07-24): phóng viên muốn câu trả lời, không phải list datasets.

Recap đầy đủ: `constitution/mission.md`, `constitution/tech-stack.md`, `constitution/roadmap.md`, `specs/2026-07-24-discovery-chat/`.

## Trạng thái

- **Production**: Vercel auto-deploy từ `main`, dynamic SSR
- **Eval baseline** (2026-07-24, 8 gold questions): 87.5% success rate · 100% accuracy on cited slugs · **42.9% recall** · 100% Vietnamese compliance
  - ⚠️ Cặp **accuracy 100% / recall 42.9%** là đặc điểm quan trọng nhất: hệ thống KHÔNG bịa dataset, nhưng BỎ SÓT hơn một nửa dataset lẽ ra phải tìm được. Với người dùng đây là kiểu sai khó nhận ra nhất — câu trả lời trông đáng tin nên không ai nghĩ là còn thiếu.
  - Đo khi catalog có 8 dataset; hiện có 17 → **số đã cũ, cần chạy lại**. Xem `specs/004-discovery-chat/` FR-027.
- **Milestone**: CHANGELOG.md entry 2026-07-24, PR #2 merged a9b38ab
- **Model**: Gemini 2.5 Flash free tier (1500 RPD, 1M tokens/day) qua OpenAI-compatible endpoint

## Kiến trúc (Architecture Snapshot)

| Layer | Technology |
|-------|------------|
| Page | `/hoi-du-lieu` (login required — bảo vệ qua `auth.config.ts`) |
| API route | `POST /api/chat/discovery` — Node runtime streaming, JSON structured output |
| LLM | Gemini 2.5 Flash qua `openai` SDK v6 + `AI_BASE_URL`/`AI_MODEL`/`AI_ENV_VAR` swap pattern (consistent Phase 1, không thêm dependency) |
| Context | Flatten metadata + dictionary tất cả datasets (~300-400 tokens/dataset) — full context, no pre-filter |
| Output schema | `{ answer, datasets[], follow_ups[] }` — JSON structured, parse + render HTML incremental |
| Logging | R2 JSON append-only `logs/chat/<YYYY-MM-DD>.json` (reuse Phase 1 counter pattern) |
| Feedback | `POST /api/chat/feedback` — 👍/👎 + text, append vào entry log |
| Eval | `scripts/eval-chat.mjs` + `eval/gold-questions.json` (8 câu) → `eval/reports/<date>.json` |
| Quota | Per-user ~100 queries/day + global hard limit 1200/day (80% của 1500 RPD Gemini) |

**Data plane**: GitHub fetch metadata (flatten) → LLM call streaming → JSON parse → UI render + R2 log append.

## Feature Map (Shipped)

### User-facing

| # | Feature | Files chính | Notes |
|---|---------|-------------|-------|
| 1 | **AMA Page (ChatGPT-style)** | `src/app/hoi-du-lieu/page.tsx`, `src/components/chat/ChatBox.tsx` | Centered pill input + capability hints (Tìm dataset / Khám phá / Gợi ý cho đề tài) + random greeting + casual placeholder per mount (dùng `useEffect` thay `useMemo` tránh hydration mismatch) |
| 2 | **Discovery API (streaming)** | `src/app/api/chat/discovery/route.ts`, `src/lib/chat/{extract-json,flatten-metadata}.ts` | Gemini 2.5 Flash streaming, JSON extraction robust (handle markdown fence + conversational wrap). Per-user + global quota check `Promise.all` |
| 3 | **Citation Card + Follow-up Pills + Feedback** | `src/components/chat/{CitationCard,FollowUpPills,ThumbsFeedback,EmptyState}.tsx` | Mini DatasetCard (title link + confidence badge + reason). Follow-up click pre-fill + submit. 👍/👎 + optional text feedback khi 👎 |
| 4 | **R2 Chat Log + Feedback Endpoint** | `src/lib/r2/chat-log.ts`, `src/app/api/chat/feedback/route.ts` | Append-only array per day. Schema: `{ id, timestamp, user_email, query, answer_summary, datasets_cited[], thumbs, feedback_text, latency_ms }` |
| 5 | **Cross-linking CTA** | `src/app/datasets/[slug]/MetadataSidebar.tsx` | "Hỏi về dataset này" → `/hoi-du-lieu?prefill=<title>` — pre-fill input, KHÔNG auto-submit (user agency) |
| 6 | **Nav Link + Beta Badge** | `src/components/CatalogNav.tsx` | Header "Hỏi dữ liệu" + beta badge (thay Coming soon placeholder) |
| 7 | **Eval Suite** | `scripts/eval-chat.mjs`, `eval/gold-questions.json`, `eval/reports/2026-07-24.json` | 8 gold questions. Run `npm run eval:chat`. Baseline: 87.5% success, 100% accuracy, **42.9% recall**, 100% Vietnamese |

### Internal

- **Prompt engineering**: `tools/prompts/discovery-chat.md` — system prompt với Vietnamese-first + journalism tone + zero-match honesty constraints
- **JSON extraction**: `src/lib/chat/extract-json.ts` — robust parse handle markdown fence + conversational wrap (LLM thỉnh thoảng bao JSON trong prose)
- **Context flatten**: `src/lib/chat/flatten-metadata.ts` — build compact context từ metadata + dictionary (uses GitHub Contents API helper refactor 2026-07-24)

## Out of Scope (Explicit Deferred)

### Phase 3e (NL→SQL Schema-Aware)

- **Full Data Q&A** (con số cụ thể từ dataset rows) — cần NL→SQL + DuckDB query + guardrails (read-only, row limit, timeout, verify loop)
- **Multi-turn conversation** với memory context
- **Chart builder, SQL panel, query templates**

### Phase 3f (Optional Extensions)

- **Vector DB / semantic search** trên metadata — trigger: catalog >100 + fuzzy intent ("kinh tế Nam Bộ" → "ĐBSCL")
- **BM25 + rerank** — khi keyword match miss pattern
- **Caching common queries** (TTL 24h hoặc invalidate khi metadata commit)

### Post-Phase 3 / Out of roadmap

- Anonymous access (login required — internal tool)
- Recent/popular queries display (suggested prompts showcase only)
- Per-user quota admin UI (log only MVP)
- Multi-file/multi-format upload (defer phase sau)
- AI observations Tier 1 (defer từ Phase 2 backlog 2026-07-16)

## Known Gaps (Workaround hiện tại)

| Gap | Workaround | Spec đề xuất |
|-----|-----------|--------------|
| Single-shot Q&A (không memory context) | Mỗi câu độc lập, user phải include context đầy đủ nếu follow-up cần dataset khác | Defer — multi-turn = Phase 3e complexity |
| No caching common queries | Mỗi query hit Gemini API (OK cho 1500 RPD free tier) | Opt-in Phase 3 nếu cost tăng |
| Token pre-filter skipped | Full contextflatten (~20-40K tokens) — over-engineering sớm khi catalog <100 | Pickup khi catalog >100 + miss pattern |
| Recall thấp (42.9% eval) | Avg accuracy cao (100% trên cited) — model chọn 1-2 relevant thay vì exhaustive | Curate gold set đầy đủ hơn + consider rerank khi Phase 3 |
| Thumbs feedback không hiển thị aggregate | Log only — Ninh review logs manual | Defer — admin view Phase sau |

## Source of Truth (Thư mục chính)

| Area | Path |
|------|------|
| Spec | `specs/2026-07-24-discovery-chat/{requirements,plan,validation}.md` |
| Page + components | `src/app/hoi-du-lieu/page.tsx`, `src/components/chat/` |
| API + domain | `src/app/api/chat/{discovery,feedback}/route.ts`, `src/lib/chat/` |
| R2 logging | `src/lib/r2/chat-log.ts` |
| Prompt | `tools/prompts/discovery-chat.md` |
| Eval | `scripts/eval-chat.mjs`, `eval/gold-questions.json`, `eval/reports/` |
| Cross-link | `src/app/datasets/[slug]/MetadataSidebar.tsx` (CTA), `src/components/CatalogNav.tsx` (nav) |
| Auth | `src/auth.config.ts` (protect `/hoi-du-lieu`), `src/proxy.ts` |

## Environment / Deployment

Reuse Phase 1 env vars. Thêm cụ thể cho Phase 2:

| Variable | Purpose |
|----------|---------|
| `AI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai/` (Gemini OpenAI-compat) |
| `AI_MODEL` | `gemini-2.5-flash` (default — swap được) |
| `AI_ENV_VAR` | `GEMINI_API_KEY` (provider key name) |
| `GEMINI_API_KEY` | Server-only — Google AI Studio generate |

- **Quota**: Per-user 100/day (enforced R2 counter), global hard limit 1200/day (80% buffer của 1500 RPD)
- **Vercel env**: tick Production scope cho `GEMINI_API_KEY` (force-dynamic page build không gọi fetch → build xanh dù env thiếu)
- **Fallback chain**: Gemini error/quota → GLM (nếu configured) → hard fail với Vietnamese error message

## Quy ước (Recap)

- Vietnamese-first (UI + LLM output) — terminology English OK (Dataset, Data Dictionary, slug)
- Mỗi câu trả lời phải cite được dataset cụ thể (provenance)
- Mỗi con số trong answer phải trace được — KHÔNG bịa con số, nếu không biết nói "không có data"
- Journalism tone register — rõ ràng, không marketing
- Zero-match honesty: KHÔNG fake match với low confidence → render empty state + suggest topics
- AI naming neutral trong code/UI/spec — gọi "AI" chung chung, không declare GLM/Gemini cụ thể trong UI text

## Phase 3 Entry Point

Phase 3 = **Intelligence Platform**. Core: 3e NL→SQL Schema-Aware (Full Data Q&A) — pickup Tier 2 khi có signal từ Phase 2 logs (user queries hit data rows thay vì metadata). Phase 3f (RAG/semantic layer) optional — trigger khi catalog >100 + fuzzy intent pattern.

- Roadmap đầy đủ: `constitution/roadmap.md` section Phase 3
- Inter-phase refactor (2026-07-24): `specs/2026-07-24-pre-launch-refactor/` — security patches + code health + UX/onboarding
- Start: chạy `/feature-spec` để interview + draft spec
