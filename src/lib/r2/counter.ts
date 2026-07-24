/**
 * R2-backed download counter — lưu `_counters/<slug>.json` trong R2 bucket.
 *
 * Why R2 thay vì commit metadata.yaml mỗi download:
 * - Không pollute git history (commit/download = noisy log).
 * - R2 đã setup, không cần new dependency (KV/Redis).
 * - Trade-off: race condition — 2 downloads concurrent có thể mất 1 count.
 *   Phase 1 low traffic → acceptable. Phase sau nếu cần atomic → Vercel KV.
 *
 * Trade-off provenance: count tách rời metadata.yaml (không có trong git history).
 * Downloads không phải metadata edit → không cần audit git. Count vẫn trace được
 * qua R2 object (`last_downloaded_at` field trong JSON).
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client } from "./client";

const COUNTERS_PREFIX = "_counters";

interface DownloadCounter {
  count: number;
  last_downloaded_at?: string;
}

function counterKey(slug: string): string {
  return `${COUNTERS_PREFIX}/${slug}.json`;
}

/**
 * Đọc số lượt download của 1 dataset.
 * Trả 0 nếu chưa có counter (NoSuchKey = lần đầu).
 * Trả 0 nếu lỗi R2 (best-effort, không crash view).
 */
export async function getDownloadCount(slug: string): Promise<number> {
  try {
    const res = await getR2Client().send(
      new GetObjectCommand({
        Bucket: getR2Bucket(),
        Key: counterKey(slug),
      }),
    );
    const body = await res.Body?.transformToString();
    if (!body) return 0;
    const parsed = JSON.parse(body) as DownloadCounter;
    return typeof parsed.count === "number" ? parsed.count : 0;
  } catch (err) {
    if (err instanceof NoSuchKey) return 0;
    // Lỗi khác (network/R2 down) — log + trả 0, không crash listing
    console.warn(`[counter] getDownloadCount(${slug}) failed:`, err);
    return 0;
  }
}

/**
 * Tăng counter + update last_downloaded_at.
 *
 * Read-then-write (không atomic): 2 concurrent downloads có thể đọc cùng count=N,
 * cùng ghi N+1 → mất 1 count. Acceptable cho Phase 1 low traffic.
 */
export async function incrementDownloadCount(slug: string): Promise<void> {
  const current = await getDownloadCount(slug);
  const next: DownloadCounter = {
    count: current + 1,
    last_downloaded_at: new Date().toISOString(),
  };
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: counterKey(slug),
      Body: JSON.stringify(next),
      ContentType: "application/json",
    }),
  );
}
