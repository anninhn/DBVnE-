# Phase 3 Validation — MCP Connector (production)

## Definition of Done
All must be true before this branch is merged.

### 1. Code quality
`npx tsc --noEmit` không lỗi mới trong `src/`; `npm run lint` 0 lỗi; `npm run build` exit 0.

### 2. Bảo vệ endpoint
- `POST /api/mcp` không có token → 401, header `WWW-Authenticate` chứa `resource_metadata`
- Token sai chữ ký / hết hạn → 401
- `GET /.well-known/oauth-protected-resource` và `/.well-known/oauth-authorization-server` → 200 JSON, các URL trỏ đúng domain đang chạy

### 3. Luồng OAuth
- `/api/oauth/authorize` khi chưa đăng nhập → chuyển `/login?next=…`; sau đăng nhập về lại trang xác nhận
- Thiếu PKCE, `code_challenge_method` khác S256, `redirect_uri` không khớp client → lỗi, không cấp mã
- Đổi mã lấy token với `code_verifier` sai → `invalid_grant`; mã dùng quá 5 phút → `invalid_grant`
- `refresh_token` cấp được access token mới

### 4. MCP hoạt động
- `initialize` trả `serverInfo` + `instructions`; `tools/list` trả đủ 6 tool
- `tools/call compute {op: "trend", ids: ["m03166"]}` trả kết quả có `nguon` + `bieu_do` (tổng tỷ suất sinh 2024 = 1,91)
- `check_answer` gọi ở một request khác vẫn thấy kết quả của request trước (lưu R2, không phụ thuộc tiến trình)

### 5. Quyết định đã triển khai
- Không có dependency mới trong `package.json`
- `/api/insight/*` vẫn 404 trên production (`insightEnabled` không đổi)
- Trang xác nhận nêu email người dùng và câu "kết quả tool đi qua Anthropic"

### 6. Trên Claude thật
Custom connector trong Claude Desktop trỏ bản deploy: đăng nhập được, hỏi "Tỷ lệ sinh ở các tỉnh miền núi phía
Bắc còn cao không?" → trả lời có số từ tool + nguồn.

## Not Required
- Không có test tự động phase này (kiểm bằng curl + Claude thật)
- Không đo lại 12 câu (đã đo ở bản local; tool giống hệt)
- Không kiểm trên claude.ai web nếu Desktop đã chạy
