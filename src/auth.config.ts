/**
 * Edge-safe NextAuth config subset — import trong middleware.
 *
 * Phải tách riêng vì middleware chạy ở Edge Runtime, không support Node.js APIs
 * như bcryptjs (dùng node:crypto) hoặc fs. File này CHỈ chứa config mà Edge
 * runtime chạy được (JWT decode + callbacks).
 *
 * Full config (với Credentials provider + bcrypt + user-store) nằm ở
 * src/lib/auth/config.ts, extend config này.
 *
 * Spec D5 — middleware pattern chính thức NextAuth v5.
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  session: {
    strategy: "jwt",
    // maxAge khớp với full config (src/lib/auth/config.ts) để edge + server
    // thống nhất — 10 năm.
    maxAge: 10 * 365 * 24 * 60 * 60,
  },
  // Cookie names dùng default NextAuth v5 — KHÔNG override. Override gây ra
  // mismatch giữa getToken (salt derive từ default name) và login set cookie.
  // Default: dev = "authjs.session-token", prod = "__Secure-authjs.session-token".
  providers: [], // empty ở edge — full providers load ở server config
  pages: {
    signIn: "/login",
  },
  callbacks: {
    /**
     * Authorized callback — chạy trong middleware. Trả true cho phép request,
     * trả false redirect về /login.
     */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtected =
        nextUrl.pathname.startsWith("/upload") ||
        /\/datasets\/[^/]+\/edit(\/|$)/.test(nextUrl.pathname);
      if (isProtected) {
        if (isLoggedIn) return true;
        return false; // redirect về /login ( NextAuth tự handle)
      }
      return true;
    },
  },
  secret: process.env.AUTH_SECRET,
} satisfies NextAuthConfig;
