# VNExpress Data Platform — Tech Stack

## System Design

Kho dữ liệu + query + intelligence platform cho tòa soạn VNExpress, xây dựng incremental qua 3 phases.

```
Phase 1: Next.js Web App + Supabase + R2 (Dataset Hub)
Phase 2: + LLM Layer (Query Templates → Text-to-SQL)
Phase 3: + RAG Pipeline + Vector DB (Intelligence Platform)
```

## Phase 1 Stack (hiện tại)

```
Frontend:      Next.js 15 (App Router) + Tailwind CSS
API:           Next.js API Routes (serverless functions)
Database:      PostgreSQL on Supabase
File Storage:  Cloudflare R2 (PDF, MP3, XLSX, GeoJSON)
Pipeline:      Python 3 + pandas
Hosting:       Vercel (auto-deploys from GitHub)
```

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 15 (App Router) | Full-stack React, SSR, API routes, native Vercel |
| Language | TypeScript | Type safety |
| Database | PostgreSQL | JSONB support, GIN index, Supabase managed |
| Database host | Supabase | Managed Postgres, dashboard UI, Auth sẵn sàng khi cần |
| Object Storage | Cloudflare R2 | S3-compatible, không egress fee |
| CSS | Tailwind CSS | Utility-first, rapid prototyping |
| Data pipeline | Python 3 + pandas | Xử lý CSV/Excel chuẩn |
| Hosting | Vercel | GitHub integration, auto-deploy |
| Version control | Git + GitHub | Standard |

## Phase 2 Stack (sau khi Phase 1 hoàn thành)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| LLM (templates) | TBD — Claude API / OpenAI | Query generation + natural language |
| Query engine | PostgreSQL views + functions | Promoted structured data |
| Template system | Custom | Deterministic queries, không hallucinate |

**Decision để lại Phase 2**: LLM choice, vector DB, embedding model — chờ Phase 1 thu thập usage data rồi quyết định.

## Phase 3 Stack (sau khi Phase 2 hoàn thành)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Vector DB | TBD (pgvector / Pinecone / Weaviate) | RAG retrieval |
| Embedding model | TBD | Document + audio embedding |
| ASR | TBD (Whisper / Vietnamese ASR) | MP3 → text |
| RAG framework | TBD (LangChain / LlamaIndex / custom) | Multi-source reasoning |

## Configuration

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token |
| `R2_SECRET_ACCESS_KEY` | R2 secret |
| `R2_BUCKET_NAME` | Bucket name |
| `NEXT_PUBLIC_APP_URL` | App URL |

## Architecture (Phase 1)

```
┌──────────────────────────────────────────────────────┐
│  UI LAYER — Next.js Web App                          │
│  - Dataset listing (giống HF /datasets)              │
│  - Dataset detail: metadata, dictionary, quality,     │
│    preview, files                                     │
│  - Upload form                                        │
│  - Search & filter                                    │
└───────────────────────┬──────────────────────────────┘
                        │
                  REST API (Next.js)
                        │
          ┌─────────────┴──────────────┐
          ▼                            ▼
┌─────────────────────┐    ┌──────────────────────┐
│   PostgreSQL        │    │  Cloudflare R2        │
│   (Supabase)        │    │  (Object Storage)     │
│                     │    │                       │
│  - datasets         │    │  /dataset-slug/       │
│  - resources        │    │    data.csv           │
│  - data_dictionary  │    │    report.pdf         │
│  - tags             │    │    interview.mp3      │
│  - upload_log       │    │                       │
└─────────────────────┘    └──────────────────────┘
```

## Data Model (Phase 1)

### Design Principle: Dataset-centric

Mọi thứ xoay quanh **dataset**. Một dataset có thể là:
- Dữ liệu tỉnh thành (34 tỉnh × indicators)
- Dữ liệu bầu cử quốc gia
- Dữ liệu khí hậu
- Báo cáo PDF
- Phỏng vấn MP3
- Bất kỳ tập dữ liệu nào tòa soạn cần

