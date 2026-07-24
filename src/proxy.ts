/**
 * Next.js proxy (trước đây "middleware") — page-level auth protection qua
 * NextAuth v5 auth() wrapper.
 *
 * Pattern chính thức NextAuth v5: import authConfig từ src/auth.config.ts
 * (edge-safe subset), wrap với NextAuth(), export auth() làm proxy.
 *
 * authorized() callback trong authConfig quyết định allow/redirect. Redirect
 * target (/login) lấy từ authConfig.pages.signIn — NextAuth tự thêm ?next=
 * param giữ original URL.
 *
 * Spec D5 + plan task 12.
 */

import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: proxy } = NextAuth(authConfig);

export const config = {
  matcher: [
    // Skip static + Next internals
    "/((?!_next/static|_next/image|favicon.ico|api/auth).*)",
    "/upload",
    "/upload/:path*",
    "/datasets/:slug/edit",
    "/datasets/:slug/edit/:path*",
  ],
};
