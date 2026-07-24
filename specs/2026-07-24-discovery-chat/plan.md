# Phase 2 Plan — Discovery Chat

## Group 1 — Foundation (metadata flattening + Gemini client reuse)

1. **Document env var mới** trong `.env.example` và README: `GEMINI_API_KEY` (hoặc `AI_BASE_URL` + `AI_MODEL` + `AI_ENV_VAR` swap pattern). Gemini OpenAI-compatible endpoint: `https://generativelanguage.googleapis.com/v1beta/openai/`, model `gemini-2.0-flash-exp`.
2. **Create `src/lib/chat/flatten-metadata.ts`** — function `flattenAllDatasets(): Promise<string>` đọc tất cả `datasets/*/metadata.yaml` + `dictionary.md` qua GitHub Contents API (pattern Phase 1) → flatten thành text ~300-400 tokens/dataset. Format per dataset: `## <title>\n<description>\nTags: ...\nColumns:\n- <name> (<type>): <description from dictionary>\n`. Cấu trúc stable cho LLM parsing.
3. **Create `src/lib/chat/gemini-client.ts`** — OpenAI SDK v6 wrapper (reuse pattern Phase 1 `dataset-reviewer.ts`). Export `streamDiscoveryChat(query, flattenedMetadata)` trả về AsyncIterable JSON chunk. System prompt Vietnamese-first. JSON mode nếu Gemini OpenAI endpoint support, fallback prompt-based JSON instruction.
4. **Create `tools/prompts/discovery-chat.md`** — system prompt template (version controlled). Nội dung: "Bạn là data librarian VnExpress. Đọc metadata datasets. Trả lời câu hỏi phóng viên bằng tiếng Việt + cite dataset cụ thể + cột cụ thể. KHÔNG bịa con số. Output JSON schema: {answer, datasets[], follow_ups[]}."

## Group 2 — API route + logging

5. **Create `src/app/api/chat/discovery/route.ts`** — POST handler:
   - Auth check qua `auth()` (NextAuth v5 pattern)
   - Rate limit check per-user 100/day (đọc từ R2 `logs/chat/_quota/<date>.json`, increment)
   - Flatten metadata (gọi function Group 1)
   - Call Gemini streaming (Group 1)
   - Stream JSON tokens to client (ReadbleStream response)
   - On complete: append entry to R2 `logs/chat/<YYYY-MM-DD>.json`
   - Fallback chain: Gemini error → retry GLM (if `AI_BASE_URL` configured) → Vietnamese error
6. **Create `src/lib/r2/chat-log.ts`** — append-only JSON log helper (reuse `counter.ts` pattern Phase 1). Functions: `appendChatLog(entry)`, `updateChatThumbs(id, thumbs, feedbackText)`, `getDailyQuota(date)`, `incrementDailyQuota(date)`. Path `logs/chat/<YYYY-MM-DD>.json` + `logs/chat/_quota/<YYYY-MM-DD>.json`.
7. **Create `src/app/api/chat/feedback/route.ts`** — POST `{ query_id, thumbs, feedback_text? }` → update R2 log entry tương ứng qua `updateChatThumbs`. Auth required.

## Group 3 — UI page + components

8. **Create `src/app/hoi-du-lieu/page.tsx`** — dedicated page:
   - `export const dynamic = "force-dynamic"` (Phase 1 lesson — tránh 404 cache)
   - `export const runtime = "nodejs"` (Node SDK compatibility, hoặc edge nếu streaming OK)
   - Login check via server component + redirect `/login?callbackUrl=/hoi-du-lieu`
   - Render ChatBox client component
9. **Create `src/components/chat/ChatBox.tsx`** — main chat client component:
   - State: input, response (parsing JSON stream), loading, error
   - Initial render: suggested prompts showcase (3-4 prompts hardcoded hoặc fetch from `eval/gold-questions.json` sample)
   - Submit → fetch POST `/api/chat/discovery` → parse stream JSON incremental
   - Render: answer (react-markdown) + CitationCard list + FollowUpPills + ThumbsFeedback
   - Handle `?prefill=<slug>` URL param — fetch dataset title + auto-fill query
10. **Create `src/components/chat/CitationCard.tsx`** — mini DatasetCard:
    - Props: `{ slug, title, reason, confidence }`
    - Title là `<Link>` → `/datasets/<slug>`
    - Confidence badge: High (green), Medium (yellow), Low (gray)
    - Reason text 1 câu
    - Compact (mini variant DatasetCard)
