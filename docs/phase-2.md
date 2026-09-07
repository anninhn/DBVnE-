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
- **Eval baseline** (2026-07-24, 8 gold questions): 87.5% success rate · 100% Vietnamese compliance.
  Hai chỉ số `accuracy` và `recall` từng ghi ở đây (100% và 42,9%) **không đo chất
  lượng tìm kiếm** — đã sửa 2026-09-04, xem ghi chú ở § Feature Map #7.
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
| Context | **Hybrid retrieval** — `searchDatasets` chọn top-20 ứng viên, `getDataset` lấy mô tả của chúng. Trước 2026-09-04 là nạp metadata TOÀN BỘ kho (xem § Kiến trúc tra cứu) |
| Output schema | `{ answer, datasets[], follow_ups[] }` — JSON structured, parse + render HTML incremental |
| Logging | R2 JSON append-only `logs/chat/<YYYY-MM-DD>.json` (reuse Phase 1 counter pattern) |
| Feedback | `POST /api/chat/feedback` — 👍/👎 + text, append vào entry log |
| Eval | `scripts/eval-chat.mjs` + `eval/gold-questions.json` (8 câu) → `eval/reports/<date>.json` |
| Quota | 500 câu/người/ngày + 5.000 câu/hệ thống/ngày (nâng 2026-09-04 sau khi chi phí mỗi câu giảm 25 lần) |
| Retrieval | Vector 768 chiều (`gemini-embedding-001`) + khớp từ khoá có cân độ hiếm, trộn 50/50. Chỉ mục trên R2 `_index/` |

**Data plane**: `searchDatasets` (vector + từ khoá trên chỉ mục R2) → `getDataset` cho top-20 → LLM call streaming → JSON parse → UI render + R2 log append.

## Kiến trúc tra cứu (spec 005, 2026-09-04)

Phần này thay hẳn cách Discovery Chat lấy ngữ cảnh. Trước: mỗi câu hỏi liệt kê thư
mục `datasets/` rồi đọc `metadata.yaml` + `dictionary.md` của **từng** slug. Đo ở 495
dataset: ~202.000 token và hơn 1.000 lượt gọi GitHub API cho MỘT câu hỏi, tăng tuyến
tính theo số dataset. Sau: ~8.200 token và 41 lượt gọi.

### Ba năng lực tra cứu — `src/lib/retrieval/`

Đặt **ngang cấp** `src/lib/chat/`, không nằm trong: đây không phải việc riêng của
luồng chat (FR-058). Hợp đồng ở `specs/005-discovery-chat-scale/contracts/`.

| Năng lực | Việc | Mặt tiền HTTP (để kiểm) |
|---|---|---|
| `searchDatasets` | Tìm dataset liên quan tới một câu hỏi | `GET /api/retrieval/search?q=` |
| `getDataset` | Lấy mô tả đầy đủ của các slug đã biết | (chưa có, chat gọi trực tiếp) |
| `lookupValue` | Tra một giá trị ra **đầy đủ** dataset chứa nó | `GET /api/retrieval/lookup?value=` |

Mọi lượt gọi được ghi nhận kèm người gọi vào `logs/retrieval/<ngày>.json` (FR-059).

### Hai chỉ mục trên R2 — `_index/`

| File | Nội dung | Kích thước (495 dataset) |
|---|---|---|
| `_index/retrieval.json` | vector 768 chiều (base64 Float32) + token từ khoá + dấu vết metadata | ~1.485 KB |
| `_index/values.json` | chỉ mục nghịch đảo giá trị cột → dataset, slug/tên cột gộp vào bảng chung | ~797 KB |

Cả hai là **dữ liệu sinh ra**, không commit vào git. Dựng lại bất cứ lúc nào:

```bash
node --env-file=.env.local tools/build-retrieval-index.mjs           # xem trước
node --env-file=.env.local tools/build-retrieval-index.mjs --apply   # ghi lên R2
```

Script chỉ sinh vector cho entry **lệch hoặc còn thiếu**, và **in ra từng slug lệch**
trước khi sửa. Đây là phần quan trọng nhất của nó: vector cũ + metadata mới thì hệ
thống vẫn trả lời, chỉ là trả lời sai dataset, và không có triệu chứng nào.

