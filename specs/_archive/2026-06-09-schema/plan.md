# Spec 1.1 Plan — Database Schema

## Group 1 — Migration SQL
1. Viết SQL migration: DROP old tables, CREATE 5 new tables + indexes
2. Chạy migration trên Supabase

## Group 2 — API Endpoints
3. Tạo `/api/datasets/route.ts` — GET (list) + POST (create)
4. Tạo `/api/datasets/[slug]/route.ts` — GET (detail) + PUT (update)
5. Tạo `/api/datasets/[slug]/resources/route.ts` — POST (upload resource)
6. Tạo `/api/datasets/[slug]/preview/route.ts` — GET (paginated preview)
7. Tạo `/api/tags/route.ts` — GET (tags vocabulary)
8. Xóa old API endpoints (`/api/entities/*`, `/api/resources/*`)

## Group 3 — Verify
9. `npm run build` — exit 0
10. Test API: POST tạo dataset, GET list, GET detail, POST resource
