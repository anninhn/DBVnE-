# Phase 2 Validation — Discovery Chat

## Definition of Done

All must be true before merge `phase-2-discovery-chat` → `main`.

### 1. Code quality
- `npm run typecheck` exits 0
- `npm run build` exits 0 (catch Edge Runtime issues, proxy.ts Next.js 16 function declaration pattern)
- `npm run lint` exits 0 — no new ESLint errors
- No new dependencies added (Gemini qua OpenAI SDK đã có)

### 2. App runs
- `npm run dev` starts successfully
- `/hoi-du-lieu` returns 200 khi đã login
- `/hoi-du-lieu` redirects to `/login?callbackUrl=/hoi-du-lieu` khi chưa login
- Catalog `/` và detail `/datasets/[slug]` vẫn hoạt động — no Phase 1 regression
- `/upload` vẫn hoạt động — no regression

### 3. Core functionality — Discovery Chat

**API route `/api/chat/discovery`**:
- POST `{ query: "Dân số HCM 2024?" }` → 200, response JSON có:
  - `answer` non-empty Vietnamese string
  - `datasets[]` array, mỗi item có `slug` + `reason` + `confidence` (high|medium|low)
  - `follow_ups[]` array, 2-4 strings
- POST `{ query: "xyz123abc" }` → 200, response có `datasets: []` và `answer` thông báo no match
- POST không có session → 401
- POST quá 100 queries/day từ cùng user → 429
- Streaming: response stream JSON tokens (verify `curl -N` thấy chunked transfer)

**Logging (R2)**:
- Mỗi query tạo entry trong `logs/chat/<YYYY-MM-DD>.json` với `{id, timestamp, user_email, query, datasets_cited, thumbs:null, latency_ms}`
- Thumbs feedback POST `/api/chat/feedback` cập nhật `thumbs` + `feedback_text` của entry
- Daily quota file `logs/chat/_quota/<YYYY-MM-DD>.json` increment mỗi query

**Eval**:
- `npm run eval:chat` chạy xong không lỗi
- Accuracy ≥ 70% trên gold set
- Recall ≥ 60% (avg)
- Vietnamese compliance ≥ 95%
- Output report ở `eval/reports/<YYYY-MM-DD>.json`

### 4. Decision verification

- **Tier 1 (Metadata Q&A)**: query "Dân số HCM 2024?" trả về text answer + cite dataset (slug = `dan-so-34-tinh-2024` hoặc tương tự), KHÔNG trả con số "9.1M" (đó là Tier 2 Phase 3e). Answer có thể nói "Dataset này có cột `dan_so` có chứa con số bạn cần — click để xem" nhưng KHÔNG bịa con số.
- **Vietnamese output**: `response.answer` là tiếng Việt. Terminology English OK (Dataset, slug, Data Dictionary). Verify bằng regex eval script.
- **JSON structured output**: API response có 3 fields `answer`/`datasets`/`follow_ups` với đúng schema. Validate via zod hoặc manual check.
- **Streaming**: UI render tokens incrementally (không wait-for-complete). Verify bằng observation: text render từng chữ.
- **Citation cards**: mỗi dataset trong `response.datasets` có card preview với title (link → `/datasets/<slug>`) + confidence badge + reason. Click → điều hướng detail page.
- **Suggested prompts**: `/hoi-du-lieu` initial state hiển thị 3-4 prompt showcase buttons (không phải empty).
- **Login required**: access `/hoi-du-lieu` khi chưa login → redirect `/login?callbackUrl=/hoi-du-lieu`.
- **No pre-filter**: trong source code `flatten-metadata.ts`, function flatten **tất cả** datasets (không filter). Verify bằng code review.
- **Hard empty state**: zero-match query ("xyz123abc") → "Không tìm thấy dataset phù hợp" + 3-4 topic suggestions. KHÔNG fake match với low confidence.
- **R2 logging**: mỗi query có entry với `user_email` (provenance) trong R2 log file.
- **No cache MVP**: trong route handler, không có cache layer. Mỗi query flatten metadata mới + call Gemini mới. Verify code review.
- **Cross-linking**: dataset detail page (`/datasets/[slug]`) có button "Hỏi về dataset này" → navigate `/hoi-du-lieu?prefill=<slug>` → ChatBox auto-fill query.
- **Nav link**: header/nav có "Hỏi dữ liệu" link → `/hoi-du-lieu`.
- **Fallback chain**: khi Gemini API error → retry GLM (if configured) → hoặc Vietnamese error message. Verify bằng manual test tắt GEMINI_API_KEY.

### 5. Gemini integration
- Env var `GEMINI_API_KEY` (hoặc `AI_BASE_URL` + `AI_MODEL` + `AI_ENV_VAR`) document trong `.env.example` và README
- OpenAI SDK v6 configured với base URL `https://generativelanguage.googleapis.com/v1beta/openai/` + model `gemini-2.0-flash-exp`
- Free tier quota monitoring: `incrementDailyQuota` mỗi query, warn khi >80% (1200 RPD)
- Server-only key (không expose browser)

## Not Required

- No automated unit tests this phase (eval script thay thế)
- No browser rendering pixel-perfect check — responsiveness OK
- No load testing (5-10 users)
- No A/B testing model quality (ship Gemini default, upgrade sau khi có traffic)
- No multi-turn conversation (single-shot only)
- No cache layer
- No vector DB / semantic search
- No admin quota UI (log only)
- No PDF/MP3/GeoJSON RAG (Phase 3)
- No PDF/MP3/GeoJSON chat support (tabular + geojson metadata only Phase 2)
