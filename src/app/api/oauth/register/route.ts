import { NextResponse } from "next/server";
import { isAllowedRedirect, sign } from "@/lib/oauth/core";

/**
 * Đăng ký client động (RFC 7591). Không lưu gì: client_id là chuỗi ký chứa danh sách redirect_uri.
 * Chỉ nhận client công khai (không secret) — đúng cách Claude đăng ký.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { redirect_uris?: unknown; client_name?: unknown } | null;
  const uris = Array.isArray(body?.redirect_uris) ? body!.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 10 || !uris.every(isAllowedRedirect)) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris phải là https (hoặc http://localhost / 127.0.0.1), tối đa 10" },
      { status: 400 }
    );
  }
  const name = typeof body?.client_name === "string" ? body.client_name.slice(0, 100) : undefined;
  const clientId = sign("client", { r: uris, ...(name ? { n: name } : {}) });
  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: uris,
      ...(name ? { client_name: name } : {}),
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201, headers: { "cache-control": "no-store" } }
  );
}
