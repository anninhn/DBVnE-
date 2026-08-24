# F1 Plan — Dataset Catalog & Listing

> Implements `requirements.md`. Work in the order below; each group is independently verifiable.

## Group 1 — Schema migration (run on Supabase)

**Goal**: replace the entity-centric schema with the dataset-centric schema from `requirements.md` §4.1.

1. Write `data/scripts/005_dataset_hub_schema.sql` containing:
   - `DROP TABLE IF EXISTS resource_versions CASCADE;`
   - `DROP TABLE IF EXISTS resources CASCADE;`
   - `DROP TABLE IF EXISTS indicator_metadata CASCADE;`
   - `CREATE TABLE datasets (...)` — columns per requirements §4.1, including `downloads`/`likes`, **excluding** `quality_score`/`last_verified_at`.
   - `CREATE TABLE resources (...)` — `dataset_id` FK to `datasets`.
   - `CREATE TABLE data_dictionary (...)` — `dataset_id` FK to `datasets`.
   - `CREATE TABLE upload_log (...)` — `dataset_id` FK + nullable `resource_id` FK.
   - Indexes: `idx_resources_dataset`, `idx_resources_type`, `idx_resources_tags_gin`, `idx_resources_structured_gin`.
   - **Do NOT touch**: `entities_catalog`, `province_stats`, `wards`, `leadership`, `tags`.
