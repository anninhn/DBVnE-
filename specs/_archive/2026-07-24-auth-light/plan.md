# Phase 1 (deferred) Plan — Auth nhẹ

## Group 1 — User store + NextAuth setup

1. Cài `next-auth@5.0.0-beta.32` (PIN EXACT, KHÔNG `^`) + `bcryptjs` + `@types/bcryptjs`. Verify trong `package.json`.
2. Tạo `datasets/_users/users.json` với schema `{users: [{id, username, passwordHash, displayName, role, createdAt}]}`. Seed 1 user `ninh` (password hash **bcrypt cost 12**, display "Ninh") làm admin ban đầu. Password gốc ≥12 ký tự, không dictionary.
3. Viết `tools/hash-password.mjs` — CLI 1-liner: nhập password plaintext → in ra bcrypt hash (cost 12) để paste vào `users.json`. Dùng cho admin tạo user mới.
4. Tạo `src/lib/auth/config.ts` — NextAuth config: session strategy `jwt`, cookie prefix `vnexpress-auth`, callbacks `jwt`/`session` để inject username+role vào session. Thêm `trustHost: true` (cần thiết cho Vercel preview deploy). Session `maxAge: 10 * 365 * 24 * 60 * 60` (10 năm ≈ vĩnh viễn — user không cần nhớ password 1 khi đã login). Boundary check: nếu `!process.env.AUTH_SECRET` → throw clear error (không silently fallback).
5. Tạo `src/lib/auth/index.ts` — export `auth`, `handlers`, `signIn`, `signOut` từ NextAuth config. CredentialsProvider `authorize()` đọc `users.json` từ GitHub Contents API, `bcrypt.compare` với `passwordHash` (cost 12). Return `{id, username, displayName, role}` hoặc null.
6. Set env vars: `AUTH_SECRET` (generate `openssl rand -hex 32`), `AUTH_URL` (dev: `http://localhost:3000`, prod: domain Vercel). Update `.env.example` với 2 vars + comment hướng dẫn generate.
7. Tạo `src/app/api/auth/[...nextauth]/route.ts` — re-export `GET`, `POST` từ handlers.

## Group 2 — Login/logout UI

8. Tạo `src/app/login/page.tsx` — server component check session, nếu đã login redirect về `/`. Render form client component.
9. Tạo `src/components/auth/LoginForm.tsx` — form username + password, gọi `signIn("credentials", {redirect: false})`, hiển thị lỗi tiếng Việt ("Sai tên đăng nhập hoặc mật khẩu"), redirect `next` param sau login OK.
10. Sửa `Header` (hoặc layout top bar) — nếu session: hiển thị displayName + dropdown "Đăng xuất". Nếu không: ẩn (hoặc link nhỏ "Đăng nhập" cho editor biết).
11. Wrap layout root với `SessionProvider` (cần cho Header component dùng `useSession` client-side). Wrap toàn app, performance impact nhỏ.

## Group 3 — Page-level auth middleware

12. Tạo `src/middleware.ts` — Next.js middleware protect write pages. `matcher` config match `/upload`, `/datasets/*/edit`. Logic: parse session cookie → nếu invalid/missing → redirect `/login?next=<originalPath>`. Public paths: `/`, `/datasets/[slug]`, `/login`, `/api/datasets`, `/api/tags`, `/api/dataset/download`, `/api/auth/*`.

## Group 4 — Wrap write routes + actor tracking

13. Viết `src/lib/auth/requireUser.ts` — helper cho API route: đọc session từ `auth()`, nếu null → return 401 JSON `{error: "Unauthorized"}`, else return user object. Dùng cho mọi write route (defense in depth — không phụ thuộc middleware).
14. Wrap 5 write routes với `requireUser`:
    - `src/app/api/upload/presign/route.ts`
    - `src/app/api/upload/analyze/route.ts`
    - `src/app/api/upload/commit/route.ts`
    - `src/app/api/dataset/edit/route.ts`
    - `src/app/api/dataset/delete/route.ts`
