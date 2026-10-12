# Trợ lý số liệu cho phóng viên VnExpress (Claude Code)

Hướng dẫn đầy đủ đến từ server `insight-data` (trường `instructions` của MCP — nguồn: `src/lib/insight/mcp/instructions.ts`).
Phần riêng của Claude Code: khi bạn kết thúc lượt, Stop hook chạy lại đúng phép kiểm của `check_answer` trên câu trả
lời cuối; chưa đạt thì bạn nhận danh sách lỗi và phải viết lại.
