# Column Statistics (precomputed, full-table)

> **Branch**: `f1-dataset-catalog` (continues on the F1 branch — small, tightly coupled addition)
> **Type**: correctness fix to the Dataset Viewer
> **Status**: Spec — not yet implemented

## What this feature does

Makes the per-column mini charts in the Dataset Viewer reflect the **full dataset**, not just the 10-row preview. Adds a `column_stats` JSONB column to `resources`, computes the stats once at seed time over the entire underlying typed table, stores them, and has the viewer read the precomputed values instead of computing from preview rows.

## Why this feature exists

The Dataset Viewer (built in `specs/2026-06-23-hf-frontend-demo/`) shows a histogram under each numeric column header and a proportion bar under each categorical column. After F1 wired the viewer to the database, these charts are computed in `DatasetViewer.tsx:56` from `resource.structured_data` — the **10-row preview** stored in the `resources` JSONB column.

This is silently wrong. For the hero dataset's `province_stats` resource, the chart shows the distribution of just 10 alphabetically-first provinces (An Giang → Cần Thơ), not all 34. The min/max labels are wrong, the histogram shape is wrong, and the categorical proportions are skewed by which rows happened to make the cut.

Hugging Face does not have this problem because it precomputes column statistics server-side over the full dataset (via its `/statistics` endpoint) and serves those to the viewer. This feature replicates that architecture: stats computed once at ingest/seed time, stored in the DB, read by the viewer.

## Current state (before this feature)

- `resources.structured_data` (JSONB) — holds 10 preview rows (per `006_seed_hero_dataset.sql`).
- `DatasetViewer.tsx` — imports `resource.structured_data`, computes histograms (`histogramBins`) and categorical segments (`categoricalSegments`) client-side from those rows.
- `province_stats` typed table — 34 rows (full data). `wards` — 3,115 rows. `leadership` — 56 rows.

## Target state (after this feature)

### Database
A new JSONB column on `resources`:

```
column_stats   JSONB   -- {"<column_name>": {stats object}, ...}
```

Each key is a column name from the resource's `structured_data`. The value is one of two shapes depending on data type (mirrors the existing dictionary `data_type`):

**Numeric columns** (`int`, `float`):
```json
{
  "min": 510000,
  "max": 14002598,
  "histogram": [3, 5, 8, 6, 4, 3, 2, 3]
}
```
- `min`, `max`: actual min/max over the full table.
- `histogram`: 8-bin array of counts between min and max (same binning logic the viewer uses today, so the visual is identical — just accurate).

**Categorical columns** (`text`, including boolean rendered as text):
```json
{
  "distinct": 7,
  "segments": [
    {"label": "Đông Nam Bộ", "count": 4},
    {"label": "Đồng bằng sông Hồng", "count": 6},
    ...
  ]
}
```
- `distinct`: count of distinct values over the full table.
- `segments`: top values by count, capped at 12 (matches the existing viewer palette size).

Computed once at seed time. For the hero dataset:
- `province_stats` resource → stats computed over all 34 `province_stats` rows.
- `wards` resource → stats computed over all 168 `wards` rows where `entity_id='VN-HCM'` (matches the resource's scope — HCM only).
- `leadership` resource → stats over all 56 rows.

### TypeScript
- `src/lib/types/dataset.ts` — add `ColumnStats` type and `column_stats?: Record<string, ColumnStats>` on `Resource`.
- `src/lib/data/datasets.ts` — pass `column_stats` through in the `Resource` mapper.
- `DatasetViewer.tsx` — replace client-side `histogramBins`/`categoricalSegments` calls with reads from `resource.column_stats[col.name]`. Keep the rendering code (SVG bars) unchanged. Fall back to client-side computation ONLY if `column_stats` is absent (graceful for resources without precomputed stats — e.g. PDF-only resources).

### Seed
- Migration `007_column_stats.sql`: `ALTER TABLE resources ADD COLUMN column_stats JSONB;`
- Then for each of the 3 hero resources, compute the stats JSON in SQL (over the full typed table) and `UPDATE resources SET column_stats = ... WHERE id = ...`.
- Also update `006` so re-seeding from scratch produces stats (otherwise `006` alone leaves `column_stats` null). Document the relationship in `006`'s header.

## Decisions

### Stats computed in SQL, not Python
Stats are computed by a SQL `SELECT` aggregating the typed table (e.g. `SELECT min(population), max(population), ... FROM province_stats`). Avoids a Python script dependency for this feature; keeps all data computation in the DB where the data lives.

### 8 bins, 12 categorical segments — matches viewer
The numeric histogram uses 8 bins (same as the current client-side `histogramBins`), and categorical uses top-12 segments (same as the current palette array in `DatasetViewer.tsx`). This means the visual is unchanged; only the underlying numbers become correct.

### Scope of "full table" = the resource's data scope
For the wards resource, "full" = HCM wards only (168), not all 3,115 wards. The resource is scoped to HCM by its description and `structured_data`; its stats must match that scope, or the chart will contradict the visible rows.

### Graceful fallback
If `column_stats` is null (resource has no precomputed stats — e.g. a PDF-only resource, or a resource added before this feature), the viewer falls back to the current client-side computation from preview rows. This keeps the viewer working for any resource, not just stats-computed ones.

### Boolean rendered as categorical
`is_merged` (boolean) is treated as categorical with 2 segments (`Có`/`Không`), matching how the viewer already renders it via `formatCell`. The stored segment labels use `Có`/`Không` for consistency.

## Out of scope

- Recomputing stats on data update (no upload feature yet — stats are static until re-seed). When upload lands, the upload flow will need to recompute; that's tracked in upload's future spec.
- Statistics API endpoint (`/api/datasets/[slug]/statistics`). The viewer reads `column_stats` directly from the resource; no separate endpoint needed for Phase 1.
- Storing the raw bin edges (only counts). The viewer reconstructs visual bar widths from min/max + count array, same as today.

## Personas

- **Ninh (Data Journalist)** — benefits most: an accurate histogram lets him spot outliers (HCM population) and skew at a glance, which is the whole point of the chart.
- **Minh (Editor)** — secondary; reads charts to sanity-check datasets.
