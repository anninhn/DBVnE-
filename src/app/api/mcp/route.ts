import { NextResponse } from "next/server";
import { handleRpc, type RpcMessage } from "@/lib/insight/mcp/rpc";
import { originOf, resourceOf, verify } from "@/lib/oauth/core";
import { corsPreflight, withCors } from "@/lib/oauth/cors";

/**
 * MCP connector cho claude.ai / Claude Desktop (spec 2026-10-12-mcp-connector).
 * Streamable HTTP, stateless: mỗi POST một thông điệp (hoặc một mảng), trả application/json; notification → 202.
 * Bảo vệ bằng OAuth (src/lib/oauth): thiếu / sai token → 401 + WWW-Authenticate trỏ tới metadata.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** `header` phải ASCII (header HTTP không nhận dấu tiếng Việt); thân JSON giữ tiếng Việt */
function unauthorized(req: Request, description: string, header: string) {
  const origin = originOf(req);
  return NextResponse.json(
    { error: "invalid_token", error_description: description },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", error="invalid_token", error_description="${header}"`,
      },
    }
  );
}

export async function POST(req: Request) {
  return withCors(await handlePost(req));
}

async function handlePost(req: Request): Promise<Response> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const claims = verify<{ u: string; res: string }>("access", token);
  if (!claims) return unauthorized(req, token ? "token sai hoặc đã hết hạn" : "cần đăng nhập", token ? "invalid or expired token" : "authentication required");
  if (claims.res !== resourceOf(originOf(req))) return unauthorized(req, "token không dành cho máy chủ này", "token audience mismatch");

  let body: RpcMessage | RpcMessage[];
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON không hợp lệ" } }, { status: 400 });
  }
  const ctx = { user: claims.u, origin: originOf(req) };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(m, ctx)))).filter(Boolean);
    return out.length ? NextResponse.json(out) : new NextResponse(null, { status: 202 });
  }
  const out = await handleRpc(body, ctx);
  return out ? NextResponse.json(out) : new NextResponse(null, { status: 202 });
}

/** Không mở luồng SSE từ máy chủ, không giữ phiên */
export function GET() {
  return withCors(new NextResponse(null, { status: 405, headers: { Allow: "POST" } }));
}
export function DELETE() {
  return withCors(new NextResponse(null, { status: 405, headers: { Allow: "POST" } }));
}
export const OPTIONS = corsPreflight;
