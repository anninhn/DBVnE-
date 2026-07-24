/**
 * Read users.json từ GitHub Contents API.
 *
 * Tách riêng khỏi config.ts để:
 * - Cache được qua React cache() (1 fetch per request — tránh N+1)
 * - Reuse cho lookupUser.ts (map username → displayName)
 *
 * Spec D1 + plan task 5 + task 20.
 */

import { cache } from "react";
import { fetchFileContents } from "@/lib/github/contents-api";

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  role: string;
  createdAt: string;
  active?: boolean;
}

interface UsersFile {
  users: UserRecord[];
}

/**
 * Fetch users.json qua GitHub Contents API (authoritative, không CDN cache).
 */
export const readUsersJson = cache(async (): Promise<UserRecord[]> => {
  const result = await fetchFileContents("datasets/_users/users.json");
  if (!result) {
    console.warn("[auth] datasets/_users/users.json không tồn tại trong repo");
    return [];
  }
  try {
    const parsed = JSON.parse(result.content) as UsersFile;
    return parsed.users ?? [];
  } catch (err) {
    console.warn("[auth] users.json parse failed:", err);
    return [];
  }
});
