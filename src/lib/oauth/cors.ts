import { NextResponse } from "next/server";

/**
 * CORS cho endpoint OAuth + MCP — chỉ client chạy trong trình duyệt cần (vscode.dev, MCP Inspector v1); client
 * khác gọi từ server / tiến trình local. Không dùng cookie ở các endpoint này (xác thực bằng Bearer / mã ký),
 * nên mở `*` không làm lộ phiên đăng nhập.
 */
const HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id",
  "Access-Control-Expose-Headers": "www-authenticate, mcp-session-id",
  "Access-Control-Max-Age": "86400",
};

export function withCors<T extends Response>(res: T): T {
  for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
  return res;
}

export function corsPreflight() {
  return withCors(new NextResponse(null, { status: 204 }));
}
