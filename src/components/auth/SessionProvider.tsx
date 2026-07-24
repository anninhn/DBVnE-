"use client";

/**
 * SessionProvider wrapper — client-side context cho useSession() + signIn/signOut.
 *
 * Wrap toàn app trong layout.tsx. Spec plan task 11.
 */

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

export default function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