11. **Create `src/components/chat/FollowUpPills.tsx`** — render `follow_ups[]` as pill buttons. Click → call `onSelect(followUp)` callback (ChatBox pre-fill input + auto-submit).
12. **Create `src/components/chat/ThumbsFeedback.tsx`** — 👍/👎 buttons. Click 👎 → expand text input "Câu trả lời sai ở đâu?" → submit qua `/api/chat/feedback`. Disable sau khi submit.
13. **Create `src/components/chat/EmptyState.tsx`** — render khi response.datasets = []: "Không tìm thấy dataset phù hợp" + 3-4 topic pills (Kinh tế, Dân số, Bầu cử, Khí hậu) → click pre-fill query.

## Group 4 — Eval set + cross-linking

14. **Create `eval/gold-questions.json`** — Ninh curate 20-50 gold questions. Schema:
    ```json
    [
      {
        "id": "q001",
        "query": "Dân số HCM 2024?",
        "expected_dataset_slugs": ["dan-so-34-tinh-2024"],
        "expected_answer_pattern": "dân số HCM|9\\.\\d+ triệu|TP\\.HCM",
        "vietnamese_only": true
      }
    ]
    ```
    Mix: simple lookup, synonyms vùng miền (ĐBSCL ↔ Nam Bộ), ambiguous (kinh tế → GRDP/FDI/inflation), zero-match ("xyz123").
15. **Create `scripts/eval-chat.mjs`** — Node script:
    - Read `eval/gold-questions.json`
    - For each: call `/api/chat/discovery` (or direct function import), measure response
    - Accuracy: % queries có `response.datasets[].slug` ⊇ `expected_dataset_slugs`
    - Recall: % expected slugs được cite (avg across queries)
    - Vietnamese compliance: check `response.answer` không có English sentences (regex check)
    - Output `eval/reports/<YYYY-MM-DD>.json` + console summary
16. **Add npm scripts** trong `package.json`: `"eval:chat": "node scripts/eval-chat.mjs"`, `"typecheck": "tsc --noEmit"`.
17. **Cross-linking CTA** — edit `src/components/dataset/MetadataSidebar.tsx`: thêm "Hỏi về dataset này" button/link → `/hoi-du-lieu?prefill=<slug>`. Vietnamese label. lucide icon.

## Group 5 — Navigation + polish

18. **Add nav link** — edit `src/components/` header/nav (tìm component chính, có thể `CatalogNav.tsx` hoặc layout.tsx): thêm "Hỏi dữ liệu" link → `/hoi-du-lieu`. Vietnamese label, lucide icon (MessageCircle hoặc Search).
19. **Quota monitoring** — `incrementDailyQuota` trong route handler Group 2. Warn khi >1200 RPD (80% của 1500) trong console + entry có flag trong R2 log.
20. **Error states UI** — ChatBox handle:
    - API 401 → redirect /login
    - API 429 → "Bạn đã hỏi quá nhiều hôm nay. Quay lại sau."
    - API 500 / Gemini fallback fail → "Tạm không trả lời được. Thử lại sau."
    - Vietnamese error messages.

## Group 6 — Verify

21. **Run `npm run typecheck`** — must exit 0.
22. **Run `npm run build`** — must exit 0 (catch Edge Runtime issues, proxy.ts Next.js 16 function declaration pattern per memory).
23. **Run `npm run dev`** — confirm:
    - `/hoi-du-lieu` load khi đã login, redirect /login khi chưa
    - Suggested prompts visible ở initial state
    - Submit query → streaming response render incrementally
    - Citation cards render với title + badge + reason, click → detail page
    - Follow-up pills click → new query submit
    - Thumbs UI log feedback
24. **Run `npm run eval:chat`** — accuracy ≥ 70% trên gold set baseline.
25. **Manual test zero-match**: submit "xyz123abc" → EmptyState render với topic suggestions.
26. **Manual test fallback**: tắt GEMINI_API_KEY → retry GLM (nếu configured) hoặc Vietnamese error.
27. **Manual test prefill**: từ dataset detail page click "Hỏi về dataset này" → /hoi-du-lieu?prefill=<slug> → ChatBox auto-fill query.
