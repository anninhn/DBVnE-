# Roadmap

Mỗi phase bổ sung data vào cùng một hệ thống. Phase 1 xây hệ thống wiki từ đầu; Phase 2–7 thêm data qua cùng workflow; Phase 8 promote hot indicators cho dashboard.

---

## Phase 1 — Wiki Infrastructure & Core Data (Tháng 5–6)

- Setup Supabase project, tạo 5 tables (entities_catalog, resources, resource_versions, indicator_metadata, tags)
- Setup Cloudflare R2 bucket, cấu trúc thư mục `/{entity_id}/{year}/`
- Seed 34 tỉnh (entities_catalog) + controlled tags + indicator_metadata cơ bản
- Build Next.js wiki app: homepage search, trang tỉnh (resource list), upload form
- Build version history: mỗi update tạo snapshot trong resource_versions
- Build data dictionary page (auto-generated từ indicator_metadata)
- Import core data: địa giới hành chính, lãnh đạo, dân số, ngân sách, GRDP, FDI (10-15 indicators × 34 provinces × 5 years)
- Python pipeline: CSV/Excel → clean → upload via API
- Deploy: Vercel + Supabase + R2
- **Deliverable**: Production wiki, phóng viên có thể browse, search, upload, download

## Phase 2 — Socio-economic Data (Tháng 6)

- Import education data: số trường, giáo viên, điểm chuẩn, tỷ lệ chọi
- Import healthcare data: bệnh viện, giường bệnh, nhân viên y tế
- Import labor & employment data
- Mở rộng indicator_metadata + tags
- Dataset: ~30-40 indicators total

## Phase 3 — Rankings Data (Tháng 7)

- Import PCI, PAPI, PAR Index, SIPAS scores + ranks (3-5 years)
- Resource type `ranking` — structured_data chứa score + rank
- Dataset: all 34 provinces ranked across 4 indices

## Phase 4 — Infrastructure Data (Tháng 8)

- Import highways, airports, seaports, industrial zones, public investment projects
- File quy hoạch (PDF) upload lên R2, resource type `document`
- Dataset: hạ tầng trọng yếu + file quy hoạch

## Phase 5 — Climate & Environment Data (Tháng 9)

- Import climate indicators: nhiệt độ, lượng mưa, chất lượng không khí
- Import disaster events: bão, lũ, sạt lở
- File báo cáo thiên tai upload lên R2
- Dataset: khí hậu + thiên tai + file đính kèm

## Phase 6 — Yearbook Data (Tháng 10)

- Import statistical yearbook data cho 34 provinces (minimum 5 years)
- Bulk import: nhiều indicators mới → mở rộng indicator_metadata
- Dataset: comprehensive per-province profiles

## Phase 7 — Industry & Enterprise Data (Tháng 11)

- Import từ sách trắng: doanh nghiệp, CNTT-TT, thương mại điện tử, logistics
- Sector-level data, resource type `dataset` + files R2
- Bắt đầu ghi âm phỏng vấn (MP3) → upload resource type `audio`

## Phase 8 — Promote Hot Indicators & Dashboard v1 (Tháng 12)

- Phân tích usage: indicators nào phóng viên tra nhiều nhất
- Promote hot indicators → materialized views
- Build dashboard đơn giản: so sánh tỉnh, bản đồ heatmap
- Responsive design pass
- Performance audit
- Finalize data dictionary
- **Deliverable**: Wiki v1 + Dashboard v1, sẵn sàng dùng lâu dài

---

## Post-MVP Features

- Text-to-SQL: natural language query (journalist types question → LLM → returns data)
- User authentication and role-based access
- Public-facing data portal (project riêng)
- Visualization embed widgets cho bài báo
- Automated data fetching từ GSO sources

## Replanning Log

| Date | Phase Completed | What Changed | Why |
|------|----------------|--------------|-----|
| 2026-05-09 | Schema design | 11 tables hybrid → 5 tables wiki | Phóng viên cần browse/download, không cần analytics engine |
| 2026-05-09 | Roadmap | 8 phases aligned with PROJECT_PLAN.md | Phase 1 delivers wiki; phases 2-7 add data; phase 8 adds dashboard |
| 2026-06-08 | Architecture | Redesign: analytics database → wiki/HF hub | Phản biện: wiki model phù hợp use case newsroom hơn, promote dashboard sau khi biết hot indicators |
