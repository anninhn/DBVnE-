# Spec 1.5 — Upload Form

## Scope

Form upload dataset mới: tạo dataset + upload files + nhập metadata. Phục vụ Minh (Editor) + Ninh (Data Journalist).

## Features

### Tạo Dataset mới
- Title (required) → auto-generate slug
- Description (multiline)
- Category dropdown (kinh-te, xa-hoi, chinh-tri, khi-hau, ha-tang)
- Tags (multi-select từ controlled vocabulary)
- Source
- License dropdown (internal, public, restricted)
- Year range (from-to hoặc multi-select)

### Upload Resources
- File upload (multi-file): CSV, XLSX, PDF, MP3, GeoJSON, JSON
- Mỗi file: title, description, resource_type, year
- File → R2 upload → nhận URL
- CSV/XLSX: auto-extract first 25 rows → structured_data preview
- CSV/XLSX: auto-extract column headers → generate columns JSONB
- File hash (SHA-256) tự compute

### Structured Data Input (optional)
- JSON textarea: nhập trực tiếp structured_data
- Hoặc paste CSV → auto-parse

### Data Dictionary (optional)
- Nếu CSV/XLSX: auto-generate dictionary entries (column_name, inferred type)
- Cho phép edit label_vi, unit, description cho mỗi column

### Provenance
- `uploaded_by` (required)
- `change_note`: ghi chú lần upload này
- Tự động tạo upload_log entry

## Files

- `src/app/upload/page.tsx` — rewrite hoàn toàn

## Decisions

### Multi-step form
Upload chia 2 bước: (1) tạo dataset metadata → (2) upload files + resources.

**Why**: Tránh form quá dài. HF cũng tách metadata và files.

**How**: Step 1: POST `/api/datasets` → nhận slug. Step 2: redirect `/upload/[slug]` hoặc same page step 2, POST resources.

### Auto-extract CSV/XLSX preview
Khi upload CSV/XLSX, tự động đọc first 25 rows + columns → lưu vào structured_data + columns.

**Why**: Preview data trên detail page không cần load full file.

**How**: Server-side parse trong API route (không cần Python — dùng Node.js csv-parse hoặc xlsx library).

## Out of Scope
- Không edit dataset/resource (chỉ tạo mới)
- Không delete
- Không version history (chỉ create action)
- Không validation rules editing

## Validation
- Form tạo dataset thành công (POST `/api/datasets`)
- Slug auto-generate từ title (lowercase, hyphen-separated)
- File upload lên R2 thành công
- CSV/XLSX auto-extract structured_data preview
- Data dictionary auto-generate từ column headers
- Upload log entry tạo đúng
- HF styling: yellow button, yellow focus rings
- `npm run build` exit 0
