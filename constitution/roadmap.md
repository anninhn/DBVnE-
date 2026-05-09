# Roadmap

Phases align with PROJECT_PLAN.md monthly data collection plan. Each phase completes one or more datasets. Phase 1 initializes the entire system from scratch (database, pipeline, dashboard, deploy); subsequent phases import data incrementally through the same pipeline and dashboard.

---

## Phase 1 — Init, Dashboard & Core Data (Month 5)

- Set up Supabase project, create all 11 tables (hybrid schema)
- Set up Python environment (venv, psycopg2, pandas)
- Build import pipeline: CSV/Excel → clean → normalize → insert
- Seed provinces (34 rows) + categories
- Import core data: địa giới hành chính, lãnh đạo, dân số, ngân sách, GRDP, FDI (10-15 indicators × 34 provinces × 5 years)
- Build Next.js web dashboard: browse, query, export data
- Import UI: upload CSV/Excel without code
- Data dictionary (auto-generated from indicators + sources)
- Data lineage UI: click any number → see source + import history
- Geographic data: upload province boundaries to cloud storage, seed geo_layers, MapLibre integration
- Deploy to production: Vercel + Supabase + cloud storage
- Create data dictionary (first version)
- Deliverable: production-ready newsroom database with Month 5 core data

## Phase 2 — Socio-economic Data (Month 6)

- Import education data: số trường, giáo viên, điểm chuẩn, tỷ lệ chọi
- Import healthcare data: bệnh viện, giường bệnh, nhân viên y tế
- Import labor & employment data
- Expand indicators table with new sub-categories
- Dataset: ~30-40 indicators total

## Phase 3 — Rankings Data (Month 7)

- Import PCI, PAPI, PAR Index, SIPAS scores + ranks (3-5 years)
- First use of `score` and `rank` columns in data_points
- Standardize all rankings to unified province × year format
- Dataset: all 34 provinces ranked across 4 indices

## Phase 4 — Infrastructure Data (Month 8)

- Import highways, airports, seaports, industrial zones, public investment projects
- First use of `entities` + `entity_provinces` tables (JSONB attrs)
- Dataset: infrastructure registry with geographic references

## Phase 5 — Climate & Environment Data (Month 9)

- Import climate indicators: nhiệt độ, lượng mưa, chất lượng không khí → data_points
- Import disaster events: bão, lũ, sạt lở → events + event_provinces tables
- First use of `events` table
- Dataset: climate time-series + disaster event records

## Phase 6 — Yearbook Data (Month 10)

- Import statistical yearbook data for all 34 provinces (minimum 5 years)
- Bulk import: may require many new indicators
- Dataset: comprehensive per-province profiles

## Phase 7 — Industry & Enterprise Data (Month 11)

- Import data from white papers: doanh nghiệp, CNTT-TT, thương mại điện tử, logistics
- Sector-level data per province
- Dataset: industry composition for all 34 provinces

## Phase 8 — Polish & Package v1 (Month 12)

- Responsive design pass (mobile-friendly)
- Loading states, error messages, empty states (all in Vietnamese)
- Performance audit (query optimization, caching)
- Input sanitization, file validation
- Finalize data dictionary
- Deliverable: production v1, shared newsroom database ready for ongoing use

---

## Post-MVP Features

- Text-to-SQL: natural language query (journalist types question → LLM generates SQL → returns data)
- User authentication and role-based access
- Public-facing data portal (separate project)
- Visualization embed widgets for articles
- Automated data fetching from GSO sources

## Replanning Log

| Date | Phase Completed | What Changed | Why |
|------|----------------|--------------|-----|
| 2026-05-09 | Schema design | Redefined from 4 tables to 11 tables (hybrid approach) | Expanded to cover 6 data patterns across all 8 months |
| 2026-05-09 | Roadmap | 8 phases aligned with PROJECT_PLAN.md months | Phase 1 delivers full working system; phases 2-7 add data; phase 8 polish |
