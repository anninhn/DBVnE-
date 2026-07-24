/**
 * NextAuth v5 config — Auth.js credentials provider + JWT session.
 *
 * User store: datasets/_users/users.json (GitHub repo, bcrypt hash cost 12).
 * Session: JWT cookie httpOnly + secure (prod) + sameSite=lax, maxAge 10 năm
 * ≈ vĩnh viễn (Chrome cap 400 ngày, sliding refresh mỗi request giữ mãi nếu user
 * dùng app định kỳ).
 *
 * Spec: specs/2026-07-24-auth-light/requirements.md D1.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { readUsersJson, type UserRecord } from "./user-store";

const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60;

/**
 * Boundary check — fail fast nếu AUTH_SECRET missing.
 * Tránh silently fallback sang insecure signing.
 */
function requireAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET missing hoặc quá ngắn (<32 ký tự). Generate: openssl rand -hex 32"
    );
  }
  return secret;
}

/**
 * Authorize callback — tìm user trong users.json, bcrypt compare password.
 *
 * Timing leak: nếu user không tồn tại, return null ngay (fast) — attacker có thể
 * enumerate username qua timing. Acceptable cho internal tool 3-5 user (username
 * không nhạy cảm, public trong metadata.yaml uploaded_by). Spec S7 — defer mitigation.
 */
async function authorize(
  credentials: Partial<Record<"username" | "password", unknown>> | undefined
): Promise<{ id: string; username: string; displayName: string; role: string } | null> {
  const username = credentials?.username;
  const password = credentials?.password;
  if (typeof username !== "string" || typeof password !== "string") return null;

  const normalizedUsername = username.trim().toLowerCase();
  const users = await readUsersJson();
  const user = users.find(
    (u) => u.username === normalizedUsername && u.active !== false
  );
  if (!user) return null;

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Override session maxAge (authConfig đã có, nhưng đảm bảo sync explicit)
  session: { strategy: "jwt", maxAge: TEN_YEARS_SECONDS },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Tên đăng nhập", type: "text" },
        password: { label: "Mật khẩu", type: "password" },
      },
      authorize,
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Inject username + displayName + role vào JWT token.
     */
    async jwt({ token, user }) {
      if (user) {
        token.username = (user as { username: string }).username;
        token.displayName = (user as { displayName: string }).displayName;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    /**
     * Expose username + displayName + role từ JWT sang session.user.
     */
    async session({ session, token }) {
      if (session.user) {
        const user = session.user as unknown as SessionUser;
        user.username = token.username as string;
        user.displayName = token.displayName as string;
        user.role = token.role as string;
      }
      return session;
    },
  },
  secret: requireAuthSecret(),
});

/**
 * Session user shape — extend default NextAuth User với username + role.
 */
export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
  email?: string;
}

export type { UserRecord };
