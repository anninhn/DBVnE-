# Từ vựng — trạng thái hiện tại

**Lõi v8 KHÔNG dùng danh sách đóng theo ban.** Thuộc tính và loại thực thể là từ vựng MỞ (khung Wikibase), lớn dần qua đề xuất có bằng chứng + kiểm trùng nghĩa (`components.json` → `vocab_grow`). File máy đọc sẽ là `properties.json`, `entity_types.json` (chưa có).

Các file trong thư mục này sao từ `kd-data-demand/config/` (2026-10-09) — **chỉ của ban Kinh doanh**, dùng thế này:

| File | Dùng làm |
|---|---|
| `enums.yaml` | Giá trị của QUALIFIER không gắn lĩnh vực: `kind`, `meas`, `cmp`, loại nơi phát hành (`src_t`). `subj_t` và `dom` KHÔNG dùng làm khung (thiếu loại thực thể của ban khác; `dom` thiên kinh tế) |
| `ind_groups.csv` | Hạt giống đề xuất thuộc tính + nhãn `tags` — không phải danh sách đóng |
| `commodities.csv`, `countries.csv`, `indices.csv`, `provinces_2025.csv` | Hạt giống sổ thực thể |
| `source_alias.csv` | Quy tên nơi phát hành |
