# CLAUDE.md — Hồ sơ toàn cảnh 34 tỉnh, thành Việt Nam

## Project

Bộ dữ liệu nền dùng chung cho 34 tỉnh, thành (sau sáp nhập), phục vụ data journalism tại VNExpress.

## Quy ước

- Văn phong tiếng Việt trong code comments và UI text
- Không thêm feature ngoài yêu cầu
- Dữ liệu thô (CSV, Excel) → xử lý bằng Python script (`parse_*.py`) → xuất JSON vào `public/data/`
- Browser chỉ load JSON đã xử lý, không load raw CSV/Excel

## Cấu trúc thư mục

```
/data               — Dữ liệu thô (CSV, Excel, PDF)
/src                — App code (Vite + ECharts + MapLibre GL JS + Scrollama)
/public/data        — JSON đã xử lý, browser-ready
/scripts            — Python preprocessing scripts
```

## Tech stack

- Frontend: Vite, ECharts, MapLibre GL JS, Scrollama
- Preprocessing: Python (pandas, openpyxl)
- Deploy: Vercel

## KPI & Lộ trình

Xem `PROJECT_PLAN.md` — 8 giai đoạn (Tháng 5–12), mỗi tháng bổ sung chỉ số mới vào cấu trúc 34×N.
