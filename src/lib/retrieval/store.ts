/**
 * Đọc/ghi hai chỉ mục tra cứu trên R2.
 *
 * Chỉ mục là **dữ liệu sinh ra, tái tạo được từ metadata trong git** (D1) — nên nằm
 * ở R2 chứ không commit vào git. Commit 6 MB số thực vào git làm history vô dụng,
 * trái nguyên tắc "GitHub cho metadata text" của `constitution/tech-stack.md`.
 *
 * Cache ở module scope: trên serverless, các request nóng trong cùng instance dùng
 * lại được; cold start thì tải lại. Cùng cách `flatten-metadata.ts` đang làm.
 */

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, getR2Bucket } from "@/lib/r2/client";
import {
  RetrievalIndexUnavailableError,
  type RetrievalIndex,
  type ValueIndex,
} from "./types";

const RETRIEVAL_INDEX_KEY = "_index/retrieval.json";
const VALUE_INDEX_KEY = "_index/values.json";

/**
 * Prefix `_index/` phải được khai trong PROTECTED_PREFIXES của
 * `tools/cleanup-orphans.mjs` — nếu không, script dọn rác sẽ coi hai file này là
 * orphan (không metadata.yaml nào tham chiếu tới chúng) và xoá mất.
 * Đã xảy ra đúng lỗi này với log chat ngày 2026-08-27.
 */
export const INDEX_PREFIX = "_index/";

let retrievalCache: { data: RetrievalIndex; at: number } | null = null;
let valueCache: { data: ValueIndex; at: number } | null = null;

/** Cache 5 phút — đủ để request nóng dùng lại, đủ ngắn để upload mới hiện ra nhanh. */
const CACHE_TTL_MS = 5 * 60_000;

export function clearIndexCache(): void {
  retrievalCache = null;
  valueCache = null;
}

async function readIndex<T>(key: string, what: string): Promise<T> {
  try {
    const res = await getR2Client().send(
      new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }),
    );
    const body = await res.Body?.transformToString();
    if (!body) throw new RetrievalIndexUnavailableError(what);
    return JSON.parse(body) as T;
  } catch (err) {
    // NoSuchKey = chưa dựng bao giờ. Mọi lỗi khác = đọc thất bại.
    // Cả hai đều PHẢI ném — trả về rỗng là nói "không tìm thấy gì" khi thực ra là
    // "chưa biết", và caller không có cách nào phân biệt.
    if (err instanceof RetrievalIndexUnavailableError) throw err;
    throw new RetrievalIndexUnavailableError(what, err);
  }
}

async function writeIndex<T>(key: string, data: T): Promise<void> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: JSON.stringify(data),
      ContentType: "application/json",
    }),
  );
}

export async function loadRetrievalIndex(): Promise<RetrievalIndex> {
  if (retrievalCache && Date.now() - retrievalCache.at < CACHE_TTL_MS) {
    return retrievalCache.data;
  }
  const data = await readIndex<RetrievalIndex>(RETRIEVAL_INDEX_KEY, "tìm kiếm");
  retrievalCache = { data, at: Date.now() };
  return data;
}

export async function loadValueIndex(): Promise<ValueIndex> {
  if (valueCache && Date.now() - valueCache.at < CACHE_TTL_MS) {
    return valueCache.data;
  }
  const data = await readIndex<ValueIndex>(VALUE_INDEX_KEY, "giá trị");
  valueCache = { data, at: Date.now() };
  return data;
}

export async function saveRetrievalIndex(index: RetrievalIndex): Promise<void> {
  await writeIndex(RETRIEVAL_INDEX_KEY, index);
  retrievalCache = { data: index, at: Date.now() };
}

export async function saveValueIndex(index: ValueIndex): Promise<void> {
  await writeIndex(VALUE_INDEX_KEY, index);
  valueCache = { data: index, at: Date.now() };
}

export { RETRIEVAL_INDEX_KEY, VALUE_INDEX_KEY };
