# 34 Tỉnh Thành — Tech Stack

## System Design

Next.js web application with PostgreSQL database. Journalists interact through a browser-based dashboard. Data ingested via Python scripts (batch) or web upload form (ad-hoc). Geographic data stored as files on cloud storage, referenced by the database. Deploys to Vercel + Supabase.

```
Frontend:      Next.js 15 (App Router) + Tailwind CSS
API:           Next.js API Routes (serverless functions)
Database:      PostgreSQL on Supabase
File Storage:  Cloud storage (TBD — Supabase Storage or Cloudflare R2)
Pipeline:      Python 3 + pandas
Hosting:       Vercel (auto-deploys from GitHub)
```

## Tech Choices

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 15 (App Router) | Full-stack React framework, SSR, API routes, native Vercel integration |
| Language | TypeScript | Type safety, industry standard |
| Database | PostgreSQL | Relational, JSONB support, PostGIS-capable |
| Database host | Supabase | Managed Postgres, dashboard UI, Auth/Storage available |
| CSS | Tailwind CSS | Utility-first, rapid prototyping |
| Data pipeline | Python 3 + pandas | Industry standard for data processing |
| Hosting | Vercel | GitHub integration, auto-deploy, edge functions |
| Version control | Git + GitHub | Standard, required for Vercel |

## Configuration

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string from Supabase |
| `NEXT_PUBLIC_APP_URL` | App URL for metadata |

## Core Pipeline

```
1. INGEST    — CSV/Excel upload (web UI) or Python script
2. NORMALIZE — Map old province codes, standardize columns, handle missing values
3. STORE     — Insert into PostgreSQL with provenance metadata
4. SERVE     — Dashboard query & export (JSON, CSV)
```

## Data Architecture

### Design Approach: Hybrid

Six data patterns identified from PROJECT_PLAN.md (months 5–12):

| Pattern | Examples | Table |
|---------|----------|-------|
| Numeric time-series | GRDP, dân số, số trường, nhiệt độ | `data_points` |
| Score + Rank | PCI, PAPI, PAR Index, SIPAS | `data_points` (score + rank columns) |
| Entities with attributes | highways, airports, ports, KCN, projects | `entities` (JSONB attrs) |
| Events with per-province impact | storms, floods, landslides | `events` (JSONB attrs) |
| Geographic layers | boundaries, roads, power lines | `geo_layers` (file registry) |
| Text profiles | leaders, admin structure | `entities` (JSONB attrs) |

**Principle**: Fixed columns for common fields, JSONB for variable attributes. Column definitions are pre-designed and will be refined when actual data arrives.

### Entity-Relationship Diagram

```
sources ──→ import_logs
    │
    ├──→ data_points ←── indicators ←── categories
    │         ↑
    │      provinces
    │         ↑
    ├──→ entity_provinces ←── entities
    │
    ├──→ event_provinces ←── events
    │
    └──→ geo_layers
```

## Data Model (11 tables)

### `provinces` (34 rows)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `code` | TEXT | UNIQUE, NOT NULL | New GSO province code |
| `name` | TEXT | NOT NULL | |
| `region` | TEXT | NOT NULL | |
| `old_codes` | TEXT[] | | Pre-merger codes |
| `boundary_file` | TEXT | | Path to GeoJSON boundary |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

### `categories`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `slug` | TEXT | UNIQUE, NOT NULL | |
| `name` | TEXT | NOT NULL | |
| `sort_order` | INT | | Display order |

### `indicators`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `slug` | TEXT | UNIQUE, NOT NULL | |
| `name` | TEXT | NOT NULL | Short name |
| `name_vi` | TEXT | NOT NULL | Full Vietnamese name |
| `category_id` | INT | FK → categories | |
| `unit` | TEXT | NOT NULL | |
| `frequency` | TEXT | DEFAULT 'yearly' | yearly, quarterly, monthly |
| `description` | TEXT | | |
| `updated_at` | TIMESTAMPTZ | | |

