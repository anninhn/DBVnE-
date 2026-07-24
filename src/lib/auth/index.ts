/**
 * Auth public API — barrel export.
 *
 * Import from `@/lib/auth` thay vì `@/lib/auth/config` để giữ interface ổn định.
 */

export { handlers, auth, signIn, signOut } from "./config";
export type { SessionUser, UserRecord } from "./config";
export { readUsersJson } from "./user-store";
export {
  requireUser,
  requireUserOr401,
  type AuthenticatedUser,
} from "./requireUser";
export { lookupDisplayName } from "./lookupUser";
