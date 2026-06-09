# Spec 1.3 Plan — Dataset Listing Page

## Group 1 — Components
1. Tạo `src/components/DatasetCard.tsx` — card với tags, info, hover effect
2. Tạo `src/components/SearchFilter.tsx` — search input + sort dropdown (client component)
3. Tạo `src/components/FilterSidebar.tsx` — category + tag filters (client component)

## Group 2 — Page Rewrite
4. Rewrite `src/app/page.tsx` — sidebar + search + card grid layout, fetch datasets từ API
5. Xóa old entity-based code trong page.tsx

## Group 3 — Cleanup
6. Xóa `src/app/entities/[id]/page.tsx` (sẽ thay bằng `/datasets/[slug]` ở spec 1.4)
7. Xóa old components không dùng (nếu có)

## Group 4 — Verify
8. `npm run build` — exit 0
9. Test: filters, search, sort, card navigation, responsive
