# Column Statistics — Validation

## V1 — TypeScript compiles

```bash
npm run build
```
**Pass**: exit 0. No type errors. Fallback path (client-side `histogramBins`/`categoricalSegments`) is still present and exported.

## V2 — Migration applied

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'resources' AND column_name = 'column_stats';
```
**Pass**: one row, `data_type = jsonb`.

## V3 — Stats computed for all 3 hero resources

```sql
SELECT title,
       jsonb_object_keys(column_stats) AS stat_col,
       CASE
         WHEN column_stats->>jsonb_object_keys(column_stats) IS NULL THEN 'empty'
         WHEN (column_stats->(SELECT jsonb_object_keys(column_stats))) ? 'histogram' THEN 'numeric'
         ELSE 'categorical'
       END AS kind
FROM resources
WHERE dataset_id = (SELECT id FROM datasets WHERE slug = 'ho-so-34-tinh-thanh-2025');
```
(Simpler check — run each resource separately:)
```sql
SELECT jsonb_object_keys(column_stats)
FROM resources WHERE title = 'Thống kê kinh tế - xã hội 34 tỉnh';
```
**Pass**: returns the column names (`entity_id`, `population`, `area`, `grdp`, ... — every column in `structured_data`).

**Spot-check population stats:**
```sql
SELECT column_stats->'population'
FROM resources WHERE title = 'Thống kê kinh tế - xã hội 34 tỉnh';
```
**Pass**: `min` = 510000 (Lai Châu), `max` = 14002598 (HCM), `histogram` is an 8-element array whose elements sum to 34.

## V4 — Viewer renders full-table stats

Open `/datasets/ho-so-34-tinh-thanh-2025` → Dataset card tab → province_stats resource. Manually verify:

- [ ] **population** column header: min label `510.000`, max label `14.002.598`. Histogram has a distinct tall rightmost bar (HCM outlier) separated from the cluster of small-province bars. (Before this feature: max label was whatever the 10th-row max was; HCM wasn't even in the preview.)
- [ ] **region** proportion bar: visibly multiple segments. Count them — should be 7 (all regions). (Before: only regions present in the 10 preview rows.)
- [ ] **is_merged** proportion bar: 2 segments. Ratio reflects real 34-province split (~22 Có / 12 Không), not the preview's split.
- [ ] **rank_grdp** histogram: min 1, max 34, roughly uniform (since ranks are 1..34).

## V5 — Resource switch updates stats

Switch the resource dropdown to `Xã phường mới sau sáp nhập (chi tiết TP HCM)`:
- [ ] Stats now reflect 168 HCM wards, not 34 provinces.
- [ ] `population` (ward) min/max are ward-scale (tens of thousands), not province-scale.

Switch to `Lãnh đạo 34 tỉnh`:
- [ ] `role` proportion bar shows bí thư vs chủ tịch (~50/50, 28 each).

## V6 — Mutation test (proves precomputed, not client-computed)

```sql
UPDATE resources
SET column_stats = jsonb_set(column_stats, '{population,histogram,0}', '999'::jsonb)
WHERE title = 'Thống kê kinh tế - xã hội 34 tỉnh';
```
Refresh the viewer. **Pass**: the leftmost population histogram bar is now enormously tall (count 999 out of ~34 total).
Revert:
```sql
-- Re-run 007, or restore the original histogram array manually
```

## V7 — Fallback works

Temporarily null out stats for one resource:
```sql
UPDATE resources SET column_stats = NULL WHERE title = 'Lãnh đạo 34 tỉnh';
```
Refresh, switch to leadership resource. **Pass**: charts still render (using client-side fallback from the 10 preview rows). Not accurate, but not broken.
Revert by re-running `007`.

## V8 — Seed is self-sufficient

On a fresh DB (or by inspection of `006`): running `005` + `006` alone (without `007`) must populate `column_stats`. Verify by reading `006` and confirming the three `INSERT INTO resources` statements include a `column_stats` value expression.

## Not required

- Statistics API endpoint (`/api/datasets/[slug]/statistics`) — viewer reads `column_stats` directly.
- Recomputation triggers on data update (no upload yet).
- Storing raw bin edges (only counts).
- Tests for resources without any structured data (PDF-only) — those just have null stats and the viewer handles it.
