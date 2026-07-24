/**
 * Next.js proxy (trước đây "middleware") — page-level auth protection qua
 * NextAuth v5 auth() wrapper.
 *
 * Next.js 16.2.7 require file-convention export là function declaration
 * (default hoặc named `proxy`). Pattern cũ `export const { auth: middleware }`
 * (destructured const) bị static analyzer reject → build fail. Wrap auth()
 * qua `export default function proxy` — passthrough thuần túy, chỉ để thỏa
 * mãn export-shape requirement.
 *
 * authorized() callback trong authConfig quyết định allow/redirect. Redirect
 * target (/login) lấy từ authConfig.pages.signIn — NextAuth tự thêm ?next=
 * param giữ original URL.
 *
 * Spec D5 + plan task 12.
 */

import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default function proxy(
  ...args: Parameters<typeof auth>
): ReturnType<typeof auth> {
  return auth(...args);
}

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
