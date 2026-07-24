/**
 * Map username → displayName qua users.json.
 *
 * Cache via React cache() ở user-store.ts (1 fetch per request).
 * Build map 1 lần rồi lookup — tránh N+1 trong listing.
 *
 * Spec T8 — performance optimization.
 */

import { cache } from "react";
import { readUsersJson } from "./user-store";

/**
 * Build username → displayName map (1 fetch per request).
 * Listing/detail dùng chung qua React cache().
 */
export const getUserMap = cache(async (): Promise<Map<string, string>> => {
  const users = await readUsersJson();
  const map = new Map<string, string>();
  for (const u of users) {
    map.set(u.username, u.displayName);
  }
  return map;
});

/**
 * Lookup displayName cho 1 username. Fallback: chính username nếu không tìm thấy
 * (vd: user đã bị xóa khỏi users.json nhưng metadata.yaml vẫn reference).
 */
export async function lookupDisplayName(username: string | undefined | null): Promise<string> {
  if (!username) return "unknown";
  const map = await getUserMap();
  return map.get(username) ?? username;
}
