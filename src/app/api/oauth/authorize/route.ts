import { NextResponse } from "next/server";
import { checkAuthorize, originOf, redirectWith } from "@/lib/oauth/core";

/**
 * /authorize — kiểm tham số rồi chuyển sang trang xác nhận /oauth/consent (trang đó lo đăng nhập).
 * Lỗi client / redirect_uri: báo tại chỗ, KHÔNG redirect (tránh mở cửa chuyển hướng tuỳ ý).
 */
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const url = new URL(req.url);
  const origin = originOf(req);
  const c = checkAuthorize(url.searchParams, origin);
  if (!c.ok) {
    if (c.fatal) return new NextResponse(`Lỗi kết nối: ${c.description}`, { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
    return NextResponse.redirect(redirectWith(c.redirect!, { error: c.error, error_description: c.description, state: c.state, iss: origin }));
  }
  return NextResponse.redirect(`${origin}/oauth/consent?${url.searchParams.toString()}`);
}
