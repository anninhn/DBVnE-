# Data Dictionary Table

> **Branch**: `f1-dataset-catalog` (continues on the F1 branch)
> **Type**: small improvement to the Dataset card tab
> **Status**: Spec — not yet implemented

## What this feature does

Replaces the truncated 8-item bullet list of dataset columns with a **full table**, grouped by resource, showing every column's name, type, unit, and description. The hero dataset's 17 dictionary entries become a readable reference instead of a confusing jumble.

## Why this feature exists

The detail page's "Dataset card" tab currently renders the data dictionary as a bullet list (`src/app/datasets/[slug]/page.tsx:122-143`):
- Truncated to **8 of 17** entries (`.slice(0, 8)`), then "... và 9 trường khác".
- **No resource grouping** — `entity_id`, `population` (province_stats), `ward_name` (wards), `role` (leadership) all appear in one flat list. A reader can't tell which resource each column belongs to.
- **Discards `description` and `source`** — each dictionary row has these fields; neither is shown.

The constitution (roadmap 1.5) originally planned a "Data dictionary page" with full indicator metadata. That was deferred out of the MVP, but the *need* to show column documentation clearly remains. This feature delivers it inline on the detail page.

## Current state

- `data_dictionary` table — 17 rows for the hero dataset. Schema: `dataset_id`, `column_name`, `label_vi`, `data_type`, `unit`, `description`, `source`, `category`, `validation_rules`.
- `data_dictionary` is **dataset-scoped, not resource-scoped** — there is no `resource_id` column. A row documents a *column name*, and that column may appear in multiple resources.
- `resources.columns` JSONB — each resource lists its own columns. Used to determine which columns belong to which resource.

### The column-ownership ambiguity

A column name can appear in multiple resources. Concretely, in the hero dataset:

| Column | province_stats | wards | leadership |
|---|---|---|---|
| `entity_id` | ✓ | ✓ | ✓ |
| `population` | ✓ | ✓ | |
| `area` | ✓ | ✓ | |
| `density` | ✓ | ✓ | |
| `year`, `num_wards`, `grdp`, ... | ✓ | | |
| `ward_name`, `ward_type`, `old_wards`, `hq_name` | | ✓ | |
| `role`, `title`, `name` | | | ✓ |

So the dictionary can't be cleanly partitioned "one row → one resource." A `population` dictionary row applies to both province_stats and wards.

## Target state

### Display: a table per resource
Replace the bullet list with one **table per resource** (3 tables for the hero dataset), each under a sub-heading naming the resource:

```
Thống kê kinh tế - xã hội 34 tỉnh
| Trường        | Tên hiển thị    | Kiểu  | Đơn vị     | Mô tả             |
|---------------|------------------|-------|------------|--------------------|
| entity_id     | Mã tỉnh          | text  |            | Mã định danh...    |
| population    | Dân số           | int   | người      | Tổng dân số        |
| ...           | ...              | ...   | ...        | ...                |

Xã phường mới sau sáp nhập (chi tiết TP HCM)
| Trường        | Tên hiển thị    | Kiểu  | Đơn vị     | Mô tả             |
|---------------|------------------|-------|------------|--------------------|
| entity_id     | Mã tỉnh          | text  |            | (same dict row)    |
| ward_name     | Tên xã/phường    | text  |            |                    |
| ...           | ...              | ...   | ...        | ...                |

Lãnh đạo 34 tỉnh (bí thư, chủ tịch UBND)
| ... |
```

**Why group by resource (not by dictionary row):** the user's mental model is "what columns does *this table* have" — they pick a resource in the viewer dropdown and want to know its columns. Grouping the dictionary by resource answers that directly.

**Handling shared columns:** when a column appears in multiple resources (e.g. `entity_id`), its dictionary row repeats under each resource's table. This is intentional — each table is self-contained. The `description` is the same (one dictionary row), so there's no inconsistency, just repetition. Alternative (show shared columns in a separate "Common columns" table) adds complexity for little gain.

### Mapping logic
For each resource, look up its column names (from `resource.columns`), and for each column name find the matching `data_dictionary` row by `column_name`. If no dictionary row exists for a column (shouldn't happen for well-documented datasets, but possible), render the column name with empty description cells — don't hide it.

### No data model change
The `data_dictionary` table stays as-is. The resource→column→dictionary mapping is done in the component at render time. (Adding a `resource_id` to `data_dictionary` was considered and rejected: it would force choosing one owner for shared columns like `entity_id`, and would require re-seeding. The render-time join is simpler and correct.)

## Decisions

### Group by resource, repeat shared columns
Each resource's table is self-contained. Shared columns (`entity_id`, `population`, ...) repeat under each resource that contains them. Rationale in the target-state section above.

### Render-time join, no schema change
The component computes the resource→dictionary mapping from `resource.columns` + `dataset.data_dictionary`. No `resource_id` column added. Keeps the schema clean and avoids the shared-column ownership problem.

### Show all dictionary fields except `validation_rules`
Columns shown: `column_name` (mono), `label_vi`, `data_type`, `unit`, `description`. `source` is shown as a secondary line under `description` when present (small, muted) — it's useful provenance but not primary. `category` and `validation_rules` are hidden (validation rules are for the future upload/validation feature, not reader-facing).

### Replaces the bullet list, not a new tab
The table goes where the bullet list is now (Dataset card tab, below the description). HF puts the data dictionary inside the README Markdown; we put it as a structured table below the Markdown description. Same place, richer rendering.

## Out of scope

- Adding `resource_id` to the `data_dictionary` table (rejected — see Decisions).
- A standalone "Data dictionary" page (roadmap 1.5, deferred).
- Search/filter within the dictionary table (17 rows doesn't need it; add later if datasets grow large).
- Editing dictionary entries (upload feature).
- `validation_rules` display (future validation feature).

## Personas

- **Ninh (Data Journalist)** — needs to know exactly what each column means before using a dataset in analysis. The table + descriptions are the reference.
- **Minh (Editor)** — sanity-checks dataset structure before publishing.
