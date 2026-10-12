import { NextResponse } from "next/server";
import { clientSecretOf, isAllowedRedirect, sign } from "@/lib/oauth/core";
import { corsPreflight, withCors } from "@/lib/oauth/cors";

/**
 * Đăng ký client động (RFC 7591). Không lưu gì: client_id là chuỗi ký chứa danh sách redirect_uri.
 * Chỉ nhận client công khai (không secret) — đúng cách Claude đăng ký.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { redirect_uris?: unknown; client_name?: unknown; token_endpoint_auth_method?: unknown } | null;
  const asked = Array.isArray(body?.redirect_uris) ? body!.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  // VS Code gửi 4 redirect một lúc — bỏ cái không hợp lệ, chỉ từ chối khi không còn cái nào
  const uris = asked.filter(isAllowedRedirect).slice(0, 10);
  if (!uris.length) {
    return withCors(NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris phải là https, http loopback (localhost / 127.0.0.1) hoặc scheme riêng của ứng dụng" },
      { status: 400 }
    ));
  }
  const name = typeof body?.client_name === "string" ? body.client_name.slice(0, 100) : undefined;
  const method = ["client_secret_post", "client_secret_basic"].includes(String(body?.token_endpoint_auth_method)) ? String(body!.token_endpoint_auth_method) : "none";
  const clientId = sign("client", { r: uris, ...(name ? { n: name } : {}), ...(method !== "none" ? { m: method } : {}) });
  return withCors(NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: uris,
      ...(name ? { client_name: name } : {}),
      token_endpoint_auth_method: method,
      ...(method !== "none" ? { client_secret: clientSecretOf(clientId), client_secret_expires_at: 0 } : {}),
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201, headers: { "cache-control": "no-store" } }
  ));
}

export const OPTIONS = corsPreflight;
