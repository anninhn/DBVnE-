# Phase 1 Validation — Wiki Infrastructure & Core Data

## Definition of Done
All must be true before this branch is merged.

### 1. Build succeeds
`npm run build` — must exit 0.

### 2. Database seeded
- 34 rows trong entities_catalog (entity_type = 'PROVINCE')
- Tối thiểu 10 rows trong indicator_metadata
- Tối thiểu 5 rows trong tags

### 3. API hoạt động
- `GET /api/entities` trả về 200, array chứa 34 provinces
- `GET /api/entities/VN-LA` (hoặc ID tương ứng) trả về 200, có entity info + resources
- `POST /api/resources` với body hợp lệ → 201, resource được tạo + version snapshot tồn tại
- `GET /api/dictionary` trả về 200, array indicator metadata

### 4. Upload form hoạt động
- Chọn tỉnh → nhập title → submit → resource mới xuất hiện trên trang tỉnh
- Nếu có file đính kèm → file upload lên storage → file_url không null
- Version snapshot tự động tạo (resource_versions có row mới)

### 5. UI hiển thị đúng
- Homepage hiển thị 34 tỉnh cards
- Trang tỉnh hiển thị danh sách resources với title, type, year
- Resource có file → hiển thị download link, click tải được

## Not Required
- Không cần automated tests
- Không cần version history UI
- Không cần search
- Không cần mobile responsive
- Không cần authentication