### `datasets` (bảng trung tâm)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `slug` | VARCHAR(100) | UNIQUE, NOT NULL | `grdp-34-tinh`, `ket-qua-bau-cu-2026` |
| `title` | TEXT | NOT NULL | Tên hiển thị |
| `description` | TEXT | | Mô tả README-style |
| `category` | VARCHAR(50) | | `kinh-te`, `xa-hoi`, `chinh-tri`, `khi-hau`, `ha-tang` |
| `tags` | TEXT[] | DEFAULT `{}` | Controlled vocabulary |
| `license` | VARCHAR(50) | | `internal`, `public`, `restricted` |
| `year_range` | INT[] | | `[2020, 2021, 2022, 2023, 2024]` |
| `row_count` | INT | | Số dòng dữ liệu |
| `file_count` | INT | | Số file đính kèm |
| `total_size_mb` | NUMERIC | | |
| `quality_score` | NUMERIC | | 0-100, auto-calculated |
| `source` | TEXT | | 'GSO Niên giám 2024', 'PCI 2025' |
| `uploaded_by` | VARCHAR(50) | NOT NULL | |
| `uploaded_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `last_verified_at` | TIMESTAMPTZ | | Lần cuối verify data |

### `resources` (files + structured data trong dataset)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `dataset_id` | INT | FK → datasets, NOT NULL | |
| `resource_type` | VARCHAR(30) | NOT NULL | `data`, `document`, `audio`, `geo_layer`, `image` |
| `title` | TEXT | NOT NULL | |
| `description` | TEXT | | |
| `file_url` | TEXT | | R2 URL |
| `file_type` | VARCHAR(10) | | `csv`, `xlsx`, `pdf`, `mp3`, `geojson` |
| `file_size_mb` | NUMERIC | | |
| `file_hash` | TEXT | | SHA-256 để verify integrity |
| `structured_data` | JSONB | | Preview data (first N rows) hoặc metadata |
| `columns` | JSONB | | `[{"name": "grdp_growth", "type": "float", "label_vi": "Tốc độ tăng trưởng GRDP"}]` |
| `row_count` | INT | | |
| `tags` | TEXT[] | DEFAULT `{}` | |
| `year` | INT | | |
| `uploaded_by` | VARCHAR(50) | NOT NULL | |
| `uploaded_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes**:
- `idx_resources_dataset` ON `(dataset_id)`
- `idx_resources_type` ON `(resource_type)`
- `idx_resources_tags_gin` ON `USING gin(tags)`
- `idx_resources_structured_gin` ON `USING gin(structured_data)`

### `data_dictionary` (auto-generated)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `dataset_id` | INT | FK → datasets | |
| `column_name` | TEXT | NOT NULL | `grdp_growth` |
| `label_vi` | TEXT | NOT NULL | 'Tốc độ tăng trưởng GRDP' |
| `data_type` | VARCHAR(20) | | `float`, `int`, `text`, `date` |
| `unit` | TEXT | | '%', 'tỷ đồng', 'người' |
| `description` | TEXT | | |
| `source` | TEXT | | Nguồn tiêu chuẩn |
| `category` | TEXT | | 'vĩ mô', 'giáo dục', 'y tế' |
| `validation_rules` | JSONB | | `{"min": -100, "max": 100, "not_null": true}` |

### `tags` (controlled vocabulary)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `slug` | TEXT | PK | `vi-mo` |
| `name` | TEXT | NOT NULL | 'Vĩ mô' |
| `category` | TEXT | | 'loại dữ liệu', 'lĩnh vực', 'nguồn' |

### `upload_log` (provenance & quality)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `dataset_id` | INT | FK → datasets | |
| `resource_id` | INT | FK → resources, NULL | |
| `action` | VARCHAR(20) | NOT NULL | `create`, `update`, `verify`, `delete` |
| `changed_by` | VARCHAR(50) | NOT NULL | |
| `changed_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `change_note` | TEXT | | 'Import from GSO 2024' |
| `snapshot_before` | JSONB | | |
| `snapshot_after` | JSONB | | |

## API Design

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/datasets` | Liệt kê datasets (filter, search) |
| `GET` | `/api/datasets/:slug` | Chi tiết dataset + resources |
| `POST` | `/api/datasets` | Tạo dataset mới |
| `PUT` | `/api/datasets/:slug` | Cập nhật metadata dataset |
| `GET` | `/api/datasets/:slug/resources` | Resources trong dataset |
| `POST` | `/api/datasets/:slug/resources` | Upload resource mới |
| `GET` | `/api/datasets/:slug/dictionary` | Data dictionary |
| `GET` | `/api/datasets/:slug/quality` | Data quality report |
| `GET` | `/api/datasets/:slug/preview` | Preview data (paginated) |
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
│   │   ├── page.tsx         — Dataset listing (HF-style)
│   │   ├── datasets/
│   │   │   └── [slug]/
│   │   │       └── page.tsx — Dataset detail (tabs: info, data, files)
│   │   ├── upload/
│   │   │   └── page.tsx     — Upload form
│   │   ├── dictionary/
│   │   │   └── page.tsx     — Data dictionary
│   │   └── api/
│   │       ├── datasets/
│   │       ├── tags/
│   │       └── search/
│   ├── lib/
│   │   ├── db/              — Database client
│   │   └── storage/         — R2 client
│   └── components/
│       ├── DatasetCard.tsx
│       ├── DataTable.tsx
│       ├── SearchFilter.tsx
│       └── ...
├── public/
├── package.json
├── next.config.js
└── tailwind.config.js
```

## Constraints

- Vietnamese UI throughout
- Mobile-friendly
- No auth cho Phase 1 (internal tool)
- JSONB keys phải khớp data_dictionary — không tự do đặt tên
- Tags chọn từ controlled vocabulary — không gõ tự do
- Mỗi con số phải trace được nguồn (provenance)
