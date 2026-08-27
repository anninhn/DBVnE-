# Column Statistics — Plan

> Implements `requirements.md`.

## Group 1 — Migration + stats computation (run on Supabase)

1. Write `data/scripts/007_column_stats.sql` containing:
   - `ALTER TABLE resources ADD COLUMN IF NOT EXISTS column_stats JSONB;`
   - For the **province_stats** resource: `UPDATE resources SET column_stats = <json> WHERE title = 'Thống kê kinh tế - xã hội 34 tỉnh';`
     - The JSON is built from a subquery aggregating `province_stats` (all 34 rows).
     - Numeric columns (`population`, `area`, `grdp`, `num_wards`, `budget_revenue`, `rank_grdp`, `year`): compute `min`, `max`, and an 8-bin histogram. The histogram is computed in SQL via a CTE that bucketizes each value: `width_bucket(value, min, max, 8)` returns a bin index 1..8; count per bin; assemble as a JSON array.
     - Categorical columns (`entity_id`, `is_merged`): compute `distinct` count + top-12 segments by frequency. `is_merged` rendered as `Có`/`Không` labels (use `CASE WHEN is_merged THEN 'Có' ELSE 'Không' END`).
   - For the **wards** resource: same pattern, source = `SELECT ... FROM wards WHERE entity_id='VN-HCM'` (scoped to HCM, matching the resource).
   - For the **leadership** resource: source = all 56 rows of `leadership`.
2. Apply `007` on Supabase:
   ```bash
   psql -f data/scripts/007_column_stats.sql
   ```
3. Verify: `SELECT jsonb_pretty(column_stats) FROM resources WHERE title LIKE 'Thống kê%';` — confirm `population` shows min 510000, max 14002598, and an 8-element histogram array summing to 34.

## Group 2 — Update seed `006` for repeatability

4. Edit `data/scripts/006_seed_hero_dataset.sql`:
   - Add `column_stats` to the three `INSERT INTO resources` statements, with the same SQL computations as `007`.
   - Add a header comment: "column_stats computed over the full typed table (province_stats / wards / leadership). See specs/2026-06-24-column-statistics/."
   - This keeps `006` self-sufficient: running `005` + `006` from scratch on a fresh DB produces stats without needing `007`. `007` remains as the migration for already-seeded DBs.

## Group 3 — TypeScript types

5. Edit `src/lib/types/dataset.ts`:
   - Add a union type for the stats value:
     ```ts
     export type ColumnStats =
       | { kind: "numeric"; min: number; max: number; histogram: number[] }
       | { kind: "categorical"; distinct: number; segments: { label: string; count: number }[] };
     ```
   - Add to `Resource` interface: `column_stats?: Record<string, ColumnStats>;`
   - Note: the DB-stored JSON doesn't have a `kind` discriminator — see Group 4 mapper.

## Group 4 — Data layer mapper

6. Edit `src/lib/data/datasets.ts`:
   - In `ResourceRow` interface, add `column_stats: Record<string, unknown> | null`.
   - In `mapResource`, normalize the raw JSON into the discriminated `ColumnStats` shape:
     - If a column's object has `histogram` → `{ kind: "numeric", min, max, histogram }`.
     - If it has `segments` → `{ kind: "categorical", distinct, segments }`.
     - Numbers may arrive as strings from JSONB — coerce with `Number()`.

## Group 5 — Viewer reads precomputed stats

7. Edit `src/app/datasets/[slug]/DatasetViewer.tsx`:
   - In the `ColumnHeader` component, before calling client-side `histogramBins`/`categoricalSegments`, check `resource.column_stats?.[col.name]`.
   - If present, render the chart + stats labels from the precomputed object (numeric → use stored `min`/`max`/`histogram`; categorical → use stored `distinct`/`segments`).
   - If absent, fall back to the existing client-side computation from `structured_data` (the current behavior).
   - **Do not delete** `histogramBins` / `categoricalSegments` / `numericStats` / `countDistinct` — they're the fallback path.

## Group 6 — Verify

8. `npm run build` — exit 0.
9. `npm run dev`, open `/datasets/ho-so-34-tinh-thanh-2025`, click to the Dataset card / Dữ liệu tab.
10. **population column**: histogram should now show HCM (14M) as a tall rightmost bar separated from the cluster; min label `510.000`, max label `14.002.598`. (Previously: wrong min/max, no HCM outlier visible.)
11. **region column**: proportion bar should show 7 segments (all 7 regions present). (Previously: only the regions of the 10 preview provinces.)
12. **is_merged column**: 2 segments, roughly 22 Có / 12 Không (real ratio of 34). (Previously: whatever ratio the 10 preview provinces had.)
13. Switch resource dropdown to `Xã phường mới`: stats reflect 168 HCM wards, not 10.
14. **Mutation test** (proves it's reading precomputed, not client-computed): in DB, set the population histogram's first bin to 999, refresh — the bar should reflect 999. Revert.
