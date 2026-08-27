# Phase 1 Plan — Wiki Infrastructure & Core Data

## Group 1 — Database & Seed

1. Setup Supabase project, chạy DDL tạo 5 tables (entities_catalog, resources, resource_versions, indicator_metadata, tags) với đầy đủ indexes
2. Seed entities_catalog: 34 tỉnh (entity_id, entity_name, entity_type='PROVINCE', region, old_codes)
3. Seed indicator_metadata: 10-15 core indicators (key, name_vi, unit, category, description)
4. Seed tags: controlled vocabulary (vĩ mô, giáo dục, y tế, hạ tầng, khí hậu, xếp hạng, quy hoạch, phỏng vấn...)

## Group 2 — API

5. Init Next.js 15 project (App Router + TypeScript + Tailwind)
6. Setup database client (kết nối Supabase PostgreSQL)
7. `GET /api/entities` — liệt kê entities (id, name, type, region, tags)
8. `GET /api/entities/:id` — entity detail + resources JOIN
9. `POST /api/resources` — tạo resource mới + version snapshot tự động
10. `GET /api/dictionary` — data dictionary từ indicator_metadata

## Group 3 — Storage

11. Setup file storage (R2 hoặc Supabase Storage) + upload helper function
12. Integrate file upload vào `POST /api/resources` — file → storage → URL → lưu resources.file_url

## Group 4 — Web UI

13. Homepage: danh sách 34 tỉnh (cards — tên, vùng, số resources)
14. Trang tỉnh: entity info + danh sách resources (title, type, year, tags, download link)
15. Upload form: chọn entity, nhập title, type, year, structured_data (JSON textarea), file upload, source, tags, uploaded_by

## Group 5 — Deploy & Verify

16. Deploy lên Vercel + Supabase (production URL hoạt động)
17. Chạy `npm run build` — phải exit 0
18. Mở production URL, verify homepage hiển thị 34 tỉnh
19. Verify trang tỉnh hiển thị resources + download link
20. Verify upload form tạo resource mới + version snapshot
