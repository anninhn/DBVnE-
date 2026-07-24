/**
 * GitHub Contents API helper — DRY pattern dùng ở 5+ chỗ.
 *
 * Tách khỏi src/lib/datasets/{read,list}.ts + src/lib/auth/{user-store,audit-log}.ts
 * vì cùng 1 fetch + base64 decode lặp lại. Refactor 2026-07-24-pre-launch-refactor.
 *
 * Dùng api.github.com/repos/.../contents/ (KHÔNG raw.githubusercontent.com) vì:
 * - raw endpoint có Fastly CDN cache 10-30s sau commit → 404 stale
 * - Contents API authoritative → đọc ngay sau git push
 * Trade-off: rate limit 5000 req/hour (authenticated). OK cho newsroom scale.
 *
 * Reference: memory `feedback_github_contents_api`.
 */

import { getGithubConfig, rawUrl } from "@/lib/datasets/types";

export interface FetchFileResult {
  /** Decoded UTF-8 content */
  content: string;
  /** Git blob SHA — cần cho PUT Contents API update atomic (optional) */
  sha: string;
}

export interface GithubContentEntry {
  name: string;
  path: string;
  type: "file" | "dir";
}

function buildHeaders(token?: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "vnexpress-data-platform",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Fetch nội dung 1 file từ GitHub Contents API.
 *
 * Returns:
 *   - `{ content, sha }` khi OK
 *   - `null` khi 404 (file/folder không tồn tại)
 *   - Throw khi lỗi khác (network, 401, 5xx) — caller xử lý
 */
export async function fetchFileContents(
  path: string,
): Promise<FetchFileResult | null> {
  const config = getGithubConfig();
  const url = rawUrl(config, path);
  const res = await fetch(url, {
    headers: buildHeaders(config.token),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub contents API failed: ${path} (${res.status})`);
  }
  const data = (await res.json()) as {
    content?: string;
    sha?: string;
    encoding?: string;
  };
  if (!data.content) return null;
  // Contents API trả content base64-encoded, có newlines → strip trước khi decode
  const b64 = data.content.replace(/\n/g, "");
  const content = Buffer.from(b64, "base64").toString("utf-8");
  return { content, sha: data.sha ?? "" };
}

/**
 * List entries trong 1 folder (không đệ quy).
 * Returns [] khi folder không tồn tại (404).
 */
export async function listFolderEntries(
  path: string,
): Promise<GithubContentEntry[]> {
  const config = getGithubConfig();
  const url = rawUrl(config, path);
  const res = await fetch(url, {
    headers: { ...buildHeaders(config.token), "Cache-Control": "no-cache" },
    cache: "no-store",
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(
      `GitHub contents API list failed: ${path} (${res.status})`,
    );
  }
  return (await res.json()) as GithubContentEntry[];
}
