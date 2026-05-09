# 34 Tỉnh Thành — Tech Stack

## System Design

A Next.js web application with a PostgreSQL database. Journalists interact through a browser-based dashboard. Data enters the system via Python scripts (batch) or a web upload form (ad-hoc). The whole stack deploys to Vercel + Supabase.

```
Frontend:    Next.js 15 (App Router) + Tailwind CSS
API:         Next.js API Routes (serverless functions)
Database:    PostgreSQL on Supabase (free tier)
Pipeline:    Python 3 + pandas (runs locally, writes to DB)
Hosting:     Vercel (auto-deploys from GitHub)
```

## Why These Choices

If you're new to this, here's what each piece does and why:

| Layer | Technology | What It Does | Why This One |
|-------|-----------|-------------|-------------|
| Framework | **Next.js** | Builds both the web pages and the backend API in one project | Most popular React framework, Vercel's own product = perfect deploy experience |
| Language | **TypeScript** | Like JavaScript but catches errors before running | Industry standard, prevents bugs |
| Database | **PostgreSQL** | Stores data in tables (like Excel sheets but relational) | Most popular open-source database, Supabase hosts it free |
| Database host | **Supabase** | Manages the database server for you | Free tier, nice web dashboard, no server setup needed |
| CSS | **Tailwind CSS** | Utility classes for styling (no separate CSS files) | Fast to build, consistent design |
| Data pipeline | **Python + pandas** | Scripts that clean raw CSV/Excel and insert into database | You already know pandas from the metro project |
| Hosting | **Vercel** | Serves the website to the internet | Free tier, connects to GitHub, deploys automatically on push |
| Version control | **Git + GitHub** | Tracks code changes, enables collaboration | Industry standard, required for Vercel deploy |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | (required) | PostgreSQL connection string from Supabase |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | App URL for metadata |

## Core Pipeline

```
1. INGEST
   ├── User uploads CSV/Excel via web UI, or Ninh runs Python script
   └── File is validated (required columns, data types)

2. NORMALIZE
   ├── Map old province codes → new 34-province structure
   ├── Standardize column names to internal schema
   └── Handle missing values, unit conversion, year alignment

3. STORE
   ├── Insert into PostgreSQL with provenance metadata
   └── Update data dictionary automatically

4. SERVE
   ├── Journalist queries via dashboard (province, indicator, year range)
   └── Export as JSON or CSV
```

## Data Model

### `provinces`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | Auto-increment |
| `code` | TEXT | UNIQUE, NOT NULL | New GSO province code |
| `name` | TEXT | NOT NULL | e.g. "TP. Hồ Chí Minh" |
| `region` | TEXT | NOT NULL | e.g. "Đông Nam Bộ" |
| `old_codes` | TEXT[] | | Array of pre-merger province codes |

### `indicators`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | Auto-increment |
| `slug` | TEXT | UNIQUE, NOT NULL | e.g. "grdp" |
| `name` | TEXT | NOT NULL | e.g. "GRDP" |
| `category` | TEXT | NOT NULL | e.g. "kinh-te", "giao-duc" |
| `unit` | TEXT | NOT NULL | e.g. "tỷ đồng", "%" |
| `source` | TEXT | | e.g. "Tổng cục Thống kê" |
| `description` | TEXT | | How the indicator is measured |
| `updated_at` | TIMESTAMPTZ | | Last data refresh |

### `data_points`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | Auto-increment |
| `province_id` | INT | FK → provinces | |
| `indicator_id` | INT | FK → indicators | |
| `year` | INT | NOT NULL | |
| `value` | NUMERIC | NOT NULL | |
| `source_file` | TEXT | | Original file name |
| `imported_at` | TIMESTAMPTZ | DEFAULT NOW() | Provenance |

**Unique constraint**: `(province_id, indicator_id, year)` — one value per province/indicator/year.

### `import_logs`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | SERIAL | PK | Auto-increment |
| `filename` | TEXT | NOT NULL | Original file name |
| `rows_imported` | INT | | Successful rows |
| `rows_skipped` | INT | | Failed/invalid rows |
| `errors` | JSONB | | Details of skipped rows |
| `imported_at` | TIMESTAMPTZ | DEFAULT NOW() | |

## API Design

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/provinces` | List all 34 provinces |
| `GET` | `/api/provinces/:code` | Single province with all indicators |
| `GET` | `/api/indicators` | List all indicators (with filters) |
| `GET` | `/api/data?province=X&indicator=Y&year=Z` | Query data points |
| `POST` | `/api/import` | Upload CSV/Excel file |
| `GET` | `/api/export?province=X&indicator=Y&format=csv` | Export dataset |

## Project Layout

```
/
├── constitution/           — SDD specs
├── specs/                  — Feature specs
├── data/                   — Raw data files (CSV, Excel)
├── scripts/                — Python pipeline scripts
│   ├── parse_*.py          — Data cleaning scripts
│   ├── seed.py             — Initial database seeding
│   └── requirements.txt    — Python dependencies
├── src/
│   ├── app/
│   │   ├── page.tsx        — Dashboard home
│   │   ├── provinces/      — Province profiles
│   │   ├── indicators/     — Browse indicators
│   │   ├── import/         — Upload data
│   │   └── api/            — API routes
│   ├── lib/
│   │   ├── db/             — Database client & schema
│   │   └── pipeline/       — Import/normalize logic
│   └── components/         — Shared UI components
├── public/                 — Static assets
├── package.json
├── next.config.js
└── tailwind.config.js
```

## Testing Approach

### Smoke Test: Import and Query
1. Run `scripts/seed.py` → verify 34 provinces inserted
2. Upload a test CSV via `/api/import` → verify rows in `data_points`
3. Query `/api/data?province=79&indicator=grdp` → verify JSON response
4. Open dashboard → verify province list renders

## Constraints

- **Free tier**: Supabase free tier (500MB, 50K rows) must be sufficient for MVP
- **No auth for MVP**: Internal tool, trusted users only
- **Vietnamese UI**: All labels, messages, and data dictionary in Vietnamese
- **Mobile-friendly**: Journalists may browse on phones during field reporting

## Open Questions

1. Should we use Supabase client library or raw SQL via Drizzle ORM? (Recommend Drizzle for learning + portability)
2. File size limits for CSV/Excel upload — what's the largest file we expect?
