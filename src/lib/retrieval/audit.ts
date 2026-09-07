/**
 * Ghi nhận mỗi lượt gọi năng lực tra cứu kèm người gọi (FR-059).
 *
 * Vì sao cần: constitution ghi "mỗi con số phải trace được nguồn". Khi một con số
 * trong bài báo bị chất vấn, phải lần lại được ai đã tra gì, lúc nào, và năng lực
 * trả về gì. Log hội thoại hiện có (`chat-log.ts`) chỉ ghi câu hỏi và câu trả lời —
 * không ghi bước tra cứu ở giữa.
 *
 * Best-effort: R2 hỏng thì KHÔNG được làm hỏng lượt tra cứu. Mất một dòng log tệ
 * hơn nhiều so với việc phóng viên không tra được dữ liệu.
 */

import { GetObjectCommand, PutObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { getR2Client, getR2Bucket } from "@/lib/r2/client";

const AUDIT_PREFIX = "logs/retrieval";

export interface RetrievalAuditEntry {
  at: string;
  caller: string;
  capability: "searchDatasets" | "getDataset" | "lookupValue";
  /** Câu hỏi hoặc giá trị tra — cắt ngắn, không lưu nguyên văn dài */
  input: string;
  /** Số kết quả trả về; `null` khi năng lực ném lỗi */
  resultCount: number | null;
  latencyMs: number;
  error?: string;
}

function auditKey(date: string): string {
  return `${AUDIT_PREFIX}/${date}.json`;
}

export async function recordRetrieval(entry: RetrievalAuditEntry): Promise<void> {
  const date = entry.at.slice(0, 10);
  const key = auditKey(date);
  try {
    let existing: RetrievalAuditEntry[] = [];
    try {
      const res = await getR2Client().send(
        new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }),
      );
      const body = await res.Body?.transformToString();
      if (body) existing = JSON.parse(body) as RetrievalAuditEntry[];
    } catch (err) {
      if (!(err instanceof NoSuchKey)) throw err;
    }
    existing.push(entry);
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Body: JSON.stringify(existing),
        ContentType: "application/json",
      }),
    );
  } catch (err) {
    console.warn("[retrieval/audit] ghi log thất bại:", err);
  }
}

/**
 * Bọc một lời gọi năng lực: đo thời gian, ghi log, ném lại lỗi nguyên vẹn.
 *
 * Ghi log CẢ khi lỗi — lượt tra thất bại cũng là thông tin cần trace, và nếu chỉ ghi
 * lượt thành công thì log sẽ vẽ ra bức tranh đẹp hơn thực tế.
 */
export async function withAudit<T>(
  capability: RetrievalAuditEntry["capability"],
  caller: string,
  input: string,
  countResults: (result: T) => number,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  const at = new Date().toISOString();
  try {
    const result = await fn();
    void recordRetrieval({
      at,
      caller,
      capability,
      input: input.slice(0, 200),
      resultCount: countResults(result),
      latencyMs: Date.now() - start,
    });
    return result;
  } catch (err) {
    void recordRetrieval({
      at,
      caller,
      capability,
      input: input.slice(0, 200),
      resultCount: null,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
