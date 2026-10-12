# Phase 3 Requirements — MCP Connector (production)

## Scope

Đưa lớp tool `insight-data` (commit `6541b64`, THIET-KE-V8 mục 3b) lên bản deploy để phóng viên dùng trong
claude.ai / Claude Desktop qua **custom connector**:

1. **Endpoint MCP** `POST /api/mcp` trên app Vercel — Streamable HTTP, **stateless**, trả `application/json`
   (không SSE). Hỗ trợ `initialize` (kèm `instructions`), `tools/list`, `tools/call`, `ping`; notification → 202.
   `GET`/`DELETE` → 405. Cùng `TOOL_DEFS` / `callTool` với bản local — không có đường đi riêng.
2. **OAuth 2.1** để Claude lấy token thay mặt phóng viên, dùng tài khoản đăng nhập hiện có của nền tảng:
   - `/.well-known/oauth-protected-resource` (RFC 9728) — chỉ tới authorization server
   - `/.well-known/oauth-authorization-server` (RFC 8414)
   - `POST /api/oauth/register` — đăng ký client động (RFC 7591)
   - `GET /api/oauth/authorize` — bắt buộc PKCE S256; chưa đăng nhập → chuyển `/login?next=…`; đã đăng nhập →
     trang xác nhận "Cho phép Claude truy cập dữ liệu với tài khoản <email>" → cấp mã
   - `POST /api/oauth/token` — `authorization_code` (kiểm PKCE) và `refresh_token`
   - `/api/mcp` thiếu / sai token → 401 kèm `WWW-Authenticate: Bearer resource_metadata="…"`
3. **Chạy được trên serverless**: catalog chỉ tiêu đọc từ R2 (`_index/measures.json`, dựng bằng script qua
   API của app — không ghi tay vào bucket); cache CSV dùng `/tmp`; kết quả tool cho `check_answer` lưu R2 theo
   người dùng + `result_id`, hết hạn sau 24 giờ.

## Out of Scope

- Log tool call phía server để eval, trang hướng dẫn kết nối (phase sau)
- Lọc dataset nội bộ / chưa công khai — Ninh xác nhận mọi dataset hiện là số công khai
- Thu hồi token theo từng người (token ký, tự hết hạn); phân quyền theo vai trò
- Gate cứng trên claude.ai / Desktop (không có hook) — giữ `check_answer` + `instructions`
- MCP Apps (giao diện trong tool), sửa M2–M5 của báo cáo thử nghiệm
- Bỏ bản local (stdio, cầu nối HTTP, Stop hook) — giữ nguyên cho Claude Code

## Decisions

### OAuth tự viết, không thêm dependency
Ninh chọn 2026-10-12. Dùng `crypto` của Node: client_id, mã cấp quyền, access/refresh token đều là **chuỗi ký
HMAC-SHA256 bằng `AUTH_SECRET`** (payload base64url + chữ ký) → không cần lưu trạng thái OAuth ở đâu cả.
Access token 1 giờ, refresh token 30 ngày, mã cấp quyền 5 phút. Đánh đổi: không thu hồi được từng token trước
hạn (đổi `AUTH_SECRET` thì thu hồi toàn bộ).

### Danh tính = tài khoản NextAuth hiện có
`/authorize` dùng phiên NextAuth (`auth()`); không có tài khoản nền tảng thì không được cấp token. Email người
dùng nằm trong token → tool biết ai gọi (dùng cho kết quả phiên, sau này cho log).

### Endpoint stateless, JSON thay SSE
Đặc tả Streamable HTTP cho phép server trả JSON cho từng POST. Không giữ phiên MCP (`Mcp-Session-Id`) — hợp
Vercel serverless. Trạng thái cần giữ giữa các lần gọi (kết quả cho `check_answer`) lưu R2.

### Chỉ dữ liệu công khai đi qua Claude
Ninh xác nhận. Không thêm bộ lọc; ghi rõ trong `instructions` và trang xác nhận OAuth rằng kết quả tool đi qua
Anthropic.

### Bỏ cờ local-only cho lớp tool, không cho route cũ
`/api/insight/*` (bậc 1, lát 1) vẫn chỉ chạy local (`insightEnabled`). `/api/mcp` và `/api/oauth/*` chạy trên
production, bảo vệ bằng OAuth.

## Context

Thử nghiệm 2026-10-12 (`prototypes/insight-demo/bench/runs/2026-10-12-claude-mcp-lan2/BAO-CAO.md`): Claude + lớp
tool trả lời đúng 8/12 câu dev (bậc 1: 3/12), không sai số, không bỏ sót im lặng. Bản local phải chạy server
trong terminal + cầu nối vì macOS chặn app Claude đọc ~/Desktop — không phát cho phóng viên được. Connector từ xa
được gọi từ máy chủ Anthropic, nên endpoint phải công khai trên internet và có OAuth.

**Chưa xác minh trực tiếp** (kiểm lúc triển khai, theo tài liệu MCP + Claude): đường callback của claude.ai, việc
claude.ai bắt buộc đăng ký client động, các trường metadata bắt buộc. Custom connector theo tài liệu chỉ có ở gói
Claude trả phí.

## Stakeholder Notes

- **Phóng viên**: thêm connector bằng một URL, đăng nhập bằng tài khoản nền tảng đang có, hỏi số liệu ngay
  trong Claude; câu trả lời kèm nguồn, biểu đồ do code dựng.
- **Biên tập viên**: không có yêu cầu riêng phase này.
- **Ninh (quản trị)**: biết ai đang dùng (email trong token); chi phí model nằm ở tài khoản Claude của từng
  người, nền tảng chỉ chịu Vercel + R2.
