# F1 — Dataset Catalog & Listing

> **Branch**: `f1-dataset-catalog`
> **Phase**: 1 (Dataset Hub) — first feature, also the foundation for F2–F5
> **Status**: Spec — not yet implemented

---

## 1. What this feature does

This feature makes the dataset listing page (`/`) read from a real database instead of hardcoded mock data, and creates the database schema that all later features depend on.

After this feature, a user can open `/`, see the "Hồ sơ 34 tỉnh thành 2025" dataset as a real row (sourced from Supabase), filter/search/sort it, and click through to its detail page.

## 2. Why this feature exists

The frontend (built in `specs/2026-06-23-hf-frontend-demo/`) is a working Hugging Face–style UI, but it reads from a hardcoded TypeScript file (`src/lib/mock/datasets.ts`). That file is a placeholder. Nothing is wired to a database. Before any feature can be "real", the database must exist and the frontend must read from it.

This feature does both: creates the schema, seeds one real dataset to test against, and rewires the listing to read from Supabase.

## 3. Current state (what exists today)

### 3.1 Frontend — works, but reads mock data
- `src/app/page.tsx` — the listing page. Imports `datasets` from `@/lib/mock/datasets` and passes it to `<DatasetExplorer>`.
- `src/components/DatasetExplorer.tsx` — client component. Renders the HF-style listing (sidebar filters, search, sort, compact rows). Imports types `Category`, `Dataset` and `CATEGORY_LABELS` from the mock file.
- `src/lib/mock/datasets.ts` — hardcoded data. Defines the `Dataset`, `Resource`, `DataDictionaryEntry` types AND exports 5 fake datasets (one hero "Hồ sơ 34 tỉnh thành 2025" + 4 others: GRDP, bầu cử, khí hậu, FDI). All data is fake/illustrative.

### 3.2 Database — wrong shape for the frontend
The Supabase database has 8 tables, all **entity-centric** (organized around provinces, not datasets):

| Table | Purpose | Status after F1 |
|-------|---------|------------------|
| `entities_catalog` | 34 provinces + regions | **KEEP** — seed reads from it |
| `province_stats` | 34 province stat rows (population, GRDP, …) | **KEEP** — seed reads from it |
| `wards` | 168 HCM ward rows | **KEEP** — seed reads from it |
| `leadership` | 56 leader rows | **KEEP** — seed reads from it |
| `resources` | files attached to **provinces** (NOT datasets) | **DROP** — wrong model |
| `resource_versions` | version history of province resources | **DROP** — depends on dropped `resources` |
| `indicator_metadata` | flat list of indicators (different shape than frontend needs) | **DROP** — replaced by `data_dictionary` |
| `tags` | controlled vocabulary | **KEEP** — reused |

**There is no `datasets` table.** A dataset is not a concept in the current database.

### 3.3 Legacy code that depends on the dropped tables
These read the tables being dropped. They become broken references after the migration, so they are removed in this feature:
- API routes: `/api/entities`, `/api/entities/[id]`, `/api/resources`, `/api/dictionary`, `/api/upload`, `/api/province-stats`, `/api/wards`, `/api/leadership`
- Pages: `/entities/[id]`, `/upload`
- Library: `src/lib/storage/upload.ts` (Supabase Storage upload helper)

### 3.4 The `resources` name collision
"Resources" means two different things:
- **Current DB**: a `resources` table holding files attached to provinces.
- **What the frontend needs** (per `constitution/tech-stack.md`): a `resources` table holding files/previews attached to datasets.

Postgres cannot have two tables named `resources`. Since the current one is being dropped (section 3.2), the new dataset-keyed `resources` table takes the name cleanly. No rename needed.

## 4. Target state (after this feature)

### 4.1 New database tables
Four new tables created by migration `005`. Column definitions follow `constitution/tech-stack.md` Data Model, with two deviations noted in section 5.

