# Tech Debt Backlog

Tech debt + small improvements tracked sau từng session. Không phải feature spec — chỉ ghi rõ context + acceptance criteria để session sau có thể nhặt lên mà không cần đọc lại git history.

---

## TD-001 — Migrate Google Fonts sang `next/font/google`

**Source**: Phát hiện session Next.js 16.2.11 upgrade (`chore-nextjs-upgrade`, commit `90945b6`).

**Status**: Open

**Why**: ESLint rule `@next/next/no-page-custom-font` flag `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` trong `src/app/layout.tsx`. Rule không block build (warning) nhưng pattern suboptimal:

- Third-party request tới `fonts.googleapis.com` + `fonts.gstatic.com` → thêm DNS lookup + connection setup, ảnh hưởng LCP/FCP.
- `next/font/google` tự self-host + preload + inject CSS variable → loại bỏ third-party request, giảm CLS.
- Visual **không đổi** — cùng font family + weights + Vietnamese subset.

**Scope**:

- Font giữ nguyên hoàn toàn:
  - **Source Sans 3** (body): weights `300; 400; 500; 600; 700`, subsets `["latin", "vietnamese"]`
  - **IBM Plex Mono** (code/data): weights `400; 500; 600`, subsets `["latin", "vietnamese"]`
- Files affected:
  - `src/app/layout.tsx` — import `Source_Sans_3` + `IBM_Plex_Mono` từ `next/font/google`, attach CSS variable className vào `<html>`, xóa 3 `<link>` tags trong `<head>`
  - `src/app/globals.css` — update `--font-sans` + `--font-mono` để reference CSS variable từ `next/font` thay vì tên font trực tiếp
- Validation:
  - Visual:diff screenshot trước/sau — không có thay đổi font
  - Vietnamese subset load OK (chữ dấu như "đ", "ơ", "ạ" render đúng)
  - Network tab: không còn request tới `fonts.googleapis.com` / `fonts.gstatic.com` ở production build
  - Lighthouse: LCP/FCP cải thiện hoặc ít nhất không tệ hơn

**Risk**: Thấp. `next/font/google` là drop-in replacement, được Next.js khuyến nghị. Vietnamese subset có sẵn cho cả 2 font.

**References**:
- [Next.js docs — next/font/google](https://nextjs.org/docs/app/api-reference/components/font)
- Current eslint warning context: commit `90945b6`
