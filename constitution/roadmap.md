# Roadmap

Phases are intentionally small — each one is a shippable slice, independently reviewable and testable.

Data collection (Tháng 5–12 from PROJECT_PLAN.md) runs in parallel — these phases build the *system*, the data fills it.

---

## Phase 1 — Database Schema & Seed

- Design PostgreSQL schema (provinces, indicators, data_points, import_logs)
- Set up Supabase project and connect from local environment
- Write Python seed script to populate 34 provinces + Month 5 core data (10 indicators × 5 years)
- Verify: can query province data from command line

## Phase 2 — Data Pipeline (Python)

- Build Python scripts to import CSV/Excel → clean → normalize → insert into database
- Handle province merge mapping (old codes → new 34)
- Add validation (required columns, data types, duplicate detection)
- Log every import (rows imported, skipped, errors)

## Phase 3 — Newsroom Dashboard: Browse & Query

- Set up Next.js project with Tailwind CSS
- Build province list page (search, filter by region)
- Build province profile page (all indicators for one province)
- Build indicator browser (filter by category, year)
- API routes to serve data from PostgreSQL

## Phase 4 — Newsroom Dashboard: Import & Data Dictionary

- Build CSV/Excel upload form (drag & drop, column mapping)
- Auto-generate data dictionary from indicators table
- Import history page (see past uploads, row counts, errors)
- Export functionality (filtered data → CSV/JSON download)

## Phase 5 — Deploy to Production

- Push to GitHub, connect Vercel, deploy
- Set up Supabase production database
- Seed production with available data
- Environment variables, error pages, basic logging

## Phase 6 — Polish & Hardening

- Responsive design pass (mobile-friendly for field reporting)
- Loading states, error messages, empty states (all in Vietnamese)
- Input sanitization and file validation
- Performance audit (query optimization, caching)

---

Later phases (not yet planned): User authentication, public data portal, visualization embed widgets, automated GSO data fetching.

## Replanning Log

| Date | Phase Completed | What Changed | Why |
|------|----------------|--------------|-----|
