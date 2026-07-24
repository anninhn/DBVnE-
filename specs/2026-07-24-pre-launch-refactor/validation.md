# Inter-phase Refactor Validation — Pre-launch

## Definition of Done
Tất cả phải true trước khi merge `refactor-pre-launch` → `main`.

### 1. Code quality
- `npm run typecheck` exits 0.
- `npm run build` exits 0 (all ~14 routes compiled, bao gồm `/hoi-du-lieu` + `/api/chat/*`).
- `npm run lint` exits 0 — không có warning mới (warnings cũ trong eslint.config.mjs OK).

### 2. App runs
- `npm run dev` start OK (no startup error).
- `/` (catalog listing) render OK, không có console error.
- `/datasets/<slug>` render OK cho cả 3 format: CSV (`diem-thi-tot-nghiep-thpt-quoc-gia`), XLSX, GeoJSON (`ranh-gioi-hanh-chinh-34-tinh-thanh-viet-nam`).
- `/upload` wizard flow end-to-end: presign → drop → analyze → review → commit → redirect `/datasets/<new-slug>`.
- `/hoi-du-lieu` streaming chat render OK.
- `/login` + protected route redirect OK (sau login, hard nav tới `/hoi-du-lieu` per memory `feedback_nextauth_post_login_nav`).

### 3. Security patches
- `npm ls xlsx` output resolved URL = `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (KHÔNG phải `0.18.5` từ npm registry).
- `npm audit` — không còn flag CVE cho `xlsx` trực tiếp. Transitive `brace-expansion` (từ `typescript-eslint`) nếu vẫn flag thì note trong CHANGELOG, không blocker.
- Global rate limit: gọi `/api/chat/discovery` lần thứ 1201 trong ngày → HTTP 429 + body `{ "error": "Hệ thống đã đạt giới hạn câu hỏi trong ngày..." }`. Verify bằng cách temp set quota log về 1199 rồi send 2 queries.
- R2-exist validation: POST `/api/upload/commit` với `r2Key` không tồn tại (vd `staging/fake-uuid-1234`) → HTTP 400 + body `{ "error": "File chưa upload xong hoặc đã hết hạn..." }`.

### 4. Code health
- `src/lib/github/contents-api.ts` tồn tại, exported `fetchContents` (hoặc tên tương đương).
- Grep `api.github.com/repos/` trong `src/` chỉ trả về `src/lib/github/contents-api.ts` (1 chỗ, không còn 5 chỗ duplicate).
- `ColumnStats` và `EditEntry` chỉ define 1 lần trong `src/` (grep `type ColumnStats` / `interface ColumnStats` → 1 match).
- Comments "Duplicate ở đây để tránh circular import" không còn trong codebase.
- File size verify:
  - `wc -l src/lib/datasets/read.ts` < 400
  - `wc -l src/lib/ai/inspect.ts` < 400 (dispatcher only)
  - `wc -l src/app/datasets/[slug]/DatasetViewer.tsx` < 400
- `src/lib/datasets/enrichment.ts` tồn tại với `withPreviewData` + `enrichRowCounts`.
- `src/lib/ai/inspect/{csv,xlsx,geojson}.ts` tồn tại (3 file per-format).

### 5. UX/onboarding
- `README.md` tồn tại ở root, có sections: Overview, Quickstart, Env Checklist (table), Deployment, Contributing, Maintenance Scripts.
- `.env.example` có đầy đủ vars: `AUTH_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE`, `AI_BASE_URL`, `AI_MODEL`, `AI_ENV_VAR`, `NEXTAUTH_URL`. Verify bằng `diff <(grep -oE '^[A-Z_]+' .env.example | sort) <(grep -rhoE 'process\.env\.[A-Z_]+' src/ | sort -u | sed 's/process\.env\.//')`.
- `git ls-files src/app/loading.tsx` trả về file path (đã commit, không còn untracked).

### 6. Documentation
- `docs/phase-2.md` tồn tại, có sections tương đương `docs/phase-1.md`: Feature Map, Architecture Snapshot, Source-of-Truth, Known Gaps + Workarounds.
- `CHANGELOG.md` có section `## [Phase 2] - 2026-07-24` (promoted từ Unreleased) + section mới `## [Unreleased] — Pre-launch Refactor` empty hoặc với refactor entries.
- `constitution/roadmap.md` Phase 2 heading có `Status: DELIVERED 2026-07-24`. Replanning Log có row mới.

### 7. Eval không regress
- `npm run eval:chat` exits với success rate ≥70% (Phase 2 baseline per memory `project_phase2_discovery_chat_2026_07_24`). Vietnamese accuracy ≥95%.
- Note: 3/8 fail hiện tại do Gemini 429 quota transient — acceptable, không phải refactor regression. Nếu sau refactor fail rate tăng → investigate.

## Not Required
- Không cần unit tests (vitest/jest) — defer separate effort.
- Không cần E2E tests (playwright) — manual smoke test Group 7 đủ.
- Không cần CSP/security headers — internal newsroom scope.
- Không cần atomic counters — R2 JSON read-then-write acceptable low traffic.
- Không cần error tracking (Sentry) — defer.
- Không cần change-password self-service UI — admin-only per user decision.
- Không cần bundle analyzer / dynamic imports — defer.
- Không cần verify trên Vercel production — local smoke test đủ. Production deploy sau merge.
