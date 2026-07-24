/**
 * Audit log helper — append entry vào datasets/_audit/delete.log.
 *
 * Spec D4 — provenance cho soft delete.
 *
 * Pattern: read existing (Contents API) → append line → commit qua commitFiles.
 * Race window: 2 user delete cùng lúc có thể overwrite line — spec D4 note.
 * Mitigation: commit message có timestamp + slug để trace git history.
 */

import { commitFiles } from "@/lib/git/commit";
import { getGithubConfig } from "@/lib/datasets/types";

export interface DeleteAuditEntry {
  username: string;
  slug: string;
  reason?: string;
  isoTime?: string;
}

const AUDIT_PATH = "datasets/_audit/delete.log";

/**
 * Read existing audit log content (raw text) — returns "" nếu file chưa tồn tại.
 */
async function readExistingLog(): Promise<string> {
  const config = getGithubConfig();
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${AUDIT_PATH}?ref=${config.branch}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "vnexpress-data-platform",
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    },
    cache: "no-store",
  });
  if (res.status === 404) return ""; // file chưa tồn tại
  if (!res.ok) {
    console.warn(`[audit] read delete.log failed (${res.status})`);
    return "";
  }
  const data = (await res.json()) as { content?: string };
  const b64 = (data.content ?? "").replace(/\n/g, "");
  return Buffer.from(b64, "base64").toString("utf-8");
}

/**
 * Append 1 line vào datasets/_audit/delete.log.
 * Format: `<ISO> | <username> | <slug> | <reason>`
 *
 * Atomic per-call (read-modify-write — race window per spec D4).
 */
export async function appendDeleteAudit(entry: DeleteAuditEntry): Promise<void> {
  const iso = entry.isoTime ?? new Date().toISOString();
  const line = `${iso} | ${entry.username} | ${entry.slug} | ${entry.reason ?? "-"}\n`;

  const existing = await readExistingLog();
  const newContent = existing + line;

  await commitFiles(
    [
      {
        path: AUDIT_PATH,
        content: newContent,
      },
    ],
    `Audit: delete dataset ${entry.slug} by ${entry.username}`
  );
}
