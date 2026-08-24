# Inter-phase Refactor Requirements — Pre-launch (Internal Newsroom)

> Spec chạy giữa Phase 2 (DELIVERED) và Phase 3 (defer). Không phải Phase 3 — không mở rộng feature, chỉ harden + cleanup trước khi mở rộng user trong tòa soạn.

## Scope

### Security pack
- **Thay xlsx@0.18.5 (frozen trên npm, có CVE) bằng SheetJS CDN tarball 0.20.3** trong `package.json`. Patched CVE-2023-30533 (prototype pollution) + ReDoS. Drop-in API compatible — code không đổi. Affects: `src/lib/datasets/read.ts`, `src/lib/ai/inspect.ts`, `src/app/datasets/[slug]/R2FileViewer.tsx`.
- **Global rate limit `/api/chat/discovery`** — track total queries/day across all users trong R2 quota log, reject khi vượt threshold 1200/day (80% Gemini free tier 1500 RPD, buffer 300 cho retry/eval). Per-user quota 100/day giữ nguyên.
- **Validate R2 object tồn tại trước commit metadata** — trong `/api/upload/commit`, `HeadObject` từ R2 trước khi git commit. Nếu object không tồn tại (vd user upload rồi đóng tab, staging lifecycle expire) → 400 Vietnamese error + log warning. Chống orphan metadata.yaml reference R2 key không tồn tại.

### Code health pack
- **Extract `src/lib/github/contents-api.ts`** — shared helper cho GitHub Contents API fetch (auth + URL construct + base64 decode). DRY 5 chỗ duplicate: `read.ts:fetchRaw`, `list.ts:fetchMetadata`, `user-store.ts:readUsersJson`, `audit-log.ts:readExistingLog`, `delete/route.ts` (inline).
- **Giải type duplication `ColumnStats` / `EditEntry`** — hiện duplicate ở 4 file (`src/lib/types/dataset.ts`, `src/lib/datasets/types.ts` + 2 file khác) để tránh circular import. Consolidate canonical location, các file khác re-export.
- **Split god files**:
  - `src/lib/datasets/read.ts` (524 dòng) → tách preview enrichment (`withPreviewData`, `enrichRowCounts`) ra `src/lib/datasets/enrichment.ts`
  - `src/lib/ai/inspect.ts` (538 dòng) → tách per-format logic (CSV/XLSX/GeoJSON) ra `src/lib/ai/inspect/{csv,xlsx,geojson}.ts`, giữ `inspect.ts` làm dispatcher
  - `src/app/datasets/[slug]/DatasetViewer.tsx` (563 dòng) → tách data preview logic ra `useDatasetPreview` hook + sub-components

### UX/onboarding pack
- **`README.md` root** — project overview, quickstart, env checklist, deployment (Vercel), contributing pointers (SDD workflow trong CLAUDE.md).
- **`.env.example` complete** — tất cả env vars cần thiết: `AUTH_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE`, `AI_BASE_URL`, `AI_MODEL`, `AI_ENV_VAR`, `NEXTAUTH_URL`.
- **Commit `src/app/loading.tsx`** — file local untracked, bug fix navigate-from-AMA per memory `feedback_loading_tsx_pure`. Pure HTML/CSS spinner, không import client component (tránh Suspense recursion).

### docs/phase-2.md wrap-up
- **`docs/phase-2.md`** — mirror structure `docs/phase-1.md` cho Phase 2: feature map (Discovery Chat), architecture snapshot (Gemini 2.5 Flash streaming + R2 log + eval), source-of-truth, known gaps + workarounds (defer GLM fallback, cache, gold set curate tới 20-50 câu).
- **Update `CHANGELOG.md`** — promote `[Unreleased]` → `[Phase 2] - 2026-07-24`, mở section mới `[Unreleased] — Pre-launch Refactor`.

## Out of Scope

- **CSP/security headers** (CSP, HSTS, X-Frame-Options) — internal newsroom scope, không public-facing. Defer tới khi public launch.
- **Atomic counters** cho download/chat log — read-then-write trên R2 JSON không atomic, nhưng acceptable cho low traffic internal (per Phase 1 known gap).
- **Test coverage** (vitest/playwright) — separate effort, defer. Hiện chỉ có eval chat.
- **Error tracking** (Sentry, Vercel Log Drain) — defer.
- **Change-password self-service** — admin-only per user decision 2026-07-24. 7-user internal acceptable, admin hash qua `tools/hash-password.mjs`.
- **Bundle optimization** (dynamic imports, code splitting) — defer.
- **Phase 3 features** (Intelligence, RAG, NL→SQL) — còn defer cho sau khi Phase 2 có traffic data.
- **Mọi thay đổi user-facing behavior** — refactor internals only. UI/UX hiện tại giữ nguyên.

## Decisions

