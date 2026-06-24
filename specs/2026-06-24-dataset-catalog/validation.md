# F1 Validation — Dataset Catalog & Listing

> Acceptance criteria for merging `f1-dataset-catalog`. Every check below must pass. Each has an exact command or query so anyone (including CI) can run it.

## V1 — TypeScript compiles

```bash
npm run build
```

**Pass**: exits 0, no errors.
**Fail**: any TypeScript error, especially dangling imports to `@/lib/mock/datasets` paths that no longer export what's expected, or imports to deleted legacy routes.

## V2 — Schema migration applied

Connect to Supabase and run:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

**Pass**: result includes `datasets`, `resources`, `data_dictionary`, `upload_log`, AND still includes `entities_catalog`, `province_stats`, `wards`, `leadership`, `tags`.
**Fail**: any of the new tables missing, OR any of the kept tables missing (the migration dropped something it shouldn't have).

Run separately to confirm the legacy tables are gone:

```sql
SELECT count(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('resource_versions', 'indicator_metadata');
```

**Pass**: returns `0`.
**Note**: the old entity-keyed `resources` is replaced by the new dataset-keyed `resources` — same name, so it will appear in the list. Confirm it has a `dataset_id` column (not `entity_id`):

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'resources' AND column_name IN ('dataset_id', 'entity_id');
```

**Pass**: returns only `dataset_id`.

## V3 — Seed data present

```sql
SELECT slug, title, category, downloads, likes FROM datasets;
```

**Pass**: exactly 1 row — `slug='ho-so-34-tinh-thanh-2025'`, `category='xa-hoi'`, `downloads=142`, `likes=34`. No `quality_score` column exists (confirm by trying `SELECT quality_score FROM datasets;` → should error).

```sql
SELECT title, file_type, jsonb_array_length(structured_data) AS preview_rows
FROM resources WHERE dataset_id = (SELECT id FROM datasets WHERE slug = 'ho-so-34-tinh-thanh-2025');
```

**Pass**: 3 rows (province_stats, wards, leadership), each with `preview_rows = 10`.

```sql
SELECT count(*) FROM data_dictionary
WHERE dataset_id = (SELECT id FROM datasets WHERE slug = 'ho-so-34-tinh-thanh-2025');
```

**Pass**: ≥ 20 rows.

## V4 — API responds

Start the dev server:

```bash
npm run dev
```

In another terminal:

```bash
curl -s http://localhost:3000/api/datasets
```

**Pass**: HTTP 200, JSON array with 1 element. The element has `slug: "ho-so-34-tinh-thanh-2025"`, `title: "Hồ sơ 34 tỉnh thành 2025"`, `likes: 34`.
**Fail**: 500 error (check Supabase env vars in `.env.local`), empty array (seed didn't run), or missing fields (row→Dataset mapping bug).

## V5 — Listing renders real data

Open `http://localhost:3000/` in a browser. Verify manually:

- [ ] Exactly 1 dataset row is visible.
- [ ] The row shows `ninh/ho-so-34-tinh-thanh-2025` (org/name format), a blue `Viewer` badge, metadata `Updated • 258 rows • 3 files • 2.4 MB`, and `★ 34`.
- [ ] No "DEMO" badge (mocks are hidden, not badged).
- [ ] The left sidebar shows filter groups (Lĩnh vực, Quy mô, Định dạng, Tags) with counts.
- [ ] Typing "tỉnh" in the search box keeps the row visible; typing "xyz" hides it.
- [ ] The sort dropdown changes (toggle between Trending / Recently updated / Most downloaded / Most liked — row stays since only 1).
- [ ] Clicking the row navigates to `/datasets/ho-so-34-tinh-thanh-2025`.

To confirm the data is DB-sourced (not mock), temporarily change `likes` in the DB:

```sql
UPDATE datasets SET likes = 999 WHERE slug = 'ho-so-34-tinh-thanh-2025';
```

Refresh `/`. **Pass**: the row shows `★ 999`. Then revert:

```sql
UPDATE datasets SET likes = 34 WHERE slug = 'ho-so-34-tinh-thanh-2025';
```

## V6 — Decisions implemented

- [ ] `datasets` table has `downloads` and `likes` columns, does NOT have `quality_score` or `last_verified_at`. (Verified in V3.)
- [ ] No "DEMO" badge logic anywhere in `src/`. (Verified by `grep -rni "demo" src/` returning nothing relevant.)
- [ ] The mock file `src/lib/mock/datasets.ts` still exists but contains ONLY the hero dataset (4 other datasets removed). It has a TEMPORARY comment.
- [ ] Listing reads from `listDatasets()` (DB), not from the mock array. Confirmed by the V5 DB-mutation test.

> **Legacy code removal** (old entity routes/pages/storage) is validated in its own spec: `specs/2026-06-24-remove-legacy-entity-stack/`. F1 does not delete that code, so its presence is not an F1 failure.

## Not required for F1

- Detail page (`/datasets/[slug]`) reading from DB — that is F2. For F1 the detail page may still read the slimmed mock file.
- Data Viewer histograms rendering real data — F3.
- Files tab download working — F4.
- `.env.example` committed to git — it just needs to exist locally.
- Browser pixel-level comparison against the prototype — `prototype/hf-clone.html` remains the visual ground truth.
