# Spec 1.6 — Data Dictionary, Quality & Seed Data

## Scope

3 tính năng đóng gói cùng nhau vì liên quan chặt:
1. Data Dictionary page — browse tất cả data dictionary entries
2. Data Quality metrics — auto-calculate + hiển thị trên dataset detail
3. Seed data — import datasets ban đầu để test

## 1. Data Dictionary Page (`/dictionary`)

### Features
- Bảng hiển thị tất cả data_dictionary entries
- Group by dataset
- Columns: column_name, label_vi, data_type, unit, description, source
- Filter by dataset, category
- Search by column name

### Files
- `src/app/dictionary/page.tsx` — mới hoặc rewrite
- `GET /api/datasets/[slug]/dictionary` — API endpoint

## 2. Data Quality Metrics

### Quality Score Calculation
Auto-calculate khi tạo/cập nhật dataset:
- **Completeness** (40%): % columns có đủ data (not null)
- **Freshness** (30%): thời gian từ last update → bây giờ (càng gần = càng tốt)
- **Documentation** (20%): % columns có label_vi + description trong dictionary
- **Provenance** (10%): có source + uploaded_by + upload_log entries

Score = weighted average, scale 0-100.

### Display
- Dataset card (listing): score badge (màu: green ≥80, yellow ≥50, red <50)
- Dataset detail sidebar: score + breakdown

### Files
- Quality calculation trong API (POST/PUT datasets)
- Update `datasets.quality_score` column

## 3. Seed Data

### Datasets cần seed
1. **34 Tỉnh Thành — Địa giới hành chính** (`dia-gioi-34-tinh`)
   - Resource: CSV với 34 rows (entity_id, entity_name, region, old_codes)
   - Type: data

2. **34 Tỉnh Thành — Lãnh đạo** (`lanh-dao-34-tinh`)
   - Resource: CSV với leadership data
   - Type: data

3. **GRDP 34 Tỉnh** (`grdp-34-tinh`)
   - Resource: CSV/Excel với GRDP growth rates × years
   - Type: data

4. **Dân số 34 Tỉnh** (`dan-so-34-tinh`)
   - Resource: CSV với population data
   - Type: data

5. Tags vocabulary: kinh-te, xa-hoi, chinh-tri, khi-hau, ha-tang, vi-mo, grdp, dan-so, etc.

### Files
- `data/scripts/seed_datasets.py` — Python script seed datasets + resources + dictionary
- Hoặc SQL seed script

## Decisions

### Quality score auto-calculate
Score tính khi tạo/cập nhật dataset, không real-time.

**Why**: Đơn giản, không overhead. Chỉ cần update khi data thay đổi.

### Seed bằng Python script
Giữ pattern hiện tại: Python script parse data → upload qua API.

**Why**: Nhất quán với pipeline có sẵn. Reusable cho data import sau.

## Out of Scope
- Không data validation rules UI (chỉ tính quality score)
- Không automated data fetching
- Không migration data từ old schema

## Validation
- `/dictionary` page hiển thị tất cả dictionary entries
- Dictionary filter by dataset hoạt động
- Quality score hiển thị trên dataset cards + detail sidebar
- Seed script chạy thành công: ≥ 4 datasets tạo
- Tags vocabulary seeded
- Data dictionary entries auto-generated cho seeded datasets
- `npm run build` exit 0