2. Apply `005` to Supabase using credentials from `.env.local`:
   ```bash
   psql "$DATABASE_URL" -f data/scripts/005_dataset_hub_schema.sql
   ```
   (Derive `$DATABASE_URL` from `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, or use the Supabase pooler connection string if present in `.env.local`.)
3. Verify: `\dt` (or a `SELECT` from `information_schema.tables`) shows `datasets`, `resources`, `data_dictionary`, `upload_log`. Confirm `province_stats`/`wards`/`leadership`/`entities_catalog`/`tags` still exist.

## Group 2 — Seed the hero dataset (run on Supabase)

**Goal**: insert one real dataset so the listing and later features have data to render.

4. Write `data/scripts/006_seed_hero_dataset.sql` containing:
   - `INSERT INTO datasets (...) VALUES (...)` — one row:
     - `slug = 'ho-so-34-tinh-thanh-2025'`, `title = 'Hồ sơ 34 tỉnh thành 2025'`
     - `category = 'xa-hoi'`, `tags = ARRAY['vĩ mô','dân số','GRDP','hành chính','sáp nhập 2025','lãnh đạo']`
     - `license = 'internal'`, `year_range = ARRAY[2025]`
     - `row_count = 258`, `file_count = 3`, `total_size_mb = 2.4`
     - `downloads = 142`, `likes = 34` (illustrative until usage tracking exists)
     - `source = 'Tổng cục Thống kê + báo cáo UBND các tỉnh (2025)'`
     - `uploaded_by = 'Ninh'`
     - Use `RETURNING id` into a variable (e.g. `:ds_id`) so the resource/dictionary inserts can reference it.
   - `INSERT INTO resources (...)` — three rows referencing `:ds_id`:
     - Resource 1 "Thống kê kinh tế - xã hội 34 tỉnh": `resource_type='data'`, `file_type='csv'`, `file_size_mb=0.4`, `structured_data = (SELECT jsonb_agg(to_jsonb(t) - 'created_at') FROM (SELECT * FROM province_stats ORDER BY entity_id LIMIT 10) t)`, `columns = '[...]'` (the province_stats column list per `requirements.md` §4.1).
     - Resource 2 "Xã phường mới sau sáp nhập": same pattern, source = `SELECT * FROM wards WHERE entity_id='VN-HCM' ORDER BY ward_name LIMIT 10`.
     - Resource 3 "Lãnh đạo 34 tỉnh": source = `SELECT * FROM leadership ORDER BY entity_id LIMIT 10`.
   - `INSERT INTO data_dictionary (...)` — ~25 rows referencing `:ds_id`. Port the exact column definitions from `src/lib/mock/datasets.ts` (`provinceStatsColumns`, `wardsColumns`, `leadershipColumns` arrays). Each row: `column_name`, `label_vi`, `data_type`, `unit`, `description`, `source`.
5. Apply `006` to Supabase:
   ```bash
   psql "$DATABASE_URL" -f data/scripts/006_seed_hero_dataset.sql
   ```
6. Verify:
   ```sql
   SELECT slug FROM datasets;                                    -- 1 row
   SELECT title FROM resources WHERE dataset_id = :ds_id;        -- 3 rows
   SELECT count(*) FROM data_dictionary WHERE dataset_id = :ds_id;  -- ~25
   SELECT jsonb_array_length(structured_data) FROM resources WHERE title LIKE 'Thống kê%';  -- 10
   ```

## Group 3 — Types + data access layer (TypeScript)

**Goal**: create the seam where the frontend stops reading the mock file and starts reading Supabase.

7. Create `src/lib/types/dataset.ts`:
   - Move these from `src/lib/mock/datasets.ts`: `Category`, `ResourceType`, `FileType`, `DataDictionaryEntry`, `Resource`, `Dataset`, `CATEGORY_LABELS`, `RESOURCE_TYPE_LABELS`.
   - Keep the type definitions byte-identical (the components depend on this shape).
8. Create `src/lib/data/datasets.ts`:
   ```ts
   import { getSupabase } from "@/lib/db/supabase";
   import type { Dataset, Resource, DataDictionaryEntry } from "@/lib/types/dataset";

   export async function listDatasets(): Promise<Dataset[]> { ... }
   export async function getDatasetBySlug(slug: string): Promise<Dataset | null> { ... }
   ```
   - `listDatasets`: `getSupabase().from('datasets').select('*')`, map each Postgres row to `Dataset`. Map `text[]`→`string[]`, `int[]`→`number[]`, timestamps→ISO string. Returns the array (no resources/dictionary — lightweight for listing).
   - `getDatasetBySlug`: fetch the dataset row, then `from('resources').select('*').eq('dataset_id', id)`, then `from('data_dictionary').select('*').eq('dataset_id', id)`. Assemble into one `Dataset`. Return `null` if no dataset row.
   - Throw a clear error if Supabase env vars are missing (so a misconfigured deploy fails loudly, not silently).
9. Regenerate `src/lib/db/types.ts` with `npx supabase gen types --project-id <id> > src/lib/db/types.ts` to capture the new schema. (If `gen types` is unavailable, hand-update `types.ts` to add the new tables — but regen is preferred.)

## Group 4 — API route

**Goal**: expose the listing data over HTTP (used by the frontend now; usable by future client components and external tools).

10. Create `src/app/api/datasets/route.ts`:
    ```ts
    import { NextResponse } from "next/server";
    import { listDatasets } from "@/lib/data/datasets";

    export async function GET() {
      const datasets = await listDatasets();
      return NextResponse.json(datasets);
    }
    ```
    - Wrap in try/catch returning 500 with `{ error }` on failure.

## Group 5 — Wire the frontend to the data layer

**Goal**: the listing reads from the database. Component code does not change.

11. Rewrite `src/app/page.tsx`:
    - Remove `import { datasets } from "@/lib/mock/datasets"`.
    - Add `import { listDatasets } from "@/lib/data/datasets"`.
    - Make the component `async`: `export default async function Home() { const datasets = await listDatasets(); ... }`.
    - The rest of the JSX (`<DatasetExplorer datasets={datasets} />`) stays the same.
12. Update imports across the 6 files that import from `@/lib/mock/datasets`:
    - `src/app/page.tsx`, `src/components/DatasetExplorer.tsx`, `src/app/datasets/[slug]/page.tsx`, `src/app/datasets/[slug]/DatasetViewer.tsx`, `src/app/datasets/[slug]/MetadataSidebar.tsx` → change to `@/lib/types/dataset`.
    - **Note**: `datasets/[slug]/page.tsx` still calls the old sync `getDatasetBySlug` from the mock. For F1 only the *listing* needs to be real (per scope). Leave the detail page reading the mock for now — it will be rewired in F2. To avoid a broken import after the mock file is slimmed (step 13), keep a minimal `src/lib/mock/datasets.ts` containing only the `getDatasetBySlug` + the hero data until F2.
13. **Slim the mock file** (do NOT delete yet — detail page still uses it until F2; full deletion is in the cleanup spec `specs/2026-06-24-remove-legacy-entity-stack/`):
    - `src/lib/mock/datasets.ts`: remove the 4 non-hero mock datasets (GRDP, bầu cử, khí hậu, FDI) and their helper data. Keep only `getDatasetBySlug` + the hero dataset's full definition (with all 34 province rows etc.). Update its imports to pull types from `@/lib/types/dataset`. Add a comment: "TEMPORARY — replaced by F2. Hero data here is duplicated with the DB seed; do not edit."

> **Legacy code deletion** (old entity routes, pages, storage library) is tracked separately in `specs/2026-06-24-remove-legacy-entity-stack/`. It is not part of F1 — F1 must build and pass validation with that code still present.

## Group 6 — Environment + final verification

14. Create `.env.example` at repo root:
    ```
    NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
    ```
    (Document only the variable names — no real values.)
15. Run `npm run build` — must exit 0 with no TypeScript errors.
16. Run `npm run dev`, then verify with curl:
    ```bash
    curl -s http://localhost:3000/api/datasets | head -c 200
    # Expect: JSON array containing the hero dataset
    ```
17. Open `http://localhost:3000/` in a browser:
    - 1 dataset row visible (hero).
    - Row shows: `ninh/ho-so-34-tinh-thanh-2025`, `Viewer` badge, `Updated • 258 rows • 3 files • 2.4 MB`, `★ 34`.
    - Sidebar filter checkboxes present with counts.
    - Search box filters the row (type "tỉnh").
    - Sort dropdown changes ordering (only 1 row, so test by toggling).
    - Click the row → navigates to `/datasets/ho-so-34-tinh-thanh-2025` (detail page may still show mock data until F2 — that's expected).
