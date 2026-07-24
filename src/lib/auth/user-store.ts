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
import { getGithubConfig, rawUrl } from "@/lib/datasets/types";

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
 * Same pattern với read.ts fetchRaw.
 */
export const readUsersJson = cache(async (): Promise<UserRecord[]> => {
  const config = getGithubConfig();
  const url = rawUrl(config, "datasets/_users/users.json");

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "vnexpress-data-platform",
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
  };

  const res = await fetch(url, { headers, cache: "no-store" });
  if (res.status === 404) {
    console.warn("[auth] datasets/_users/users.json không tồn tại trong repo");
    return [];
  }
  if (!res.ok) {
    throw new Error(`GitHub contents API failed: users.json (${res.status})`);
  }

  const data = (await res.json()) as { content?: string; encoding?: string };
  if (!data.content) return [];

  const b64 = data.content.replace(/\n/g, "");
  const text = Buffer.from(b64, "base64").toString("utf-8");
  const parsed = JSON.parse(text) as UsersFile;
  return parsed.users ?? [];
});
