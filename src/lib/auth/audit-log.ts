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
import { fetchFileContents } from "@/lib/github/contents-api";

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
  const result = await fetchFileContents(AUDIT_PATH);
  return result?.content ?? "";
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
