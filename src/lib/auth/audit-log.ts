/**
 * Audit log helper — append entry vào datasets/_audit/delete.log.
 *
 * Spec D4 — provenance cho soft delete.
 *
 * Pattern: read existing (Contents API) → append line → commit qua commitFiles.
 * Đây là read-modify-write nên có cửa sổ đua, và nó ĐÃ xảy ra thật: đo 2026-09-04,
 * log chỉ có 3 dòng cho 5 lượt xoá mềm — hai lượt ngày 04/08 không ghi được.
 * Nguyên nhân khả dĩ nhất: route commit `metadata.yaml` xong rồi commit log ngay
 * sau, mà `updateRef` không dùng force nên ref vừa đổi làm lượt thứ hai bị 422.
 * Nên có thử lại (đọc lại nội dung mỗi lượt) và có lỗi riêng để chỗ gọi báo ra.
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
 * Số lần thử. Mỗi lượt đọc LẠI nội dung log trước khi ghi — thử lại mà giữ nội
 * dung cũ thì lượt sau ghi đè mất dòng người khác vừa thêm.
 */
const MAX_ATTEMPTS = 3;

/**
 * Lỗi mang theo đúng dòng chưa ghi được.
 *
 * Chỗ gọi cần in ra dòng đó: dataset đã bị xoá xong rồi, không hoàn tác được, nên
 * thứ duy nhất còn cứu được là để người vận hành thêm tay vào log. Ném lỗi chung
 * chung thì dòng đó mất luôn.
 */
export class DeleteAuditFailed extends Error {
  constructor(
    readonly line: string,
    cause?: unknown,
  ) {
    super(`Không ghi được vết xoá vào ${AUDIT_PATH} sau ${MAX_ATTEMPTS} lần thử`);
    this.name = "DeleteAuditFailed";
    this.cause = cause;
  }
}

/** Read existing audit log content (raw text) — returns "" nếu file chưa tồn tại. */
async function readExistingLog(): Promise<string> {
  const result = await fetchFileContents(AUDIT_PATH);
  return result?.content ?? "";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Append 1 line vào datasets/_audit/delete.log.
 * Format: `<ISO> | <username> | <slug> | <reason>`
 *
 * @throws DeleteAuditFailed khi hết số lần thử — KHÔNG nuốt lỗi.
 */
export async function appendDeleteAudit(entry: DeleteAuditEntry): Promise<void> {
  const iso = entry.isoTime ?? new Date().toISOString();
  const line = `${iso} | ${entry.username} | ${entry.slug} | ${entry.reason ?? "-"}\n`;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const existing = await readExistingLog();
      await commitFiles(
        [{ path: AUDIT_PATH, content: existing + line }],
        `Audit: delete dataset ${entry.slug} by ${entry.username}`,
      );
      return;
    } catch (err) {
      lastErr = err;
      // Nghỉ tăng dần: nguyên nhân hay gặp là ref vừa đổi hoặc Contents API còn
      // trả bản cũ, cả hai đều tự hết sau vài trăm ms.
      if (attempt < MAX_ATTEMPTS) await sleep(400 * attempt);
    }
  }
  throw new DeleteAuditFailed(line, lastErr);
}
