/**
 * OAuth 2.1 tối thiểu cho MCP connector (spec 2026-10-12-mcp-connector) — KHÔNG lưu trạng thái.
 *
 * Mọi thứ cần nhớ (client đăng ký động, mã cấp quyền, access / refresh token, phiếu xác nhận) đều là chuỗi
 * `v1.<payload base64url>.<HMAC-SHA256>` ký bằng khoá dẫn xuất từ AUTH_SECRET. Đổi AUTH_SECRET = thu hồi toàn
 * bộ. Đánh đổi đã chấp nhận: không thu hồi từng token, không chặn dùng lại mã trong 5 phút (PKCE bù phần này).
 *
 * Yêu cầu của Claude (claude.com/docs/connectors/building/authentication, kiểm 2026-10-12): PKCE S256, đăng ký
 * client động, `resource` khớp đúng URL server, token endpoint nhận form-urlencoded, client công khai
 * (`token_endpoint_auth_method: none`), refresh token xoay vòng, lỗi refresh trả `invalid_grant`.
 */

import { createHash, createHmac, timingSafeEqual } from "crypto";

export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_S = 30 * 24 * 3600;
export const CODE_TTL_S = 300;
export const CONSENT_TTL_S = 600;

type Kind = "client" | "code" | "access" | "refresh" | "consent";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET thiếu hoặc quá ngắn");
  return createHmac("sha256", secret).update("mcp-oauth-v1").digest();
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function sign(kind: Kind, payload: Record<string, unknown>, ttlS?: number): string {
  const body = b64(JSON.stringify({ k: kind, ...payload, ...(ttlS ? { exp: Math.floor(Date.now() / 1000) + ttlS } : {}) }));
  const mac = createHmac("sha256", key()).update(`v1.${body}`).digest();
  return `v1.${body}.${b64(mac)}`;
}

/** Trả payload nếu chữ ký đúng, đúng loại, chưa hết hạn; không thì null */
export function verify<T extends Record<string, unknown>>(kind: Kind, token: string | null | undefined): T | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const expected = createHmac("sha256", key()).update(`v1.${parts[1]}`).digest();
  const got = Buffer.from(parts[2], "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (p.k !== kind) return null;
  if (typeof p.exp === "number" && p.exp < Date.now() / 1000) return null;
  return p as T;
}

export function pkceS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Gốc URL công khai của app — ưu tiên header proxy (Vercel), không thì URL của request */
export function originOf(req: Request): string {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** Như originOf, cho server component (chỉ có headers()) */
export function originFromHeaders(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

/** URL của tài nguyên MCP — Claude đòi `resource` khớp đúng chuỗi này */
export const resourceOf = (origin: string) => `${origin}/api/mcp`;

/** Chỉ nhận redirect https, hoặc loopback http (Claude Code dùng http://localhost/callback) */
export function isAllowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

/** Loopback: cổng bất kỳ (RFC 8252) — so phần còn lại */
export function redirectMatches(registered: string[], uri: string): boolean {
  if (registered.includes(uri)) return true;
  try {
    const u = new URL(uri);
    if (u.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(u.hostname)) return false;
    return registered.some((r) => {
      const x = new URL(r);
      return x.protocol === "http:" && x.hostname === u.hostname && x.pathname === u.pathname;
    });
  } catch {
    return false;
  }
}

export interface ClientPayload extends Record<string, unknown> {
  r: string[];
  n?: string;
}

export interface AuthorizeRequest extends Record<string, unknown> {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  state?: string;
  resource: string;
  scope?: string;
  client_name?: string;
}

/**
 * Kiểm tham số /authorize. Lỗi client / redirect_uri → không được redirect (trả lỗi tại chỗ); lỗi khác →
 * redirect về client kèm `error`.
 */
export function checkAuthorize(
  q: URLSearchParams,
  origin: string
): { ok: true; req: AuthorizeRequest } | { ok: false; fatal: boolean; error: string; description: string; redirect?: string; state?: string } {
  const clientId = q.get("client_id") ?? "";
  const redirect = q.get("redirect_uri") ?? "";
  const client = verify<ClientPayload>("client", clientId);
  if (!client) return { ok: false, fatal: true, error: "invalid_client", description: "client_id không hợp lệ — xoá connector và thêm lại." };
  if (!redirectMatches(client.r, redirect)) return { ok: false, fatal: true, error: "invalid_request", description: "redirect_uri không khớp client đã đăng ký." };
  const state = q.get("state") ?? undefined;
  const fail = (error: string, description: string) => ({ ok: false as const, fatal: false, error, description, redirect, state });
  if (q.get("response_type") !== "code") return fail("unsupported_response_type", "chỉ hỗ trợ response_type=code");
  const challenge = q.get("code_challenge") ?? "";
  if (!challenge || q.get("code_challenge_method") !== "S256") return fail("invalid_request", "bắt buộc PKCE S256");
  const resource = (q.get("resource") ?? resourceOf(origin)).replace(/\/$/, "");
  if (resource !== resourceOf(origin)) return fail("invalid_target", `resource phải là ${resourceOf(origin)}`);
  return {
    ok: true,
    req: { client_id: clientId, redirect_uri: redirect, code_challenge: challenge, state, resource, scope: q.get("scope") ?? undefined, client_name: client.n },
  };
}

export function redirectWith(uri: string, params: Record<string, string | undefined>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

/** Đổi danh tính → cặp token. `u` = username trên nền tảng. */
export function issueTokens(user: string, clientId: string, resource: string, scope?: string) {
  return {
    access_token: sign("access", { u: user, res: resource }, ACCESS_TTL_S),
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    refresh_token: sign("refresh", { u: user, c: createHash("sha256").update(clientId).digest("base64url"), res: resource }, REFRESH_TTL_S),
    ...(scope ? { scope } : {}),
  };
}

export const clientHash = (clientId: string) => createHash("sha256").update(clientId).digest("base64url");
