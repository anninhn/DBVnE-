# Phase 1 (deferred) Requirements — Auth nhẹ

## Scope

Auth nhẹ track ai upload/edit/delete dataset. Phase 1 là internal tool cho 3-5 phóng viên/editor early adopter, KHÔNG phải public portal.

### Deliverables

1. **Login + session**
   - `/login` page (username + password form, tiếng Việt)
   - Session cookie httpOnly + secure + sameSite=lax
   - Logout (button ở header khi đã login)
   - Redirect `/login?next=<path>` khi truy cập write route mà chưa login

2. **Track ai làm gì (provenance)**
   - Mỗi write operation (upload/edit/delete) ghi field actor vào metadata.yaml:
     - Upload mới: thêm `uploaded_by: <username>` + `uploaded_at: <ISO>`
     - Edit metadata: thêm `edited_by: <username>` + `edited_at: <ISO>` (append vào `edits[]` history nếu đã có)
     - Delete: log vào file `datasets/_audit/delete.log` (append-only, không xóa vật lý metadata folder — chỉ mark `status: deleted` + actor)
   - Detail page hiển thị "Đăng bởi **<username>** • <relative time>" trong MetadataSidebar

3. **Wrap write routes với auth check**
   - Routes cần auth (return 401 nếu chưa login):
     - `POST /api/upload/presign`
     - `POST /api/upload/analyze`
     - `POST /api/upload/commit`
     - `POST /api/dataset/edit`
     - `POST /api/dataset/delete`
   - Routes vẫn public (read-only):
     - `GET /api/datasets` (listing)
     - `GET /api/tags`
     - `GET /api/dataset/download` (chỉ track download count)
     - `GET /` và `GET /datasets/[slug]` (browse/preview)

## Out of Scope

- ❌ User management UI (/admin, /users) — admin tạo user trực tiếp edit `users.json` + bcrypt hash offline. Defer đến khi >5 user.
- ❌ RBAC roles (admin/editor/reporter) — mọi user đã login có quyền write như nhau. Defer đến Phase 3 khi scale 300 phóng viên.
- ❌ Password reset self-serve — admin reset thủ công (edit `users.json`).
- ❌ 2FA, email verification, account lockout, rate limiting login — defer enterprise features.
- ❌ Public signup — admin mời + tạo account thủ công.
- ❌ OAuth (Google/GitHub) — user chọn credentials provider.
- ❌ Magic link email.

## Decisions

### D1 — NextAuth v5 (Auth.js) credentials provider + JSON file user store

- **Provider**: `next-auth@5.0.0-beta.32` PIN EXACT VERSION (không `^` — v5 vẫn beta, tránh surprise breaking change. Beta.32 là latest tại thời điểm impl, hỗ trợ Next.js 16)
- **User store**: `datasets/_users/users.json` trong GitHub repo (cùng substrate với metadata). Schema:
  ```json
  {
    "users": [
      { "id": "uuid", "username": "ninh", "passwordHash": "$2b$12$...", "displayName": "Ninh", "role": "editor", "createdAt": "2026-07-24T..." }
    ]
  }
  ```
- **Password hash**: **bcryptjs cost factor 12** (không 10 — brute-force resistance tốt hơn nếu repo leak, ~300ms/login acceptable cho internal tool)
- **Password policy**: ≥12 ký tự, không dictionary word. Admin tạo user phải enforce.
- **Session**: JWT strategy, cookie `next-auth.session-token` httpOnly + secure (prod) + sameSite=lax
- **Session expiry**: `maxAge: 10 * 365 * 24 * 60 * 60` (10 năm ≈ vĩnh viễn) — **user không cần nhớ password 1 khi đã login**. Sliding expiration default (mỗi request refresh expiry).
- **Chrome 104+ cookie cap**: Browser truncate cookie max-age tại 400 ngày. Sliding refresh giữ session mãi mãi **nếu user dùng app định kỳ** (< 400 ngày giữa các lần dùng). Nếu user không dùng app > 400 ngày → session expire → login 1 lần rồi lại persistent.
- **Why**: File-based giữ nguyên substrate Phase 1 (không PostgreSQL). NextAuth v5 là standard Next.js App Router, maintain session/CSRF/logout cho ta. JSON file OK cho 3-5 user. Cost 12 + strong password bù đắp window rất dài của session vĩnh viễn.
- **Trade-off accepted**: AUTH_SECRET leak = attacker forge JWT bất kỳ user mãi mãi cho đến khi rotate secret. Cookie steal = session vĩnh viễn. Mitigation: bcrypt cost 12 (đã chốt), strong password ≥12 ký tự (đã chốt), AUTH_SECRET không log/commit (đã chốt).
- **AUTH_SECRET management**: Generate `openssl rand -hex 32`, không commit, không log. Rotation procedure documented trong CLAUDE.md maintenance section.
- **Trade-off**: Multi-user concurrent edit `users.json` có thể race — acceptable vì admin edit hiếm (create user once). Nếu race xảy ra → git commit conflict → admin retry.
- **Risk accepted**: Repo private = bcrypt hash không public. Nếu từng leak → rotate TẤT CẢ password. Strong password policy là primary defense.

