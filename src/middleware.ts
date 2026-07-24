/**
 * Next.js middleware — page-level auth protection.
 *
 * Protect write pages (/upload, /datasets/[slug]/edit). API routes wrap riêng
 * qua requireUser helper (defense in depth — không phụ thuộc middleware).
 *
 * Public paths: browse/preview/download/login/auth APIs.
 *
 * Spec D5 + plan task 12.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Matcher — chỉ activate middleware cho paths cần protect.
 * Tránh chạy cho static assets, public API, /login, /api/auth/*.
 */
export const config = {
  matcher: [
    "/upload",
    "/upload/:path*",
    "/datasets/:slug/edit",
    "/datasets/:slug/edit/:path*",
  ],
};

export async function middleware(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
