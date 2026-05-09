# Hồ sơ toàn cảnh 34 tỉnh, thành Việt Nam

## Overview

**34 Tỉnh Thành** is a data platform that:

1. **Collects** — import socio-economic indicators, infrastructure data, climate events, and geographic layers for Vietnam's 34 provinces (post-merger)
2. **Normalizes** — clean, validate, and map old province codes to the new 34-province structure with minimum 5-year time series
3. **Stores** — maintain a structured, queryable database with full data lineage (source → import → data point), plus cloud file storage for geographic data
4. **Browses** — let journalists search, filter, and explore indicators, entities, events, and geographic layers by province, category, and year
5. **Exports** — output clean datasets in formats ready for articles and visualizations (JSON, CSV, GeoJSON)

## Motivation

Vietnam's 2025 administrative merger reduced 63 provinces to 34. This creates three gaps:

- **Merge gap**: No unified dataset that maps pre-merger data to the new 34-province structure — journalists must stitch this manually
- **Access gap**: VNExpress reporters rely on scattered GSO PDFs and Excel files — no single place to browse, compare, and query provincial data
- **Reusability gap**: Each data story starts from scratch — no shared newsroom database with consistent schemas and data dictionary

## Target Audience

- **Hoa (Reporter)**: Needs to find specific indicators (GRDP, school count, hospital beds) for a province to cite in an article. Non-technical — expects a search bar and export button.
- **Minh (Editor)**: Wants to browse what data is available, spot trends across provinces, and assign stories. May upload new datasets received from government agencies.
- **Ninh (Data Journalist)**: Builds the pipeline, writes preprocessing scripts, designs visualizations. Power user who also manages the system.

## Scope

### MVP (shippable after Month 5 core data is collected)

- [ ] PostgreSQL schema (11 tables, hybrid: fixed columns + JSONB)
- [ ] 34 provinces seeded (post-merger, with old_codes mapping)
- [ ] Month 5 core data imported (10-15 indicators × 34 provinces × 5 years)
- [ ] Python import pipeline (CSV/Excel → clean → database)
- [ ] Web dashboard: browse, query, export data
- [ ] Import UI: journalists can upload new datasets without code
- [ ] Data lineage: every data point traces to its source
- [ ] Auto-generated data dictionary

### Post-MVP (incremental, no system changes)

Months 6–12 data (socio-economic, rankings, infrastructure, climate, yearbooks, industry) imported incrementally through the same import workflow. The system doesn't change — only more data flows in.

### Deferred (Post-MVP)

- User authentication and role-based access (MVP is internal tool, trusted users)
- Public-facing data portal (separate project)

## Success Metrics

| What We Measure | Success Threshold | Method |
|-----------------|-------------------|--------|
| Data coverage | All 34 provinces × 10 indicators × 5 years populated | Count rows in database |
| Import workflow | A journalist can import a new CSV without help | User test with Hoa/Minh |
| Query speed | Dashboard loads province profile in < 2 seconds | Measure page load time |
| Data accuracy | Imported values match source within rounding tolerance | Spot-check 5 random provinces |
| Reusability | Data dictionary covers 100% of stored indicators | Verify every indicator has metadata |

## Open Questions

1. Which Supabase/Neon free tier is sufficient for initial data volume (~34 provinces × 40 indicators × 5 years)?
2. Should province codes follow the new GSO standard or define our own internal IDs?
3. How to handle provinces that merged from multiple old provinces — sum, weighted average, or keep all variants?