`_index/` đã được thêm vào `PROTECTED_PREFIXES` của `tools/cleanup-orphans.mjs` —
thiếu dòng đó thì script dọn rác coi hai file này là orphan và xoá mất.

### Ba chỗ dễ hiểu sai

**Ngưỡng liên quan không quyết định "kho có dataset này hay không".** Đo trên kho
hiện tại: câu có dataset thật cho cosine cao nhất 0,66–0,77; câu vô quan 0,46–0,62;
**câu chỉ là một tên riêng** (`Đà Nẵng` 0,54 · `Bắc Kạn` 0,52) rơi đúng vào vùng vô
quan. Nên đặt ngưỡng đủ cao để loại "giá Bitcoin" là loại luôn "Đà Nẵng". Việc kết
luận "chưa có dataset" giao cho `lookupValue` (đúng/sai tuyệt đối) và cho model đọc
danh sách ứng viên kèm cảnh báo mức liên quan thấp.

**Danh sách giá trị cột có cờ đầy-đủ/bị-cắt.** `column_stats` lưu tới 200 giá trị mỗi
cột phân loại; cột vượt ngưỡng mang `complete: false`. Bên đọc **không được** kết luận
"không có X" từ một danh sách bị cắt. Metadata viết trước spec 005 không có cờ này —
`isValueListComplete()` so `segments.length` với `distinct` để đọc đúng cả dữ liệu cũ.

**Lịch sử hội thoại để hiểu câu hỏi, không để giới hạn phạm vi.** Câu tìm kiếm ghép
câu hỏi hiện tại + đúng một câu hỏi gần nhất. Ghép cả cuộc trò chuyện thì lượt 3 đổi
chủ đề vẫn bị kéo về chủ đề lượt 1.

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
| 7 | **Eval Suite** | `scripts/eval-chat.mjs`, `eval/gold-questions.json`, `eval/reports/2026-07-24.json` | 8 gold questions. Run `npm run eval:chat`. Baseline: 87.5% success, 100% Vietnamese. **Cảnh báo về hai chỉ số còn lại** — xem dưới |

### Internal

- **Prompt engineering**: `tools/prompts/discovery-chat.md` — system prompt với Vietnamese-first + journalism tone + zero-match honesty constraints
- **JSON extraction**: `src/lib/chat/extract-json.ts` — robust parse handle markdown fence + conversational wrap (LLM thỉnh thoảng bao JSON trong prose)
- **Context flatten**: `src/lib/chat/flatten-metadata.ts` — dựng khối mô tả cho **danh sách slug nhận vào** (đường nạp toàn bộ kho đã xoá 2026-09-04, xem § Kiến trúc tra cứu)

**`accuracy` và `recall` của bộ eval hiện tại không đo được chất lượng tìm kiếm.**
Cả 8 câu trong `eval/gold-questions.json` đều có `expected_dataset_slugs: []`. Với
mảng rỗng, hai công thức trong `scripts/eval-chat.mjs` suy biến:

- `accuracy` = 1 **luôn luôn** (nhánh `expected.length > 0 ? ... : 1`) → "100%
  accuracy" không nói gì cả
- `recall` = 1 chỉ khi câu trả lời **không cite dataset nào**, và = 0 mỗi khi nó cite
  bất cứ thứ gì → con số "42,9%" thực chất là "3 trong 7 câu chạy được đã không cite
  dataset nào" (3/7 = 0,42857)

Hai tên còn bị đặt ngược so với định nghĩa thông thường: cái gọi là `accuracy` là
recall, cái gọi là `recall` là precision. Nên **không có mốc chất lượng tìm kiếm nào**
để so trước/sau spec 005. Muốn có thì phải điền `expected_dataset_slugs` thật cho bộ
câu hỏi trước.

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
| Tra cứu (spec 005) | `src/lib/retrieval/`, `src/app/api/retrieval/`, `tools/build-retrieval-index.mjs`, `specs/005-discovery-chat-scale/` |
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
