# 34 Tỉnh Thành — Tech Stack

## System Design

Kho tri thức wiki-style (tham khảo Hugging Face Hub) cho tòa soạn VNExpress. Phóng viên duyệt, tìm kiếm, upload, download tài nguyên qua web. Dữ liệu cấu trúc + metadata lưu PostgreSQL. File vật lý lưu Object Storage. Versioning kiểu Git nhẹ cho audit trail. Deploy lên Vercel + Supabase + Cloudflare R2.

```
Frontend:      Next.js 15 (App Router) + Tailwind CSS
API:           Next.js API Routes (serverless functions)
Database:      PostgreSQL on Supabase
File Storage:  Cloudflare R2 (file nhị phân: PDF, MP3, XLSX, GeoJSON)
Pipeline:      Python 3 + pandas
Hosting:       Vercel (auto-deploys from GitHub)
```

## Tech Choices

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 15 (App Router) | Full-stack React, SSR, API routes, native Vercel |
| Language | TypeScript | Type safety |
| Database | PostgreSQL | JSONB support, GIN index, Supabase managed |
| Database host | Supabase | Managed Postgres, dashboard UI, Auth sẵn sàng khi cần |
| Object Storage | Cloudflare R2 | S3-compatible, không egress fee, phù hợp file tĩnh |
| CSS | Tailwind CSS | Utility-first, rapid prototyping |
| Data pipeline | Python 3 + pandas | Xử lý CSV/Excel chuẩn |
| Hosting | Vercel | GitHub integration, auto-deploy |
| Version control | Git + GitHub | Standard |

## Configuration

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token |
| `R2_SECRET_ACCESS_KEY` | R2 secret |
| `R2_BUCKET_NAME` | Bucket name |
| `NEXT_PUBLIC_APP_URL` | App URL |

## Architecture

```
┌─────────────────────────────────────────────────┐
│  UI LAYER — Next.js Web App                     │
│  - Trang tỉnh (wiki-style, giống HF dataset)    │
│  - Upload form (số liệu + file đính kèm)        │
│  - Search & filter (tags, loại, năm)            │
│  - Version history (timeline updates)            │
│  - Data dictionary (auto-generated)             │
└───────────────────────┬─────────────────────────┘
                        │
                  REST API (Next.js)
                        │
          ┌─────────────┴──────────────┐
          ▼                            ▼
┌─────────────────────┐    ┌──────────────────────┐
│   PostgreSQL        │    │  Cloudflare R2        │
│   (Supabase)        │    │  (Object Storage)     │
│                     │    │                       │
│  - entities_catalog │    │  /VN-LA/2024/         │
│  - resources        │    │    baocao_grdp.pdf    │
│  - resource_versions│    │    phong_van.mp3      │
│  - indicator_metadata│   │  /VN-HN/2023/         │
│  - tags             │    │    nien_giam.xlsx     │
└─────────────────────┘    └──────────────────────┘
```

## Core Pipeline

```
1. UPLOAD   — Phóng viên gửi số liệu + file qua Web Form
2. STORE    — File → R2 (nhận URL), Số liệu + metadata → PostgreSQL (resources)
3. VERSION  — Mỗi update tạo snapshot mới trong resource_versions
4. SERVE    — Trang tỉnh hiển thị resources, link tải file, history
```

## Data Model (~5 tables)

### Design Principle: Wiki-first, promote sau

- Mọi tài nguyên (số liệu, file, ghi chú) là 1 **resource**
- Không thiết kế bảng cố định cho từng loại chỉ số — dùng JSONB
- Khi xác định được hot indicators → promote sang views/tables riêng cho dashboard
- File vật lý KHÔNG nằm trong database — chỉ lưu URL

### `entities_catalog` (34+ rows)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `entity_id` | VARCHAR(50) | PK | `VN-LA` (Long An), `REG-DNB` (Đông Nam Bộ), `NAT-VN` (Toàn quốc) |
| `entity_name` | VARCHAR(150) | NOT NULL | |
| `entity_type` | VARCHAR(30) | NOT NULL | `PROVINCE`, `REGION`, `NATIONAL`, `SECTOR` |
| `old_codes` | TEXT[] | | Pre-merger province codes |
| `region` | TEXT | | Vùng (ĐNB, ĐBSCL, etc.) — chỉ cho PROVINCE |
| `tags` | TEXT[] | DEFAULT `{}` | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

### `resources` (bảng trung tâm)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `entity_id` | VARCHAR(50) | FK → entities_catalog, NOT NULL | |
| `resource_type` | VARCHAR(30) | NOT NULL | `indicator`, `ranking`, `document`, `audio`, `dataset`, `geo_layer` |
| `title` | TEXT | NOT NULL | 'GRDP growth rate 2020-2025' |
| `year` | INT | | |
| `structured_data` | JSONB | | `{"grdp_growth": 7.2, "population": 1200000, "unit": "%"}` |
| `file_url` | TEXT | | R2 URL |
| `file_type` | VARCHAR(10) | | `pdf`, `xlsx`, `mp3`, `docx`, `geojson` |
| `file_size_mb` | NUMERIC | | |
| `source` | TEXT | | 'Niên giám thống kê 2024', 'PCI 2025' |
| `description` | TEXT | | Ghi chú phóng viên |
| `tags` | TEXT[] | DEFAULT `{}` | `['vĩ mô', 'GRDP', 'tăng trưởng']` |
| `uploaded_by` | VARCHAR(50) | NOT NULL | |
| `uploaded_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes**:
- `idx_resources_entity` ON `(entity_id)`
- `idx_resources_type` ON `(resource_type)`
- `idx_resources_tags_gin` ON `USING gin(tags)`
- `idx_resources_structured_gin` ON `USING gin(structured_data)`
- `idx_resources_year` ON `(year)`

### `resource_versions` (lineage kiểu Git nhẹ)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `resource_id` | INT | FK → resources, NOT NULL | |
| `version` | INT | NOT NULL | 1, 2, 3... |
| `snapshot` | JSONB | NOT NULL | Snapshot toàn bộ resource lúc commit |
| `file_url` | TEXT | | File URL nếu thay đổi file |
| `changed_by` | VARCHAR(50) | NOT NULL | |
| `changed_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `change_note` | TEXT | | 'Sửa GRDP theo niên giám 2024 mới' |