**`datasets`** — one row per dataset
```
id              SERIAL PRIMARY KEY
slug            VARCHAR(100) UNIQUE NOT NULL     -- e.g. 'ho-so-34-tinh-thanh-2025'
title           TEXT NOT NULL
description     TEXT
category        VARCHAR(50)                       -- 'kinh-te' | 'xa-hoi' | 'chinh-tri' | 'khi-hau' | 'ha-tang'
tags            TEXT[] DEFAULT '{}'
license         VARCHAR(50)                       -- 'internal' | 'public' | 'restricted'
year_range      INT[]
row_count       INT
file_count      INT
total_size_mb   NUMERIC
downloads       INT DEFAULT 0                     -- ADDED (see 5.1)
likes           INT DEFAULT 0                     -- ADDED (see 5.1)
source          TEXT
uploaded_by     VARCHAR(50) NOT NULL
uploaded_at     TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
```
Note: constitution also specifies `quality_score` and `last_verified_at`. Both **omitted** (see 5.1).

**`resources`** — one row per file/preview within a dataset
```
id              SERIAL PRIMARY KEY
dataset_id      INT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE
resource_type   VARCHAR(30) NOT NULL              -- 'data' | 'document' | 'audio' | 'geo_layer' | 'image'
title           TEXT NOT NULL
description     TEXT
file_url        TEXT
file_type       VARCHAR(10)                       -- 'csv' | 'xlsx' | 'pdf' | 'mp3' | 'geojson' | 'json'
file_size_mb    NUMERIC
file_hash       TEXT
structured_data JSONB                             -- preview rows: [{col: val, ...}, ...]
columns         JSONB                             -- [{name, type, label_vi}, ...]
column_stats    JSONB                             -- ADDED by 007 (see specs/2026-06-24-column-statistics/)
row_count       INT
tags            TEXT[] DEFAULT '{}'
year            INT
uploaded_by     VARCHAR(50) NOT NULL
uploaded_at     TIMESTAMPTZ DEFAULT NOW()
```
Indexes: `idx_resources_dataset (dataset_id)`, `idx_resources_type (resource_type)`, `idx_resources_tags_gin USING gin(tags)`, `idx_resources_structured_gin USING gin(structured_data)`.

> **`column_stats`** is added by migration `007_column_stats.sql`, documented in `specs/2026-06-24-column-statistics/`. It holds precomputed per-column statistics (histograms, categorical segments) over the *full* dataset, which the Dataset Viewer reads to render accurate mini charts. F1 creates the table without it; `007` adds the column. The seed `006` populates it.

**`data_dictionary`** — column-level documentation per dataset
```
id              SERIAL PRIMARY KEY
dataset_id      INT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE
column_name     TEXT NOT NULL                     -- 'population'
label_vi        TEXT NOT NULL                     -- 'Dân số'
data_type       VARCHAR(20)                       -- 'int' | 'float' | 'text' | 'date'
unit            TEXT                              -- 'người'
description     TEXT
source          TEXT
category        TEXT
validation_rules JSONB                            -- {"min": 0, "not_null": true}
```

**`upload_log`** — provenance audit trail (created now, populated by future upload feature)
```
id              SERIAL PRIMARY KEY
dataset_id      INT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE
resource_id     INT REFERENCES resources(id)      -- nullable
action          VARCHAR(20) NOT NULL              -- 'create' | 'update' | 'verify' | 'delete'
changed_by      VARCHAR(50) NOT NULL
changed_at      TIMESTAMPTZ DEFAULT NOW()
change_note     TEXT
snapshot_before JSONB
snapshot_after  JSONB
```

### 4.2 Seed data — one real dataset
Migration `006` inserts:
- 1 row in `datasets`: slug `ho-so-34-tinh-thanh-2025`, category `xa-hoi`, source "Tổng cục Thống kê + báo cáo UBND các tỉnh (2025)".
- 3 rows in `resources` (preview data only — the full data stays in the typed tables):
  - `province_stats` preview — first 10 rows of `province_stats`, written into `structured_data` JSONB as an array of row objects; column defs in `columns` JSONB.
  - `wards` preview — first 10 HCM wards from `wards`.
  - `leadership` preview — first 10 leaders from `leadership`.