### xlsx source — SheetJS CDN tarball (drop-in compatible)
**Why**: npm `xlsx` package frozen ở 0.18.5 từ 2023 (maintainer chuyển distribution sang CDN riêng). Các CVE (CVE-2023-30533 prototype pollution, ReDoS) đã vá ở 0.19.3 + 0.20.2 nhưng CHỈ available trên `cdn.sheetjs.com`, không bao giờ về npm. Tarball 0.20.3 từ CDN = cùng maintainer, API 100% compatible, chỉ cần đổi `package.json` dependency URL. Không phải adapt code.

**How to apply**: `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` trong `package.json`. `npm install` lại. Verify 3 file consumer (`read.ts`, `inspect.ts`, `R2FileViewer.tsx`) vẫn typecheck + build.

### Change-password — admin-only (status quo)
**Why**: 7-user internal tool. Ninh (admin) hash password qua `tools/hash-password.mjs` khi cần. Self-service UX không worth complexity (API route + UI form + JSON store write qua GitHub commit). Defer tới khi user count vượt ~20 hoặc có public sign-up.

**How to apply**: KHÔNG thêm `/api/auth/change-password` route. Document rõ pattern trong README cho admin onboarding user mới.

### Global rate limit threshold — 1200 queries/day
**Why**: Gemini 2.5 Flash free tier = 1500 RPD. 1200 = 80% buffer cho eval script + retry + dev testing. Per-user quota 100/day × 12 active users = 1200 worst case. Track trong R2 JSON log sẵn có (extension của `logs/chat/<date>.json`).

**How to apply**: `incrementDailyQuota` trong `src/lib/r2/chat-log.ts` return tổng count sau increment. Route check trước khi call Gemini. Exceed → HTTP 429 + body `{error: "Hệ thống đã đạt giới hạn câu hỏi trong ngày. Vui lòng thử lại vào ngày mai."}`.

### R2-exist validation — HEAD object trong commit route
**Why**: Hiện `/api/upload/commit` trust `r2Key` từ client. Nếu user upload tới R2 xong rồi đóng tab trước commit, hoặc staging lifecycle expire sau 24h, metadata.yaml reference R2 key không tồn tại → 404 Broken Link ở preview/download. Atomic check tại commit time fail-fast.

**How to apply**: `HeadObject` từ R2 SDK trước git commit. Cost: 1 R2 API call/commit. Nếu missing → 400 + cleanup staging entry (no-op vì đã expire rồi).

### Type consolidation — `src/lib/datasets/types.ts` canonical
**Why**: Type duplication ở 4 file để tránh circular import giữa `src/lib/types/dataset.ts` (legacy) và `src/lib/datasets/types.ts` (sau re-arch). Cần identify root cause của circular (có thể là `types/dataset.ts` import từ `datasets/` layer). Sau khi extract GitHub Contents API helper (Group 2), có thể circular đã tự resolved → re-export.

**How to apply**: Try canonical ở `datasets/types.ts`, các file khác re-export `export type { ColumnStats, EditEntry } from "@/lib/datasets/types"`. Nếu vẫn circular → giữ duplication nhưng comment rõ root cause.

### loading.tsx — commit existing local file
**Why**: Bug fix local chưa commit per memory `feedback_loading_tsx_pure` (2026-07-24). File đã đúng content (pure HTML/CSS spinner, không import client component). Chỉ cần `git add`.

**How to apply**: `git add src/app/loading.tsx` trong 1 commit refactor.

## Context

- **Phase**: Inter-phase, sau Phase 2 DELIVERED, trước Phase 3 (defer).
- **Audience launch target**: Internal newsroom (7 users hiện tại: 1 admin Ninh + 6 editors). KHÔNG public vnexpress.net.
- **Bar**: Security/stability + code health + onboarding. KHÔNG public-facing hardening (CSP, atomic counters, full test suite).
- **Architecture ổn định**: file-based + R2 + GitHub + NextAuth v5 + Gemini 2.5 Flash. Refactor internals only, không thay đổi substrate.
- **Mục tiêu refactor**: chuẩn bị codebase sạch + ổn định + onboard-able trước khi mở rộng user trong tòa soạn hoặc onboarding dev mới vào project.
- **Động lực**: audit production-readiness cho thấy các gap security (xlsx CVE, no global rate limit, no R2-exist check) + tech debt (5 chỗ duplicate GitHub API, type duplication 4 file, 3 god files 500+ dòng) + onboarding gap (no README, .env.example thiếu).

## Stakeholder Notes

- **Ninh (Data Journalist + admin)**: README + .env.example giúp onboarding dev mới (future hire hoặc contributor). Change-password admin-only OK. Là admin hiện tại, Ninh hash password cho 6 editor qua `tools/hash-password.mjs`.
- **Minh (Editor)**: xlsx CVE fix bảo vệ khi upload file Excel từ nguồn ngoài (GSO, báo cáo đối tác). Nếu editor mở file Excel độc (vd từ email lạ) → trước đây có RCE risk trên Vercel serverless; sau fix không còn.
- **Hoa (Reporter)**: không impact trực tiếp từ refactor (internals only). Hưởng lợi gián tiếp qua stability cao hơn (rate limit chống Gemini quota exhaustion làm chat không chết đột ngột).
