# Data Dictionary Table — Validation

## V1 — Build compiles

```bash
npm run build
```
**Pass**: exit 0. New `DataDictionary.tsx` is a server component imported by the server detail page — no client/server boundary issues.

## V2 — Three tables render, one per resource

Open `/datasets/ho-so-34-tinh-thanh-2025`, Dataset card tab, scroll below the description.

- [ ] A "Từ điển dữ liệu" heading appears (replacing the old "Trường dữ liệu").
- [ ] Below it, **three** sub-headings, matching the 3 resource titles:
  - "Thống kê kinh tế - xã hội 34 tỉnh"
  - "Xã phường mới sau sáp nhập (chi tiết TP HCM)"
  - "Lãnh đạo 34 tỉnh (bí thư, chủ tịch UBND)"
- [ ] Each sub-heading is followed by a table (not a bullet list).

## V3 — Each table lists only its resource's columns

For the **province_stats** table:
- [ ] Contains: `entity_id, year, population, area, density, num_wards, grdp, budget_revenue, rank_grdp, is_merged` (10 rows).
- [ ] Does NOT contain: `ward_name`, `role`, `name`.

For the **wards** table:
- [ ] Contains: `entity_id, ward_name, ward_type, old_wards, population, area, density, hq_name` (8 rows).
- [ ] Does NOT contain: `grdp`, `role`.

For the **leadership** table:
- [ ] Contains: `entity_id, role, title, name` (4 rows).

## V4 — Shared columns repeat

- [ ] `entity_id` appears in all 3 tables (once each).
- [ ] `population`, `area`, `density` appear in both province_stats and wards tables.
- [ ] The description shown for `population` is the same in both tables (one dictionary row, repeated — by design).

## V5 — All fields render

In the province_stats table, the `population` row:
- [ ] `Trường` cell shows `population` in monospace.
- [ ] `Tên hiển thị` shows "Dân số".
- [ ] `Kiểu` shows "int".
- [ ] `Đơn vị` shows "người".
- [ ] `Mô tả` shows "Tổng dân số" (the description from seed).
- [ ] Below the description, a muted line shows the source "Thongtintinhthanh.Danso".

## V6 — Missing descriptions don't break rows

In the wards table, the `ward_name` row (which has no `description` in the seed):
- [ ] Row renders (not omitted).
- [ ] `Mô tả` cell is empty (no crash, no "undefined").

## V7 — Empty datasets handle gracefully

Temporarily test with a dataset that has resources but no dictionary rows (skip if hard to set up — manual code review acceptable):
- The `{resources.length > 0 && dictionary.length > 0}` guard in `page.tsx` means the section is hidden entirely if either is empty. Confirm by code inspection: if `dictionary` is empty, the whole "Từ điển dữ liệu" block doesn't render.

## Not required

- Search/filter within the table.
- Editing entries.
- `validation_rules` or `category` display.
- A standalone dictionary page.