### D2 — Actor field thêm vào metadata.yaml

- Field mới trong metadata.yaml common section:
  ```yaml
  uploaded_by: ninh        # username (không displayName — stable)
  uploaded_at: 2026-07-24T14:30:00Z
  last_edited_by: minh     # optional, chỉ có nếu đã edit
  last_edited_at: 2026-07-25T09:00:00Z
  edits: []                # optional history, mỗi entry {by, at, summary}
  ```
- Type update: `DatasetMetadata` trong `src/lib/datasets/types.ts`
- Render: thêm vào `MetadataSidebar` component

### D3 — Delete là soft delete ở cả dev lẫn prod, không xóa vật lý

- **XÓA `NODE_ENV === "production"` guard** trong `src/app/api/dataset/delete/route.ts:25-30` — thay bằng auth check + soft delete logic. Đây là thay đổi security posture quan trọng: trước không ai delete được ở prod, giờ user login có thể soft delete.
- Khi user click delete → API set `status: deleted` + `deleted_by` + `deleted_at` trong metadata.yaml + commit
- Listing/detail skip dataset có `status: deleted`
- Raw file trong R2 KHÔNG xóa (recovery cho đến khi hard delete)
- **Hard delete workflow**: Update `tools/cleanup-orphans.mjs` thêm flag `--include-deleted` — scan dataset có `status: deleted` → hard delete folder GitHub + R2 object. Admin chạy manual sau khi confirm.
- Auth check thay thế guard cũ: `requireUser` helper return 401 nếu chưa login.

### D4 — Audit log cho delete

- File `datasets/_audit/delete.log` (append-only, text)
- Mỗi line: `<ISO> | <username> | <slug> | <reason>`
- Reason là optional (user nhập trong modal confirm delete)
- **Race window note**: 2 user delete cùng lúc (~cùng giây) có thể overwrite line của nhau qua Contents API (read-modify-write không atomic). Mức độ thấp (delete hiếm, 3-5 user). Mitigation: commit message có timestamp + slug để trace git history ngay cả khi log entry mất.

### D5 — Page-level auth qua Next.js middleware

- Tạo `src/middleware.ts` protect pages cần login: `/upload`, `/datasets/[slug]/edit` (nếu có)
- Middleware check session cookie → redirect `/login?next=<path>` nếu chưa login
- API routes dùng `requireUser` helper riêng (không phụ thuộc middleware — defense in depth)
- Public pages: `/`, `/datasets/[slug]`, `/login`, `/api/datasets`, `/api/tags`, `/api/dataset/download`, `/api/auth/*`

## Context

- **Why phase này**: Phase 1 production chạy từ 2026-07-10 không có user identity → không biết ai upload/edit/delete. Tòa soạn có nhiều phóng viên dùng chung, cần accountability. Cũng là tiền đề cho file versioning session sau (cần biết ai tạo version mới).
- **Provenance journalism**: VNExpress publish số liệu phải trace được nguồn — kể cả nguồn nội bộ (ai nhập data). Auth nhẹ bổ sung 1 layer provenance còn thiếu.
- **Tech constraint**: Giữ file-based substrate, không thêm PostgreSQL/Supabase (đã drop 2026-07-09). NextAuth v5 compatible Next.js 15 App Router hiện tại.
- **Tone**: Internal tool — login form đơn giản, không cần branding marketing. Việt ngữ UI ("Đăng nhập", "Đăng xuất", "Tên đăng nhập", "Mật khẩu").

## Stakeholder Notes

- **Minh (Editor)** — cần login để upload/edit dataset mới. Primary user write routes. Cần thấy "ai upload cái này" để follow-up nội bộ.
- **Ninh (Data Journalist)** — power user, login để upload + edit. Cần audit log để verify data source khi cite trong bài.
- **Hoa (Reporter)** — chỉ browse/preview/fact-check. KHÔNG cần login phase này. Read vẫn public.
- **Admin (Ninh doing double duty)** — tạo user mới bằng cách edit `users.json` + bcrypt hash offline (1-liner script `tools/hash-password.mjs`).
