# Remove Legacy Entity Stack

> **Branch**: same as the feature that triggers it (currently `f1-dataset-catalog`)
> **Type**: infrastructure cleanup — not a user-facing feature
> **Status**: Spec — not yet implemented

## What this does

Deletes the code that backed the old "34 Tỉnh wiki" entity-centric model, now that F1 has dropped its database tables and replaced them with the dataset-centric schema.

## Why

F1 (`specs/2026-06-24-dataset-catalog/`) drops the `resources`, `resource_versions`, and `indicator_metadata` tables from the database. The routes, pages, and library code below reference those tables. Keeping them around means:
- broken code paths that 500 when called (they query non-existent tables),
- confusing the next developer ("is `/upload` the real upload? no, it's dead"),
- dead code bloating the bundle.

This is a separate spec from F1 so feature specs stay focused on *what the feature does*, not housekeeping.

## Prerequisite

F1's schema migration (`005_dataset_hub_schema.sql`) must have run, dropping the legacy tables. If it hasn't, this cleanup deletes code that still works.

## What gets deleted

### API routes (directories under `src/app/api/`)
- `entities/` and `entities/[id]/` — list/get provinces (read `entities_catalog`, still kept, but these routes serve the dead `/entities` page)
- `resources/` — POST a province resource (wrote to dropped `resources` table)
- `dictionary/` — GET indicator metadata (read dropped `indicator_metadata`)
- `upload/` — multipart upload to Supabase Storage (backed the dead `/upload` page)
- `province-stats/`, `wards/`, `leadership/` — POST ingest routes for the typed tables (used by the Python parse scripts; superseded by SQL seed)

### Pages
- `src/app/entities/` — the `[id]/` detail page + its `TabSwitcher.tsx`
- `src/app/upload/` — the upload form

### Library
- `src/lib/storage/upload.ts` — the `uploadFile()` Supabase Storage helper (and `src/lib/storage/` if empty after)

### Mock file (final removal)
- `src/lib/mock/datasets.ts` — **only after F2 rewires the detail page**. F1 leaves a slimmed version; this spec deletes it once nothing imports it.

## What stays

- `entities_catalog`, `province_stats`, `wards`, `leadership` tables — **kept** (seed data source, may be used by future features)
- `src/app/datasets/`, `src/app/api/datasets/` — the new dataset-centric stack
- `src/lib/db/`, `src/lib/data/`, `src/lib/types/` — new infrastructure
- `data/scripts/parse_*.py` — Python pipeline (still useful for re-ingesting typed data; their API target routes are removed, but the scripts can be repointed to SQL)

## Validation

```bash
# 1. Deleted paths are gone
ls src/app/api/entities src/app/api/resources src/app/api/dictionary src/app/api/upload \
   src/app/api/province-stats src/app/api/wards src/app/api/leadership \
   src/app/entities src/app/upload src/lib/storage 2>&1 | grep -v "No such"
# Pass: no output

# 2. No dangling imports
grep -rn "lib/storage/upload\|api/entities\|api/resources\|api/dictionary\|api/upload\|api/province-stats\|api/wards\|api/leadership" src/ || echo "clean"
# Pass: prints "clean"

# 3. Build still compiles
npm run build
# Pass: exit 0

# 4. New stack still works
curl -s http://localhost:3000/api/datasets
# Pass: 200, returns hero dataset
```

## Ordering note

The API routes and pages can be deleted **immediately after F1's schema migration** (they're dead the moment the tables drop). The mock file deletion must wait until **F2** rewires the detail page. This spec is executed in two passes:
- Pass 1 (during/after F1): delete routes, pages, storage library.
- Pass 2 (after F2): delete the mock file.
