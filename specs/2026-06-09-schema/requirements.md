# Spec 1.1 — Database Schema

## Scope

Tạo schema mới dataset-centric. Xóa schema cũ (entities_catalog, resources, indicator_metadata, resource_versions), tạo 5 bảng mới.

## Tables

### `datasets` (bảng trung tâm)
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `slug` | VARCHAR(100) | UNIQUE, NOT NULL | `grdp-34-tinh` |
| `title` | TEXT | NOT NULL | |
| `description` | TEXT | | README-style |
| `category` | VARCHAR(50) | | `kinh-te`, `xa-hoi`, `chinh-tri`, `khi-hau`, `ha-tang` |
| `tags` | TEXT[] | DEFAULT `{}` | |
| `license` | VARCHAR(50) | DEFAULT `'internal'` | |
| `year_range` | INT[] | | `[2020, 2024]` |
| `row_count` | INT | DEFAULT 0 | |
| `file_count` | INT | DEFAULT 0 | |
| `total_size_mb` | NUMERIC | DEFAULT 0 | |
| `quality_score` | NUMERIC | | 0-100 |
| `source` | TEXT | | |
| `uploaded_by` | VARCHAR(50) | NOT NULL | |
| `uploaded_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `last_verified_at` | TIMESTAMPTZ | | |

### `resources` (files + data trong dataset)
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `dataset_id` | INT | FK → datasets, NOT NULL | |
| `resource_type` | VARCHAR(30) | NOT NULL | `data`, `document`, `audio`, `geo_layer`, `image` |
| `title` | TEXT | NOT NULL | |
| `description` | TEXT | | |
| `file_url` | TEXT | | R2 URL |
| `file_type` | VARCHAR(10) | | `csv`, `xlsx`, `pdf`, `mp3` |
| `file_size_mb` | NUMERIC | | |
| `file_hash` | TEXT | | SHA-256 |
| `structured_data` | JSONB | | Preview (first N rows) |
| `columns` | JSONB | | Schema info |
| `row_count` | INT | | |
| `tags` | TEXT[] | DEFAULT `{}` | |
| `year` | INT | | |
| `uploaded_by` | VARCHAR(50) | NOT NULL | |
| `uploaded_at` | TIMESTAMPTZ | DEFAULT NOW() | |

### `data_dictionary`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `dataset_id` | INT | FK → datasets | |
| `column_name` | TEXT | NOT NULL | |
| `label_vi` | TEXT | NOT NULL | |
| `data_type` | VARCHAR(20) | | `float`, `int`, `text`, `date` |
| `unit` | TEXT | | |
| `description` | TEXT | | |
| `source` | TEXT | | |
| `category` | TEXT | | |
| `validation_rules` | JSONB | | |

### `tags`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `slug` | TEXT | PK | |
| `name` | TEXT | NOT NULL | |
| `category` | TEXT | | |

### `upload_log`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `dataset_id` | INT | FK → datasets | |
| `resource_id` | INT | FK → resources, NULL | |
| `action` | VARCHAR(20) | NOT NULL | `create`, `update`, `verify`, `delete` |
| `changed_by` | VARCHAR(50) | NOT NULL | |
| `changed_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `change_note` | TEXT | | |
| `snapshot_before` | JSONB | | |
| `snapshot_after` | JSONB | | |

## Indexes
- `idx_resources_dataset` ON `(dataset_id)`
- `idx_resources_type` ON `(resource_type)`
- `idx_resources_tags_gin` ON `USING gin(tags)`
- `idx_resources_structured_gin` ON `USING gin(structured_data)`
- `idx_datasets_category` ON `(category)`
- `idx_datasets_tags_gin` ON `USING gin(tags)`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/datasets` | Liệt kê datasets |
| `GET` | `/api/datasets/[slug]` | Chi tiết dataset + resources |
| `POST` | `/api/datasets` | Tạo dataset mới |
| `PUT` | `/api/datasets/[slug]` | Cập nhật dataset |
| `POST` | `/api/datasets/[slug]/resources` | Upload resource |
| `GET` | `/api/datasets/[slug]/preview` | Preview data (paginated) |
| `GET` | `/api/tags` | Tags vocabulary |

## Decisions

### Xóa schema cũ, tạo mới
**Why**: Schema cũ (entity-centric) khác hoàn toàn schema mới (dataset-centric). Migration phức tạp hơn rebuild. Dữ liệu seed lại sau.

**How**: SQL migration drop old tables + create new. Chạy seed script mới sau.

### Slug-based routing thay vì ID
**Why**: URLs thân thiện: `/datasets/grdp-34-tinh` thay vì `/datasets/123`. HF dùng slug.

### `upload_log` cho provenance
**Why**: Mỗi thay đổi data phải trace được ai, khi nào, thay gì. Yêu cầu từ mission.md (accuracy first).

## Out of Scope
- Không seed data (Spec 1.6)
- Không UI (specs sau)
- Không migration data cũ

## Validation
- SQL migration chạy không lỗi trên Supabase
- 5 tables tạo đúng columns, types, constraints
- Foreign keys hoạt động
- API endpoints GET trả về empty arrays, POST tạo được record
- `npm run build` exit 0
