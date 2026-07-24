# VnExpress Data Platform

Nền tảng dữ liệu nội bộ cho tòa soạn VnExpress — upload, browse, preview, và thảo luận dataset (CSV, XLSX, GeoJSON). Dataset-centric, file-based, zero database.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 App Router, React 19, TypeScript, Tailwind v4 |
| Metadata (source of truth) | GitHub repo `datasets/<slug>/metadata.yaml` qua Contents API |
| Binary files | Cloudflare R2 (presigned upload/download) |
| Auth | NextAuth v5 credentials + JSON user store (git-tracked) |
| AI | OpenAI-compatible — swap-able qua 3 env vars (default: Gemini 2.5 Flash) |

Không PostgreSQL. Mọi read/write đi qua GitHub Contents API (metadata) hoặc R2 SDK (binaries).

## Quickstart

```bash
# 1. Clone + install
git clone <repo-url> && cd DB_VNExpress
npm install  # cài xlsx từ SheetJS CDN tarball (CVE-patched 0.20.3)

# 2. Env
cp .env.example .env.local
# điền các giá trị (xem "Environment variables" bên dưới)

# 3. Dev
npm run dev  # http://localhost:3000

# 4. Production build
npm run build && npm start
```

## Environment variables

Xem `.env.example` cho full list + comment. Tối thiểu để chạy dev:

| Var | Mục đích |
|-----|----------|
| `GITHUB_TOKEN` | PAT scope `contents:write` + `metadata:read` — đọc/ghi metadata.yaml |
| `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_REPO_BRANCH` | Repo chứa folder `datasets/` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Cloudflare R2 SDK |
| `R2_PUBLIC_BASE` | R2 public URL hoặc custom domain — **bắt buộc cho production** (presigned download) |
| `AUTH_SECRET` | JWT signing key — generate `openssl rand -hex 32` |
| `AUTH_URL` | Base URL app (dev: `http://localhost:3000`, prod: `https://<domain>`) |
| `AI_BASE_URL`, `AI_MODEL`, `AI_ENV_VAR` | Swap provider (default Gemini). Set key tương ứng (`GEMINI_API_KEY` / `ZAI_API_KEY`) |

Optional (chỉ nếu dùng tags table):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

**Vercel**: Mọi env var phải tick **Production** scope. Force-dynamic page build không gọi fetch → build xanh dù env thiếu, lỗi 500 chỉ lộ runtime.

## Deployment

Auto-deploy từ branch `main` qua Vercel. Mọi page dùng `export const dynamic = "force-dynamic"` (SSR) vì fetch external data (GitHub/R2).

## Architecture

Đọc chi tiết:
- `constitution/mission.md` — personas, motivation, scope boundaries
- `constitution/tech-stack.md` — dataset-centric architecture, conventions
- `constitution/roadmap.md` — Phase 1 ✅ → Phase 2 ✅ → Phase 3
- `docs/phase-1.md`, `docs/phase-2.md` — feature map shipped

### Key conventions

- **Dataset-centric**: mọi thứ xoay quanh dataset. Không redesign qua phases.
- **Văn phong tiếng Việt** trong code comments và UI text.
- **Hybrid language**: terminology/nouns English (Dataset, Data Dictionary), verbs + error messages Việt.
- **Branding "VnExpress"** (camelCase) trong mọi UI text — không phải "VNExpress".
- **JSONB keys** phải khớp `data_dictionary` — không tự do đặt tên.
- **Tags** chọn từ controlled vocabulary (`tags` table) — không gõ tự do.
- **Provenance**: mỗi con số trace được nguồn qua `upload_log` + `edits[]` timeline.
- **Mọi thay đổi dataset** (upload/edit/delete) phải qua UI hoặc API để giữ sync GitHub metadata ↔ R2 objects. Không edit trực tiếp repo/R2.

## Development workflow (SDD)

Project dùng Spec-Driven Development:

1. **Specify**: `/feature-spec` đọc roadmap, phỏng vấn, viết spec `specs/YYYY-MM-DD-<name>/`
2. **Implement**: point agent vào spec files (requirements.md, plan.md, validation.md)
3. **Validate**: theo validation.md trước khi merge
4. **Changelog**: `/changelog` update CHANGELOG.md trước khi merge

## Maintenance scripts

**Quan trọng**: KHÔNG edit trực tiếp GitHub repo hay R2 bucket. Nếu đã edit (hoặc nghi ngờ inconsistent):

```bash
node tools/cleanup-orphans.mjs            # dry-run scan
node tools/cleanup-orphans.mjs --apply    # xóa orphans thật
node tools/setup-r2-cors.mjs              # setup CORS R2 (chỉ chạy 1 lần)
```

## License

Internal use only — VnExpress newsroom.
