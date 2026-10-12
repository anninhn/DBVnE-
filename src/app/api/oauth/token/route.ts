import { NextResponse } from "next/server";
import { readUsersJson } from "@/lib/auth/user-store";
import { clientAuthOk, clientCredentials, clientHash, issueTokens, originOf, pkceS256, resourceOf, verify } from "@/lib/oauth/core";
import { corsPreflight, withCors } from "@/lib/oauth/cors";

/**
 * Token endpoint — `authorization_code` (kiểm PKCE) và `refresh_token` (xoay vòng: mỗi lần cấp cặp mới).
 * Nhận form-urlencoded (chuẩn, Claude dùng) và JSON. Lỗi theo RFC 6749: 400 + `error`.
 */
export const dynamic = "force-dynamic";

const err = (error: string, description: string, status = 400) =>
  withCors(NextResponse.json({ error, error_description: description }, { status, headers: { "cache-control": "no-store" } }));

export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  const p: Record<string, string> = type.includes("application/json")
    ? ((await req.json().catch(() => ({}))) as Record<string, string>)
    : Object.fromEntries(new URLSearchParams(await req.text()));
  const resource = resourceOf(originOf(req));
  if (p.resource && p.resource.replace(/\/$/, "") !== resource) return err("invalid_target", `resource phải là ${resource}`);
  const cred = clientCredentials(req, p);
  const clientId = cred.id;
  if (clientId && !clientAuthOk(clientId, cred.secret)) return err("invalid_client", "client_id hoặc client_secret sai", 401);

  if (p.grant_type === "authorization_code") {
    const code = verify<{ c: string; r: string; ch: string; u: string; res: string; sc?: string }>("code", p.code);
    if (!code) return err("invalid_grant", "mã cấp quyền sai hoặc đã hết hạn");
    if (code.c !== clientHash(clientId)) return err("invalid_grant", "client_id không khớp");
    if (code.r !== p.redirect_uri) return err("invalid_grant", "redirect_uri không khớp");
    if (!p.code_verifier || pkceS256(p.code_verifier) !== code.ch) return err("invalid_grant", "code_verifier sai");
    return withCors(NextResponse.json(issueTokens(code.u, clientId, code.res, code.sc), { headers: { "cache-control": "no-store" } }));
  }

  if (p.grant_type === "refresh_token") {
    const r = verify<{ u: string; c: string; res: string }>("refresh", p.refresh_token);
    if (!r) return err("invalid_grant", "refresh token sai hoặc đã hết hạn");
    if (clientId && r.c !== clientHash(clientId)) return err("invalid_grant", "client_id không khớp");
    // Tài khoản bị xoá khỏi nền tảng thì không gia hạn nữa
    const users = await readUsersJson();
    if (!users.some((u) => u.username === r.u)) return err("invalid_grant", "tài khoản không còn trên nền tảng");
    return withCors(NextResponse.json(issueTokens(r.u, clientId, r.res), { headers: { "cache-control": "no-store" } }));
  }

  return err("unsupported_grant_type", "chỉ hỗ trợ authorization_code và refresh_token");
}

export const OPTIONS = corsPreflight;