- ~25 rows in `data_dictionary` — one per column across the 3 resources (entity_id, population, area, grdp, …), ported from the column definitions currently in `src/lib/mock/datasets.ts`.

The 4 other mock datasets (GRDP, bầu cử, khí hậu, FDI) are **not seeded** and **not shown**. They are removed entirely (section 4.4).

### 4.3 Frontend reads from database
- `src/lib/types/dataset.ts` (NEW) — type definitions moved out of the mock file. Imports change from `@/lib/mock/datasets` to `@/lib/types/dataset` across 6 files.
- `src/lib/data/datasets.ts` (NEW) — async functions that query Supabase and return `Dataset` objects:
  - `listDatasets(): Promise<Dataset[]>` — `SELECT * FROM datasets`, map each row to `Dataset`.
  - `getDatasetBySlug(slug): Promise<Dataset | null>` — fetch dataset + its resources + data_dictionary, assemble into one `Dataset`.
- `src/app/page.tsx` — becomes `async`. Replaces `import { datasets } from "@/lib/mock/datasets"` with `const datasets = await listDatasets()`.
- `DatasetExplorer`, `DatasetViewer`, `MetadataSidebar`, `datasets/[slug]/page.tsx` — **unchanged**. They receive `Dataset` props; they don't care where the data came from.

### 4.4 Mock file and legacy code removed
- `src/lib/mock/datasets.ts` — deleted (data is now in DB; types moved to `src/lib/types/dataset.ts`).
- All legacy routes/pages/library listed in section 3.3 — deleted (they reference dropped tables).

## 5. Decisions

### 5.1 Schema deviations from `constitution/tech-stack.md`
The constitution's Data Model was written before the frontend was built. The frontend revealed two adjustments:

- **`+downloads`, `+likes` on `datasets`**: the listing row shows a ★ like count and the sidebar shows a download count. Store what we display.
- **`−quality_score`, `−last_verified_at` on `datasets`**: the "Chất lượng" (quality) box was removed from the UI during prototyping (see `specs/2026-06-23-hf-frontend-demo/`). Do not store quality data the UI doesn't show. These columns can be added later if quality scoring is implemented.

### 5.2 Drop legacy entity tables, don't preserve them
The entity-centric tables (`resources`, `resource_versions`, `indicator_metadata`) come from the earlier "34 Tỉnh wiki" project direction, which was superseded on 2026-06-09 (see `constitution/roadmap.md` Replanning Log). They are not used by the new frontend. Dropping them (rather than renaming) keeps the schema clean and avoids confusion between two `resources` concepts.

### 5.3 Listing shows real data only, no demo badge
The 4 other mock datasets are hidden entirely, not shown with a "DEMO" badge. The listing reads only from the database. New datasets are added via SQL seed until the upload feature is built. Rationale: a badge-free listing is honest; mixing real and fake data is misleading.

### 5.4 SQL is executed by the agent against Supabase
The schema migration and seed are run directly against the project's Supabase instance (via `psql`), using credentials from `.env.local`. This is approved. The migration is destructive (`DROP TABLE`), but it targets only the legacy entity tables — the typed data tables (`province_stats`, etc.) are preserved.

## 6. Out of scope

- Detail page wiring to real data (F2)
- Data Viewer histograms from real rows (F3)
- Files tab download (F4)
- Search/filter promoted to a server-side API (F5)
- Upload flow, quality scoring, data dictionary browse page (deferred Phase 1)
- Supabase RLS / authentication (Phase 1 is an internal tool)
- Cloudflare R2 (no upload yet → no object storage needed)

## 7. Personas

- **Ninh (Data Journalist)** — primary user of the listing: browses the catalog, filters by lĩnh vực/tag/quy mô, finds datasets for stories.
- **Minh (Editor)** — checks what datasets exist; read-only browse.
- **Hoa (Reporter)** — not served by F1 (Phase 2+).

See `constitution/mission.md` for full persona definitions.