### `data_points` (patterns 1 + 2: numeric values & rankings)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `province_id` | INT | FK → provinces, NOT NULL | |
| `indicator_id` | INT | FK → indicators, NOT NULL | |
| `year` | INT | NOT NULL | |
| `value` | NUMERIC | NOT NULL | |
| `score` | NUMERIC | | For rankings |
| `rank` | INT | | For rankings |
| `source_id` | INT | FK → sources | Data lineage |
| `imported_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Unique**: `(province_id, indicator_id, year)`

### `entities` (pattern 3: infrastructure, projects)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `type` | TEXT | NOT NULL | highway, airport, port, industrial_zone, project |
| `name` | TEXT | NOT NULL | |
| `year` | INT | | |
| `status` | TEXT | | |
| `attrs` | JSONB | | Flexible attributes |
| `source_id` | INT | FK → sources | |
| `imported_at` | TIMESTAMPTZ | DEFAULT NOW() | |

### `entity_provinces` (junction: entities ↔ provinces)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `entity_id` | INT | FK → entities | |
| `province_id` | INT | FK → provinces | |

**Unique**: `(entity_id, province_id)`

### `events` (pattern 4: disasters)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `type` | TEXT | NOT NULL | storm, flood, landslide, drought |
| `name` | TEXT | NOT NULL | |
| `event_date` | DATE | NOT NULL | |
| `deaths` | INT | DEFAULT 0, CHECK >= 0 | |
| `injuries` | INT | DEFAULT 0, CHECK >= 0 | |
| `damage_total` | NUMERIC | | Total damage (tỷ đồng) |
| `attrs` | JSONB | | Additional details |
| `source_id` | INT | FK → sources | |
| `imported_at` | TIMESTAMPTZ | DEFAULT NOW() | |

### `event_provinces` (junction with per-province data)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `event_id` | INT | FK → events | |
| `province_id` | INT | FK → provinces | |
| `damage` | NUMERIC | | Per-province damage |
| `deaths` | INT | | Per-province deaths |
| `notes` | TEXT | | |

**Unique**: `(event_id, province_id)`

### `geo_layers` (pattern 5: geographic file registry)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `slug` | TEXT | UNIQUE, NOT NULL | |
| `name` | TEXT | NOT NULL | |
| `type` | TEXT | NOT NULL | boundary, road, power, elevation, nightlight |
| `file_path` | TEXT | NOT NULL | URL or path |
| `year` | INT | | |
| `format` | TEXT | | geojson, shapefile, tiff |
| `file_size_mb` | NUMERIC | | |
| `source_id` | INT | FK → sources | |
| `updated_at` | TIMESTAMPTZ | | |

### `sources` (data provenance)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `name` | TEXT | NOT NULL | |
| `publisher` | TEXT | | |
| `type` | TEXT | | niên giám, sách trắng, báo cáo, csv |
| `year` | INT | | |
| `url` | TEXT | | |
| `description` | TEXT | | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

### `import_logs`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | |
| `source_id` | INT | FK → sources, NOT NULL | |
| `target_table` | TEXT | NOT NULL | data_points, entities, events |
| `rows_imported` | INT | DEFAULT 0 | |
| `rows_skipped` | INT | DEFAULT 0 | |
| `status` | TEXT | NOT NULL | success, partial, failed |
| `errors` | JSONB | | |
| `imported_at` | TIMESTAMPTZ | DEFAULT NOW() | |

## Data Lineage

Every data point traces to its source: `data_points.source_id` → `sources` → `import_logs`. Dashboard exposes this as a UI feature (click number → see source + import history).

## API Design

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/provinces` | List all provinces |
| `GET` | `/api/provinces/:code` | Province profile with indicators |
| `GET` | `/api/indicators` | List indicators (filter by category) |
| `GET` | `/api/data?province=X&indicator=Y&year=Z` | Query data points |
| `POST` | `/api/import` | Upload CSV/Excel |
| `GET` | `/api/export?format=csv` | Export dataset |
| `GET` | `/api/entities?type=X` | List entities by type |
| `GET` | `/api/events?year=X` | List events |
| `GET` | `/api/geo-layers` | List geographic layers |

## Project Layout

```
/
├── constitution/
├── specs/
├── data/
│   ├── geographic/         — GeoJSON, Shapefile, GeoTIFF
│   │   ├── boundaries/
│   │   ├── roads/
│   │   └── power/
│   └── socioeconomic/      — Raw CSV/Excel before import
├── scripts/                — Python pipeline
│   ├── parse_*.py
│   ├── seed.py
│   └── requirements.txt
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── provinces/
│   │   ├── indicators/
│   │   ├── import/
│   │   └── api/
│   ├── lib/
│   │   ├── db/
│   │   └── pipeline/
│   └── components/
├── public/
├── package.json
├── next.config.js
└── tailwind.config.js
```

## Constraints

- Vietnamese UI throughout
- Mobile-friendly (journalists may browse on phones)
- No auth for MVP
- Cloud-first (database + file storage)
- Schema is iterative — column definitions refined when actual data arrives; adding/dropping columns is a minor migration

## Open Questions

1. ORM: Drizzle, Prisma, or raw psycopg2?
2. Cloud storage: Supabase Storage or Cloudflare R2?
3. Province code standard: new GSO codes or internal convention?
