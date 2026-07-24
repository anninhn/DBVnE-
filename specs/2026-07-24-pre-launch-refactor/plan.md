# Inter-phase Refactor Plan — Pre-launch

## Group 1 — Security patches
1. **Swap xlsx source**: đổi `"xlsx": "^0.18.5"` → `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` trong `package.json`. `rm -rf node_modules package-lock.json && npm install`. Verify 3 file consumer (`src/lib/datasets/read.ts`, `src/lib/ai/inspect.ts`, `src/app/datasets/[slug]/R2FileViewer.tsx`) typecheck + import resolved.
2. **Global rate limit backend**: mở rộng `incrementDailyQuota` trong `src/lib/r2/chat-log.ts` để track thêm `totalQueries` field (không chỉ per-user). Return `{ userCount, totalCount }`. Threshold tổng = 1200/day.
3. **Wire global rate limit vào route**: `src/app/api/chat/discovery/route.ts` check `totalCount >= 1200` trước khi call Gemini. Exceed → HTTP 429 + body `{error: "Hệ thống đã đạt giới hạn câu hỏi trong ngày. Vui lòng thử lại vào ngày mai."}`.
4. **R2-exist validation**: trong `src/app/api/upload/commit/route.ts`, thêm `HeadObject({ Key: r2Key })` trước git commit. Catch `NoSuchKey` / 404 → return 400 `{error: "File chưa upload xong hoặc đã hết hạn. Vui lòng upload lại."}`. Log warning cho monitoring.

## Group 2 — Extract GitHub Contents API helper
5. **Tạo `src/lib/github/contents-api.ts`** — exported `fetchContents(path: string, opts?: { raw?: boolean }): Promise<{ content: string; sha: string } | { raw: Buffer }>`封装: GitHub token auth, URL construct (`api.github.com/repos/${REPO}/contents/${path}`), base64 decode, sha tracking. Dùng `@octokit/rest` đã có hoặc fetch thẳng (giữ pattern existing).
6. **Refactor 5 chỗ duplicate** dùng helper mới:
   - `src/lib/datasets/read.ts` (`fetchRaw`)
   - `src/lib/datasets/list.ts` (`fetchMetadata`)
   - `src/lib/auth/user-store.ts` (`readUsersJson`)
   - `src/lib/auth/audit-log.ts` (`readExistingLog`)
   - `src/app/api/dataset/delete/route.ts` (inline fetch ~line 56)

## Group 3 — Resolve type duplication
7. **Consolidate `ColumnStats` + `EditEntry`** vào `src/lib/datasets/types.ts` (canonical). Identify root cause circular import — có thể đã tự resolved sau Group 2 (extract helper giảm coupling).
8. **Update `src/lib/types/dataset.ts`** re-export từ canonical: `export type { ColumnStats, EditEntry } from "@/lib/datasets/types"`. Hoặc nếu legacy file không còn được dùng sau refactor → delete + update imports.
9. **Remove comments** "Duplicate ở đây để tránh circular import" ở 4 file đã ghi nhận trong audit.

## Group 4 — Split god files
10. **Extract `src/lib/datasets/enrichment.ts`** — move `withPreviewData`, `enrichRowCounts` (và helpers liên quan) từ `read.ts`. `read.ts` chỉ giữ core read logic.
11. **Split `src/lib/ai/inspect.ts`** — tạo `src/lib/ai/inspect/{csv,xlsx,geojson}.ts` cho per-format inspection. `inspect.ts` giữ dispatcher (`inspectFile(buffer, format)` switch format → delegate).
12. **Split `src/app/datasets/[slug]/DatasetViewer.tsx`** — extract `useDatasetPreview` hook (data fetch + state) + sub-components (PreviewTable, PreviewStats, etc.). `DatasetViewer.tsx` trở thành composition root.

## Group 5 — UX/onboarding
13. **Viết `README.md` root**: project overview (1 đoạn), quickstart (`npm install`, `.env.local` từ `.env.example`, `npm run dev`), env checklist table, deployment (Vercel auto-deploy từ git push), contributing (SDD workflow tham chiếu CLAUDE.md, `/feature-spec` + `/changelog` skills), maintenance scripts (cleanup-orphans, setup-r2-cors).
14. **Update `.env.example`** — full list env vars với comment mô tả mỗi var. Verify bằng `grep -r "process.env\." src/ | sort -u`.
15. **Commit `src/app/loading.tsx`** — `git add` file local đã có (pure HTML/CSS spinner fix navigate-from-AMA bug).

## Group 6 — Documentation
16. **Viết `docs/phase-2.md`** — mirror structure `docs/phase-1.md`:
    - Feature map (Discovery Chat: AMA page, streaming API, R2 log, eval set, suggested prompts, citation cards, thumbs feedback)
    - Architecture snapshot (Gemini 2.5 Flash streaming + R2 JSON log pattern + flatten-metadata cache 60s + X-Chat-Id header)
    - Source-of-truth (`specs/2026-07-24-discovery-chat/`, code locations)
    - Known gaps + workarounds (gold set chỉ 8 câu, GLM fallback defer, cache defer, manual UX tests pending)
17. **Update `CHANGELOG.md`** — promote `[Unreleased] — Phase 2 Discovery Chat` → `[Phase 2] - 2026-07-24`. Mở section mới `[Unreleased] — Pre-launch Refactor`.
18. **Update `constitution/roadmap.md`** — Phase 2 heading có `Status: DELIVERED 2026-07-24`. Thêm Replanning Log row 2026-07-24: "Phase 2 DELIVERED via PR #2 (a9b38ab). Pre-launch refactor inter-phase — không phải Phase 3, không thêm feature."

## Group 7 — Verify
19. Run `npm run typecheck` — must exit 0.
20. Run `npm run build` — must exit 0, all routes compiled (~14 routes).
21. Run `npm run lint` — must exit 0, no new warnings.
22. Run `npm run eval:chat` — verify ≥70% accuracy (Phase 2 baseline), Vietnamese ≥95%. Không regress sau refactor.
23. Manual smoke test (browser localhost:3000):
    - Catalog listing (`/`) render OK
    - Dataset detail (`/datasets/<slug>`) render OK cho CSV + XLSX + GeoJSON dataset
    - Upload wizard (`/upload`) flow end-to-end: presign → drop file → AI analyze → review → commit → redirect detail
    - Chat discovery (`/hoi-du-lieu`) streaming render OK
    - Login + protected route redirect OK
24. Verify security patches:
    - `npm ls xlsx` → resolved URL `https://cdn.sheetjs.com/...`
    - `npm audit` → không còn flag xlsx CVE (chỉ transitive low/mod OK)
    - (Manual) Spike 1201th chat query trong day → 429 response
    - (Manual) Commit với fake r2Key → 400 response
25. Verify documentation consistent: `CHANGELOG.md`, `roadmap.md`, `docs/phase-2.md` phản ánh refactor + Phase 2 DELIVERED.
