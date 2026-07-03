# Phase 1 — Upload Wizard MVP Validation

## Definition of Done

Tất cả phải đúng trước khi merge branch `phase-1-upload-wizard` vào `main`.

### 1. Type safety

```bash
npx tsc --noEmit
```

Phải exit 0 — không lỗi TypeScript. Cover toàn bộ files mới: `src/lib/r2/*`, `src/lib/ai/*`, `src/lib/tags.ts`, `src/app/api/upload/*/route.ts`, `src/components/upload/*`, `src/app/upload/page.tsx`.

### 2. Dev server chạy

```bash
npm run dev
```

Server start tại `http://localhost:3000` không lỗi. Navigate `/upload` render wizard Bước 1 (UploadDropzone) không crash. Console browser không có error đỏ. Visual check: wizard dùng `hf-*` tokens (không có `bg-gray-*`/`bg-blue-*` Tailwind mặc định). Compare side-by-side với `/` listing page — cùng density, cùng border style, cùng font (Source Sans 3).

### 3. Upload wizard chạy end-to-end với CSV

Manual test:
1. Mở `http://localhost:3000/upload`
2. Kéo file CSV test (5+ rows, 3+ columns, vd: `grdp_test.csv` với columns `tinh, grdp_2024, growth, region`) vào dropzone
3. Verify Bước 1 → 2 transition: file upload lên R2 thành công
4. Verify Bước 2: loading UI hiển thị ~5-15 giây, rồi transition sang Bước 3
5. Verify Bước 3: MetadataEditor có AI proposal populate (title, description, category, tags, source, source_url, confidence). DictionaryEditor có rows tương ứng columns của file CSV. Tags dropdown hiển thị list từ PostgreSQL.
6. Edit 1-2 field trong MetadataEditor (vd: sửa title) → click "Preview commit"
7. Verify Bước 4: CommitPreview hiển thị 2 pane — `metadata.yaml` (YAML đúng format) + `dictionary.md` (markdown table đúng format).
8. Click "Upload another" → wizard reset về Bước 1.

Assert: cả 4 bước complete không error. Network tab không có request fail (4xx/5xx).

### 4. Upload wizard chạy end-to-end với XLSX

Lặp lại test #3 với file `.xlsx` (1 sheet, 10+ rows). Verify cùng flow. Đặc biệt verify:
- `xlsx` package parse đúng sheet name + columns
- AI proposal nhận columns từ sheet đầu tiên

### 5. R2 object tồn tại ở staging/

Sau test #3 + #4, mở Cloudflare R2 dashboard:
- Bucket `vnexpress-data` → Objects → `staging/` prefix
- Phải thấy 2 objects với filename format `<fileId>` (UUID)
- Object size khớp với file upload

### 6. Gemini 2.5 Flash proposal chất lượng

Mở browser DevTools → Network tab → inspect response của `/api/upload/analyze`. Verify JSON response có cấu trúc:

```typescript
{
  proposal: {
    metadata: {
      title: string,           // Non-empty, tiếng Việt OK
      description: string,     // 1-3 câu
      category: string,        // Một trong: kinh-te, dan-so, giao-duc, y-te, moi-truong, khac
      tags: string[],          // 1-5 tag suggestions
      source: string,          // vd: "GSO", "Tổng cục Thống kê" — hoặc "unknown" nếu AI không đoán được
      source_url: string,      // URL hoặc empty string
      confidence: "high" | "medium" | "low",
    },
    dictionary: [
      { column: string, type: "string"|"number"|"date"|"boolean"|"category", unit: string, description: string },
      ...one row per column in file
    ],
    questions: string[],       // 0-n câu hỏi confirm uncertainty
  },
  filePreview: {
    columns: string[],
    sampleRows: any[][],       // 5-10 rows
    rowCount: number,
  }
}
```

Nếu AI không trả đúng schema → flag trong PR review, có thể cần iterate system prompt.

### 7. Decision verification — preview-only commit

Sau khi user click "Preview commit" (Bước 4):
- Server log (terminal chạy `npm run dev`) có entry `would commit: { slug, metadataSize, dictionarySize }`
- **KHÔNG** có git push thực tế — check `git log` không có commit mới sau test
- **KHÔNG** có R2 object move — check R2 dashboard file vẫn ở `staging/`, không có object mới ở `<slug>/` prefix

### 8. Decision verification — open auth (no auth)

- Truy cập `/upload` không cần login — page render bình thường
- `/api/upload/presign` không require Authorization header — return presigned URL thẳng

### 9. Decision verification — file size limit 100MB

- Test upload file > 100MB → `/api/upload/presign` return 400 với message `"File too large. Max 100MB."`
- Test upload file có content-type không hợp lệ (vd: `.txt`, `.json`) → return 400 với message `"Unsupported file type. Only CSV and XLSX allowed."`

### 10. Decision verification — tags từ PostgreSQL

- `/upload` page load → Supabase query `tags` table thành công (Network tab không có error Supabase)
- MetadataEditor tags dropdown có ≥ 5 tag thật từ DB

## Not Required

- **No automated tests** — MVP manual test đủ. Defer automated tests (vitest/playwright) cho build chunk sau.
- **No browser cross-browser test** — demo Chrome/Edge đủ. Defer Firefox/Safari.
- **No mobile responsive** — internal tool, demo desktop đủ. Defer mobile UX.
- **No production deploy verification** — local dev OK. Defer Vercel deploy verification cho khi upgrade/setup thật.
- **No tracking/analytics** — defer build chunk sau.
- **No catalog display rebuild** — listing page vẫn dùng PostgreSQL cũ. Dataset upload mới KHÔNG xuất hiện trong catalog (defer F2-R).
- **No git commit automation** — preview-only. Defer GITHUB_TOKEN setup cho build chunk sau.
- **No PDF/Parquet/MP3/GeoJSON support** — MVP chỉ CSV + XLSX.
- **No migration sang VNE palette** — spec này giữ `hf-*` tokens hiện tại. Migration sang `vne-*` palette (`constitution/vne-color-palette.md`) là decision riêng, ngoài scope.
