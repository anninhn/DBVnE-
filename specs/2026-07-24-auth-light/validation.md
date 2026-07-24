# Phase 1 (deferred) Validation — Auth nhẹ

## Definition of Done

All must be true before merging vào main.

### 1. Code quality

- `npx tsc --noEmit` exit 0 — không TypeScript error.
- `npm run lint` (nếu có) — không error mới.
- Dependency mới chỉ: `next-auth@5.0.0-beta.32` (PIN exact, không `^`), `bcryptjs`, `@types/bcryptjs`.

### 2. App runs

- `npm run dev` start OK trên `http://localhost:3000` không crash.
- Browse `/` không cần login — catalog render đầy đủ (smoke test existing flow không vỡ).
- Browse `/datasets/[slug]` không cần login — detail page render đầy đủ (preview, dictionary, files).

### 3. Login flow

- `/login` render form tiếng Việt ("Tên đăng nhập", "Mật khẩu", "Đăng nhập").
- Login đúng (`ninh` + đúng password) → redirect về `next` param hoặc `/`.
- Login sai password → form hiển thị lỗi "Sai tên đăng nhập hoặc mật khẩu", không redirect.
- Session cookie có flags: `httpOnly`, `secure` (prod), `sameSite=lax`. Verify qua DevTools → Application → Cookies.
- Persistent login: login → close browser → mở lại → vẫn logged in (verify `maxAge: 10 năm`). User không cần nhớ password sau khi login lần đầu.
- Logout xóa session cookie, redirect về `/`.

### 4. Auth wrap write routes

Test với curl không session cookie:

```bash
curl -i -X POST http://localhost:3000/api/upload/presign \
  -H "Content-Type: application/json" -d '{}'
# Kỳ vọng: 401 {"error":"Unauthorized"}

curl -i -X POST http://localhost:3000/api/dataset/delete \
  -H "Content-Type: application/json" -d '{"slug":"test"}'
# Kỳ vọng: 401
```

Tương tự cho `/api/upload/analyze`, `/api/upload/commit`, `/api/dataset/edit` — tất cả return 401 nếu không login.

### 5. Page-level auth middleware

- `GET /upload` không có session cookie → redirect 302 `/login?next=/upload`.
- `GET /upload` có session → render wizard UI bình thường.
- `GET /` (public) → render OK không redirect.
- `GET /datasets/[slug]` (public) → render OK không redirect.

### 6. Public read routes vẫn mở + không leak deleted

```bash
curl http://localhost:3000/api/datasets  # 200, JSON dataset list KHÔNG chứa status: deleted
curl http://localhost:3000/api/tags       # 200, JSON tags array
```

Verify response `/api/datasets` filter dataset có `status === "deleted"` ở API layer (không chỉ UI).

### 7. Actor tracking trong metadata.yaml

Sau khi login + upload 1 dataset test (`grdp-test.csv`):

- `datasets/grdp-test/metadata.yaml` phải có field:
  ```yaml
  uploaded_by: ninh
  uploaded_at: 2026-07-24T...Z
  ```
- Detail page `/datasets/grdp-test` hiển thị "Đăng bởi **Ninh** • <relative time>" trong MetadataSidebar (đọc TOP-LEVEL `dataset.uploaded_by`, không phải `dataset.resources[].uploaded_by`).

Sau khi login + edit metadata (vd đổi description):

- `metadata.yaml` có thêm:
  ```yaml
  last_edited_by: ninh
  last_edited_at: 2026-07-24T...Z
  edits:
    - by: ninh
      at: 2026-07-24T...Z
      summary: <auto từ diff hoặc "Edit metadata">
  ```
- Detail page hiển thị "Chỉnh sửa lần cuối bởi **Ninh** • <time>".

### 8. Soft delete (work ở cả dev lẫn prod)

- **NODE_ENV guard đã xóa** trong `src/app/api/dataset/delete/route.ts` (verify grep không còn `NODE_ENV === "production"`).
- Sau khi login + delete 1 dataset test:
  - `metadata.yaml` có:
    ```yaml
    status: deleted
    deleted_by: ninh
    deleted_at: 2026-07-24T...Z
    ```
  - Listing `/` KHÔNG hiển thị dataset đã delete.
  - Detail page `/datasets/<slug>` → 404 hoặc redirect (không render content).
  - `datasets/_audit/delete.log` có entry mới: `<ISO> | ninh | <slug> | <reason>`.
  - Raw file vẫn còn trong R2 (verify qua R2 dashboard hoặc `aws s3 ls`).
  - Folder `datasets/<slug>/` vẫn còn trong GitHub (chỉ thêm field `status`, không xóa file).
- Test trên Vercel preview deploy (NODE_ENV=production) — soft delete vẫn work, không bị guard block.

### 9. Hard delete workflow

- `node tools/cleanup-orphans.mjs --include-deleted` (dry-run) → report dataset có `status: deleted` sẽ purge.
- `node tools/cleanup-orphans.mjs --include-deleted --apply` → folder GitHub + R2 object bị xóa thật.
- Dataset purged không còn trong listing/API/git repo.
- Entry trong `datasets/_audit/purge.log` ghi lại action.

### 10. Security baseline

- Password KHÔNG plaintext trong `users.json` — phải là bcrypt hash với prefix `$2b$12$` (cost 12, không cost 10).
- Session cookie `httpOnly: true` (DevTools Application tab).
- Production cookie `secure: true` (verify trên Vercel deploy).
- Login form có CSRF protection — NextAuth v5 built-in, verify `next-auth.csrf-token` cookie tồn tại sau khi load `/login`.
- `AUTH_SECRET` không xuất hiện trong `.env.example` (chỉ comment hướng dẫn), không log, không commit.
- App crash clear error nếu `AUTH_SECRET` missing (không silently fallback).
- Password policy: user mới có password ≥12 ký tự (admin enforce khi tạo).

### 11. Backfill dataset cũ

- Chạy `node tools/backfill-actor.mjs` (dry-run) → report dataset thiếu `uploaded_by`.
- Chạy `--apply` → dataset cũ có `uploaded_by: ninh` + `uploaded_at: <git first-commit-date>`.
- Hoặc accept "unknown" trong UI nếu skip backfill (document trong CLAUDE.md).

## Not Required

- ❌ Automated tests (project chưa có test runner setup).
- ❌ Browser cross-browser testing (Chrome đủ).
- ❌ Performance benchmark (internal tool, login latency < 500ms OK — bcrypt cost 12 chậm hơn cost 10).
- ❌ User management UI (defer — admin edit `users.json` manual).
- ❌ Password reset flow (defer — admin reset manual).
- ❌ OAuth / magic link (out of scope).
- ❌ Role-based access control (defer — single role "logged in" đủ).
- ❌ Rate limiting login (defer enterprise feature — Vercel edge DDoS protection cơ bản đủ).
- ❌ 2FA, email verification, account lockout.
