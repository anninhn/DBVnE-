/**
 * NextAuth route handler — re-export GET/POST từ config handlers.
 *
 * Path /api/auth/* → sign-in, sign-out, callback, csrf-token, session.
 */
import { handlers } from "@/lib/auth/config";

export const { GET, POST } = handlers;
