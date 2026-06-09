# Spec 1.1 Validation — Database Schema

## Definition of Done

1. SQL migration chạy thành công trên Supabase
2. 5 tables tồn tại: datasets, resources, data_dictionary, tags, upload_log
3. Foreign keys đúng: resources.dataset_id → datasets.id, etc.
4. `GET /api/datasets` trả `[]` (empty)
5. `POST /api/datasets` tạo dataset, trả slug
6. `GET /api/datasets/[slug]` trả dataset + resources
7. `POST /api/datasets/[slug]/resources` tạo resource
8. Old endpoints (`/api/entities/*`) đã xóa
9. `npm run build` exit 0
