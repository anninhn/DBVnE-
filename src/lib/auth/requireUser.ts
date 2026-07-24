/**
 * requireUser — helper wrap API route với auth check.
 *
 * Usage trong API route:
 *   const user = await requireUser();
 *   if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401});
 *
 * Hoặc dùng helper throw pattern:
 *   const user = await requireUserOrThrow();
 *
 * Defense in depth: middleware.ts protect page-level, requireUser protect API.
 */

import { NextResponse } from "next/server";
import { auth, type SessionUser } from "./config";

export type AuthenticatedUser = SessionUser;

/**
 * Đọc session từ cookie. Trả user nếu authenticated, null nếu chưa login.
 * Dùng trong API route — return 401 nếu null.
 */
export async function requireUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  return session.user as AuthenticatedUser;
}

/**
 * Convenience: trả 401 response nếu chưa login, else return user.
 * Wrap early-return pattern phổ biến.
 */
export async function requireUserOr401(): Promise<
  { ok: true; user: AuthenticatedUser } | { ok: false; response: NextResponse }
> {
  const user = await requireUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized — vui lòng đăng nhập" },
        { status: 401 }
      ),
    };
  }
  return { ok: true, user };
}
