import { NextRequest, NextResponse } from "next/server";

import { insightEnabled } from "@/lib/insight/local";
import { loadSession } from "@/lib/insight/session";
import { callTool, TOOL_DEFS } from "@/lib/insight/tools";

/**
 * Mặt tiền HTTP của bộ tool harness — MCP proxy (tools/insight-mcp.mjs) gọi vào đây.
 *
 *   GET  → danh sách tool (tên, mô tả, JSON Schema)
 *   POST { sessionId, token, tool, args } → { ok, text }
 *
 * Không dùng cookie đăng nhập: proxy MCP là tiến trình con của Claude Code, không có
 * phiên trình duyệt. Thay vào đó mỗi phiên có `token` riêng do route /run tạo và
 * truyền cho proxy — gọi tool ngoài phiên là bị từ chối.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  if (!insightEnabled()) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ tools: TOOL_DEFS });
}

export async function POST(req: NextRequest) {
  if (!insightEnabled()) return new NextResponse(null, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    sessionId?: string;
    token?: string;
    tool?: string;
    args?: Record<string, unknown>;
  } | null;
  if (!body?.sessionId || !body.token || !body.tool) {
    return NextResponse.json({ error: "Thiếu sessionId / token / tool" }, { status: 400 });
  }
  const session = await loadSession(body.sessionId).catch(() => null);
  if (!session || session.token !== body.token) {
    return NextResponse.json({ error: "Phiên không hợp lệ" }, { status: 403 });
  }

  try {
    const result = await callTool(body.sessionId, body.tool, body.args ?? {});
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[insight] tool ${body.tool} lỗi:`, err);
    return NextResponse.json({ ok: false, text: `Lỗi hệ thống khi chạy ${body.tool}: ${(err as Error).message}` });
  }
}