**Unique**: `(resource_id, version)`

### `indicator_metadata` (data dictionary)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `key` | TEXT | PK | `grdp_growth` |
| `name_vi` | TEXT | NOT NULL | 'Tốc độ tăng trưởng GRDP' |
| `unit` | TEXT | | '%', 'tỷ đồng', 'người' |
| `description` | TEXT | | Mô tả ngắn |
| `source` | TEXT | | Nguồn tiêu chuẩn |
| `category` | TEXT | | 'vĩ mô', 'giáo dục', 'y tế', 'xếp hạng' |

### `tags` (controlled vocabulary)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `slug` | TEXT | PK | `vi-mo` |
| `name` | TEXT | NOT NULL | 'Vĩ mô' |
| `category` | TEXT | | 'loại dữ liệu', 'lĩnh vực', 'nguồn' |

## API Design

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/entities` | Liệt kê entities (tỉnh, vùng) |
| `GET` | `/api/entities/:id` | Trang tỉnh — mọi resources + tags |
| `GET` | `/api/resources?entity=X&type=Y&tag=Z` | Tìm kiếm resources |
| `GET` | `/api/resources/:id` | Chi tiết 1 resource + version history |
| `POST` | `/api/resources` | Upload mới (số liệu + file) |
| `PUT` | `/api/resources/:id` | Cập nhật (tạo version mới) |
| `GET` | `/api/resources/:id/versions` | Version history |
| `GET` | `/api/dictionary` | Data dictionary (từ indicator_metadata) |
| `GET` | `/api/tags` | Controlled vocabulary |
| `GET` | `/api/search?q=keyword` | Full-text search |

## Project Layout

```
/
├── constitution/
│   ├── mission.md
│   ├── tech-stack.md
│   └── roadmap.md
├── specs/
├── data/
│   ├── raw/                 — Raw files trước khi upload
│   └── scripts/             — Python preprocessing
│       ├── parse_*.py
│       └── requirements.txt
├── src/
│   ├── app/
│   │   ├── page.tsx         — Homepage: search, entity list
│   │   ├── entities/
│   │   │   └── [id]/
│   │   │       └── page.tsx — Wiki page per entity
│   │   ├── upload/
│   │   │   └── page.tsx     — Upload form
│   │   ├── dictionary/
│   │   │   └── page.tsx     — Data dictionary
│   │   └── api/
│   │       ├── entities/
│   │       ├── resources/
│   │       ├── dictionary/
│   │       ├── tags/
│   │       └── search/
│   ├── lib/
│   │   ├── db/              — Database client
│   │   └── storage/         — R2 client
│   └── components/
│       ├── EntityCard.tsx
│       ├── ResourceList.tsx
│       ├── UploadForm.tsx
│       ├── VersionHistory.tsx
│       └── SearchBar.tsx
├── public/
├── package.json
├── next.config.js
└── tailwind.config.js
```

## Data Flow: Upload Scenario

```
Phóng viên upload: Long An GRDP 2024 + file baocao.pdf
    │
    ▼
Frontend: POST /api/resources
    │
    ├──→ R2: Upload baocao.pdf → /VN-LA/2024/baocao_grdp.pdf → nhận URL
    │
    └──→ PostgreSQL:
         1. INSERT INTO resources (entity_id='VN-LA', resource_type='indicator',
            structured_data={"grdp_growth": 7.2}, file_url='...', uploaded_by='Hoa')
         2. INSERT INTO resource_versions (resource_id, version=1, snapshot={...})
    │
    ▼
Frontend: Trang Long An hiển thị resource mới + link download PDF
```

## Medallion Pattern (cho dashboard sau)

```
Bronze (raw):     resources table + R2 files — mọi thứ
Silver (clean):   Materialized views cho hot indicators
Gold (serving):   Dashboard reads từ views
```

Promote khi đã biết indicators nào cần query nhanh. Không redesign — chỉ `CREATE MATERIALIZED VIEW`.

## Constraints

- Vietnamese UI throughout
- Mobile-friendly (phóng viên có thể duyệt trên điện thoại)
- No auth cho MVP (internal tool)
- JSONB keys phải khớp indicator_metadata — không tự do đặt tên
- Tags chọn từ controlled vocabulary — không gõ tự do

## Open Questions

1. Full-text search: PostgreSQL `tsvector` hay external (Meilisearch, Typesense)?
2. ORM: Drizzle, Prisma, hay raw queries?
3. Province code: GSO mới hay internal convention (`VN-LA`)?
