# Phase 1 Requirements — Wiki Infrastructure & Core Data

## Scope

### Database
- PostgreSQL schema: 5 tables (entities_catalog, resources, resource_versions, indicator_metadata, tags)
- Seed 34 provinces (post-merger) vào entities_catalog
- Seed indicator_metadata cho 10-15 core indicators (GRDP, dân số, ngân sách, FDI...)
- Seed controlled tags (vĩ mô, giáo dục, y tế, hạ tầng, khí hậu, xếp hạng...)
- Indexes: GIN cho JSONB + tags, B-tree cho entity_id, resource_type, year

### Object Storage
- Cloudflare R2 bucket (hoặc Supabase Storage — quyết định khi implement)
- Cấu trúc thư mục: `/{entity_id}/{year}/{filename}`

### API
- `GET /api/entities` — liệt kê 34 tỉnh
- `GET /api/entities/:id` — trang tỉnh: entity info + danh sách resources
- `POST /api/resources` — upload resource mới (structured_data + file đính kèm)
- `GET /api/dictionary` — data dictionary (từ indicator_metadata)

### Web UI (tối giản)
- **Homepage**: danh sách 34 tỉnh (cards), click vào → trang tỉnh
- **Trang tỉnh**: tên tỉnh, thông tin cơ bản (vùng, old_codes), danh sách resources
- **Resource list**: mỗi resource hiển thị title, type, year, tags, link download (nếu có file)
- **Upload form**: chọn tỉnh, nhập title, chọn type, nhập structured_data (JSON textarea), upload file, nhập source, tags

## Out of Scope

- Version history UI (resource_versions table tồn tại nhưng chưa có UI)
- Search / full-text search
- Tags filter UI
- Dashboard / charts / visualization
- Authentication / authorization
- Data dictionary page (API có, UI để sau)
- Responsive optimization (mobile sau)
- Python import pipeline (CSV → API) — dùng upload form thủ công cho MVP

## Decisions

### ORM / DB client
Giữ open. Quyết định khi implement dựa trên trải nghiệm thực tế.

### Province codes
Giữ open. entities_catalog dùng entity_id VARCHAR — có thể là `VN-LA` hoặc GSO code, quyết định khi seed data.

### File storage
R2 hay Supabase Storage — quyết định khi implement. Interface giống nhau (upload → nhận URL → lưu vào resources.file_url).

### Upload format cho structured_data
JSON textarea thô trong upload form. Phóng viên không dùng feature này cho MVP — Ninh sẽ dùng Python pipeline hoặc nhập thủ công.

## Context

Phase 1 chứng minh kiến trúc wiki hoạt động: 5 tables, resource-centric, JSONB cho structured data. Mục tiêu là có production URL với 34 tỉnh seeded, một số core data, và upload form hoạt động. Phóng viên có thể vào trang tỉnh, thấy data, tải file.

## Stakeholder Notes

- **Hoa (Reporter)**: Cần thấy trang tỉnh rõ ràng, click tải file được. Upload form MVP không dành cho Hoa — để Ninh/Minh nhập data ban đầu.
- **Minh (Editor)**: Browse danh sách tỉnh, xem data tỉnh nào có gì. Chưa cần upload.
- **Ninh (Data Journalist)**: Dùng upload form để nhập core data. Verify data dictionary API hoạt động. Sẽ build Python pipeline sau.
