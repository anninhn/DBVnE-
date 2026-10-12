import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/auth/config";
import { clientHash, CODE_TTL_S, redirectWith, sign, verify, type AuthorizeRequest } from "@/lib/oauth/core";

/**
 * Nhận quyết định ở trang xác nhận. Phiếu `ticket` ký, gắn với người dùng, sống 10 phút; phiên đăng nhập hiện
 * tại phải đúng người trong phiếu (chặn form giả từ trang khác).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const t = verify<AuthorizeRequest & { u: string }>("consent", String(form.get("ticket") ?? ""));
  const session = await auth();
  const user = session?.user as unknown as SessionUser | undefined;
  if (!t || !user || user.username !== t.u) {
    return new NextResponse("Phiếu xác nhận hết hạn hoặc không hợp lệ — thử kết nối lại từ Claude.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (form.get("decision") !== "allow") {
    return NextResponse.redirect(redirectWith(t.redirect_uri, { error: "access_denied", state: t.state }), 303);
  }
  const code = sign("code", { c: clientHash(t.client_id), r: t.redirect_uri, ch: t.code_challenge, u: t.u, res: t.resource, sc: t.scope }, CODE_TTL_S);
  return NextResponse.redirect(redirectWith(t.redirect_uri, { code, state: t.state }), 303);
}
