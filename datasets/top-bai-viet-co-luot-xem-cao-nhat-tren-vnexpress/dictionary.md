# Dictionary

| Column | Type | Dec | Group | Unit | Description |
|--------|------|-----|-------|------|-------------|
| `month` | date | - | - | tháng | Tháng thống kê dữ liệu theo định dạng YYYY-MM. |
| `rank` | number | - | - | - | Thứ hạng của bài viết trong top 100 bài xem nhiều nhất của tháng. |
| `article_id` | number | - | - | - | Mã định danh duy nhất của bài viết. |
| `title` | string | - | - | - | Tiêu đề của bài viết. |
| `url` | string | - | - | - | Đường dẫn (URL) đến bài viết trên VnExpress. |
| `ban` | category | - | - | - | Tên ban biên tập hoặc chuyên mục cấp cao quản lý bài viết. |
| `cate_1_name` | category | - | - | - | Tên chuyên mục cấp 1 của bài viết. |
| `cate_original_name` | category | - | - | - | Tên chuyên mục gốc/chi tiết của bài viết. |
| `author_name` | string | - | - | - | Tên tác giả hoặc bút danh của bài viết. |
| `total_pageview` | number | - | - | lượt | Tổng số lượt xem (pageview) của bài viết trong tháng. |
| `total_user` | number | - | - | người | Tổng số người dùng duy nhất (unique user) xem bài viết trong tháng. |
| `total_comment` | number | - | - | bình luận | Tổng số bình luận của bài viết trong tháng. |
| `word_count` | number | - | - | từ | Số lượng từ trong bài viết. |
| `engage` | number | - | - | tỷ lệ | Tỷ lệ tương tác của bài viết. |
| `group` | category | - | - | - | Nhóm phân loại hiệu quả của bài viết (ví dụ: 'Hiệu quả cao', 'Views cao'). |
| `publish_date` | date | - | - | - | Thời gian bài viết được xuất bản theo định dạng M/D/YYYY HH:mm. |
| `pageview_updated_at` | date | - | - | - | Thời gian cuối cùng lượt xem của bài viết được cập nhật theo định dạng M/D/YYYY HH:mm. |
| `is_contract` | boolean | - | - | - | Cho biết bài viết có phải là bài hợp đồng/quảng cáo hay không (0: không phải). |
| `article_type` | category | - | - | - | Loại bài viết (ví dụ: bài thường, bài ảnh, bài video). |