15. Update `types.ts` — **LƯU Ý `uploaded_by` + `uploaded_at` ĐÃ CÓ** ở `DatasetMetadata:74-75`. Chỉ cần THÊM 6 field mới: `last_edited_by`, `last_edited_at`, `edits[]`, `status`, `deleted_by`, `deleted_at`. Tất cả optional (backward compat với dataset cũ).
16. Update `src/lib/git/commit.ts` (hoặc logic commit trong upload/commit route) — inject `uploaded_by` từ session user vào metadata.yaml trước khi git push. Tương tự cho edit route inject `last_edited_by` + `last_edited_at` + append entry vào `edits[]` history.
17. **Update delete route** — XÓA `NODE_ENV === "production"` guard ở `src/app/api/dataset/delete/route.ts:25-30`. Thay bằng: auth check (requireUser) → soft delete (set `status: deleted` + `deleted_by` + `deleted_at`) → commit metadata → append line vào `datasets/_audit/delete.log` qua Contents API (read existing → append → commit). Commit message có timestamp + slug để trace git history.
18. Update `src/lib/datasets/list.ts` — skip dataset có `status === "deleted"`. Tương tự `read.ts` skip cho detail page (return null → 404).
19. Backfill dataset cũ: script `tools/backfill-actor.mjs` scan `datasets/*/metadata.yaml`, nếu thiếu `uploaded_by` → set `uploaded_by: "ninh"` (default admin) + `uploaded_at: <git first-commit-date ISO>`. Dry-run default, `--apply` để thực thi. Acceptable skip nếu OK để hiện "unknown".

## Group 5 — Display actor trên UI

20. Tạo `src/lib/auth/lookupUser.ts` — helper đọc `users.json` qua GitHub Contents API + map username → displayName. **Cache via React `cache()`** (1 fetch per request, tránh N+1 trong listing). Build `Map<username, displayName>` từ `users.json` (3-5 user, nhỏ).
21. Update `MetadataSidebar.tsx` — thêm section "Người đăng" đọc **`dataset.uploaded_by`** (TOP-LEVEL từ MetadataYaml, KHÔNG phải `dataset.resources[].uploaded_by` đang hardcode "demo" ở `read.ts:165-166`). Hiển thị displayName lookup + relative time. Nếu có `last_edited_*`, hiển thị thêm "Chỉnh sửa lần cuối bởi **X** • <time>".
22. (Optional) Update `EditDatasetForm` — sau edit OK, show toast "Đã lưu — bạn (Minh) cập nhật lúc <time>".

## Group 6 — Update cleanup script

23. Update `tools/cleanup-orphans.mjs` — thêm flag `--include-deleted`. Khi set: scan dataset có `status === "deleted"` trong metadata.yaml → hard delete folder GitHub + R2 object. Dry-run default, `--apply` để thực thi. Log từng dataset purged vào console + `datasets/_audit/purge.log`.

## Group 7 — Verify

24. Chạy `npm run typecheck` (hoặc `npx tsc --noEmit`) — exit 0, không error.
25. Chạy `npm run dev`, mở `http://localhost:3000` — browse catalog OK không cần login (smoke test existing flow không vỡ).
26. Mở `http://localhost:3000/upload` — middleware redirect `/login?next=/upload`. Login với `ninh` + password → redirect về `/upload`.
27. Upload 1 dataset test → mở detail page → "Đăng bởi **Ninh** • <time>" hiển thị đúng trong MetadataSidebar (đọc top-level uploaded_by, không phải resource level).
28. curl `POST /api/upload/presign` không có session cookie → response 401 `{"error":"Unauthorized"}`. Tương tự cho 4 write routes còn lại.
29. curl `GET /api/datasets` → 200, JSON list KHÔNG chứa dataset có `status: deleted` (verify filter ở API layer, không chỉ UI).
30. Click "Đăng xuất" → session clear → truy cập `/upload` lại bị redirect login. Close browser, mở lại sau khi login persistent → vẫn logged in (verify maxAge 30 ngày).
31. Test edit flow → metadata.yaml có field `last_edited_by` + `last_edited_at` + entry mới trong `edits[]` sau commit.
32. Test delete flow → metadata.yaml có `status: deleted`, listing ẩn dataset, detail 404, `_audit/delete.log` có entry mới.
33. Test hard delete: `node tools/cleanup-orphans.mjs --include-deleted` (dry-run first) → report dataset sẽ purge. `--apply` → folder GitHub + R2 object bị xóa.
34. Verify bcrypt cost 12: login takes ~300ms (acceptable). Verify password hash trong `users.json` có prefix `$2b$12$` (không `$2b$10$`).
35. Verify session cookie flags qua DevTools: `httpOnly: true`, `secure: true` (prod), `sameSite=lax`. Verify NextAuth CSRF cookie `next-auth.csrf-token` tồn tại.
