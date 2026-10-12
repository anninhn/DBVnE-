# Phase 3 Plan — MCP Connector (production)

## Group 1 — Lớp tool chạy được trên serverless
1. `INSIGHT_DATA_DIR` đọc từ env (`INSIGHT_DATA_DIR`, mặc định `data/insight`; trên Vercel `/tmp/insight`)
2. Catalog: `loadCatalog()` đọc R2 `_index/measures.json` khi không có file local; script `tools/build-measures-index.mjs` dựng catalog rồi ghi R2 qua `putObject` của app (cùng cách `_index/retrieval.json`)
3. Kết quả phiên cho `check_answer`: `src/lib/insight/mcp/results-store.ts` — ghi/đọc R2 `_mcp/results/<user-hash>/<result_id>.json`, TTL 24h kiểm khi đọc; `result_id` ngẫu nhiên (không còn đếm r1, r2… theo tiến trình)
4. `callTool(name, args, ctx: { user })` — truyền người dùng; bộ nhớ trong tiến trình chỉ còn là cache

## Group 2 — OAuth
5. `src/lib/oauth/token.ts` — ký / kiểm chuỗi HMAC-SHA256 (`AUTH_SECRET`), loại: client, code, access, refresh; hạn dùng
6. `/.well-known/oauth-protected-resource` và `/.well-known/oauth-authorization-server` (route handler, `force-dynamic`)
7. `POST /api/oauth/register` — nhận `redirect_uris` (chỉ https hoặc localhost), trả `client_id` ký
8. `GET /api/oauth/authorize` — kiểm client + redirect_uri + PKCE S256; chưa đăng nhập → `/login?next=`; trang xác nhận `src/app/oauth/consent/page.tsx` (tiếng Việt, nêu email + "kết quả đi qua Anthropic")
9. `POST /api/oauth/consent` — người dùng bấm Cho phép → redirect về client kèm `code` + `state`
10. `POST /api/oauth/token` — `authorization_code` (kiểm code_verifier, redirect_uri, client) + `refresh_token`
11. `proxy.ts` / `authConfig`: cho `/.well-known/*`, `/api/oauth/*`, `/api/mcp` đi qua middleware đăng nhập (tự xác thực bằng Bearer)

## Group 3 — Endpoint MCP
12. `src/lib/insight/mcp/rpc.ts` — `handleRpc(msg, ctx)` tách từ `tools/insight-data-http.mjs`; bản local dùng lại
13. `src/app/api/mcp/route.ts` — POST: kiểm Bearer → 401 + `WWW-Authenticate`; xử lý một thông điệp hoặc mảng; GET/DELETE → 405; `maxDuration` đủ cho `scan`
14. `instructions` đọc từ module TS (không đọc file lúc chạy) — nguồn chung với `prototypes/insight-demo/claude/CLAUDE.md`

## Group 4 — Verify
15. `npx tsc --noEmit` — không lỗi mới; `npm run lint` — 0 lỗi; `npm run build` — xanh (bắt lỗi chỉ lộ khi build, xem bài học proxy Next 16)
16. Local: luồng OAuth đầy đủ bằng curl (register → authorize khi đã đăng nhập → token → `/api/mcp` tools/list + tools/call)
17. Deploy preview Vercel; thêm custom connector trong Claude Desktop trỏ URL preview; hỏi 2 câu (tỷ lệ sinh miền núi phía Bắc, ly hôn) — có kết quả + `bieu_do`
18. Kiểm các mục trong `validation.md`
