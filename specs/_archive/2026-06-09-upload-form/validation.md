# Spec 1.5 Validation — Upload Form

## Definition of Done

1. `npm run build` exit 0
2. Step 1: tạo dataset → POST thành công, slug auto-generate
3. Step 2: upload file → R2 + resource tạo trong DB
4. CSV/XLSX: structured_data preview auto-extract (first 25 rows)
5. CSV/XLSX: columns JSONB auto-generate
6. Data dictionary entries auto-generate từ column headers
7. Upload log entry tạo đúng (action=create)
8. Tags chọn từ dropdown (controlled vocabulary)
9. Yellow submit button + yellow focus rings
10. Success message hiển thị
