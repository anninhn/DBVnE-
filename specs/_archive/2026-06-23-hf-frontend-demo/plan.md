# Phase 1 Plan — HF Frontend Demo (Mock Data)

> Đã hoàn thành 2026-06-23. Ghi lại để truy vết.

## Group 1 — Design foundation
1. Update `src/app/globals.css` — HF tokens qua Tailwind v4 `@theme` (colors + fonts)
2. Update `src/app/layout.tsx` — Google Fonts `<link>` (Source Sans 3 + IBM Plex Mono)
3. Update `src/lib/mock/datasets.ts` — gỡ `quality_score`/`quality`/`last_verified_at`,
   thêm `downloads`/`likes`

## Group 2 — Listing page
4. Rewrite `src/components/DatasetExplorer.tsx` — HF compact rows + sidebar filters + sort
5. Rewrite `src/app/page.tsx` — HF top nav + DatasetExplorer

## Group 3 — Detail page
6. Create `src/app/datasets/[slug]/DatasetViewer.tsx` — table + mini charts + resource dropdown
7. Rewrite `src/app/datasets/[slug]/MetadataSidebar.tsx` — gỡ Chất lượng box
8. Rewrite `src/app/datasets/[slug]/TabSwitcher.tsx` — 3 tabs + yellow underline
9. Rewrite `src/app/datasets/[slug]/page.tsx` — HF header + pills + tabs + viewer + sidebar

## Group 4 — Cleanup
10. Delete `src/components/DatasetCard.tsx` (obsolete)
11. Delete `src/app/datasets/[slug]/DataTable.tsx` (replaced bởi DatasetViewer)

## Group 5 — Verify
12. `npm run build` — exit 0
13. `npm run dev` — listing + detail render đúng
14. Manual check: mini charts render, resource dropdown switch, tabs switch
