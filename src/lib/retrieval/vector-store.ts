/**
 * Chỉ mục vector: đọc/ghi trên R2, cache ở module scope, tính cosine trong memory.
 *
 * Không dùng vector database (R2 — quyết định, không phải hạn chế): 495 dataset ×
 * 768 chiều là vài MB, và cosine trên vài nghìn vector mất vài chục ms trong Node.
 * Thêm một hạ tầng phải vận hành cho việc đó là trả giá mà không được gì.
 *
 * Dạng lưu trên R2 KHÁC dạng trong memory: trên đĩa vector là chuỗi base64 của
 * Float32Array, trong memory là `number[]`. Lý do ở `encodeVector`.
 */

import { createHash } from "crypto";

import { readIndex, writeIndex, CACHE_TTL_MS } from "./store";
import { embedDimensions } from "./embed";
import {
  RetrievalIndexUnavailableError,
  type RetrievalIndex,
  type RetrievalIndexEntry,
} from "./types";

const RETRIEVAL_INDEX_KEY = "_index/retrieval.json";

/** Dạng một entry khi nằm trên R2 — `v` là vector đã đóng gói. */
interface StoredEntry {
  slug: string;
  text: string;
  keywords: string[];
  sourceFingerprint: string;
  builtAt: string;
  v: string;
}

interface StoredIndex {
  entries: StoredEntry[];
  builtAt: string;
  dimensions: number;
}

/**
 * Đóng gói vector thành base64 của Float32Array.
 *
 * Vì sao không lưu thẳng `number[]` trong JSON: mỗi số thực in ra khoảng 20 ký tự,
 * nên 768 chiều × 495 dataset là ~7,5 MB chỉ riêng phần số, và ~30 MB nếu để model
 * trả về đủ 3.072 chiều. Float32 là 4 byte, base64 tốn thêm 1/3 → khoảng 4 KB mỗi
 * dataset, tức ~2 MB cho 495 và ~8 MB ở 2.000. Đó là mức mà R2 đã tính khi kết
 * luận "đọc vào memory mỗi cold start" là được.
 *
 * Mất độ chính xác: float64 → float32 làm sai số ~1e-7 mỗi chiều. Cosine giữa hai
 * vector đã chuẩn hoá độ dài lệch dưới 1e-6 — nhỏ hơn nhiều so với khoảng cách
 * giữa hai dataset khác nhau, nên không đổi thứ tự kết quả.
 */
function encodeVector(vector: number[]): string {
  const f32 = new Float32Array(vector);
  return Buffer.from(f32.buffer).toString("base64");
}

function decodeVector(encoded: string): number[] {
  const buf = Buffer.from(encoded, "base64");
  const f32 = new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  return Array.from(f32);
}

/**
 * Dấu vết của metadata đã dùng để sinh entry (D3, T045).
 *
 * Đây là thứ duy nhất phát hiện được lỗi im lặng nặng nhất của cả đợt: vector cũ +
 * metadata mới thì hệ thống VẪN trả lời, chỉ là trả lời sai dataset, và không có
 * triệu chứng nào. So dấu vết của entry với dấu vết tính lại từ metadata hiện
 * hành, khác nhau nghĩa là entry đã cũ.
 *
 * Băm chính `text` đã dùng để sinh vector — không băm cả metadata: những trường
 * không vào `text` thì cũng không ảnh hưởng vector, báo lệch vì chúng là báo động
 * giả, và báo động giả nhiều lần thì người ta ngừng đọc báo động.
 */
export function fingerprint(indexText: string): string {
  return createHash("sha256").update(indexText).digest("hex").slice(0, 16);
}

let cache: { data: RetrievalIndex; at: number } | null = null;

export function clearVectorIndexCache(): void {
  cache = null;
}

export async function loadVectorIndex(): Promise<RetrievalIndex> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const stored = await readIndex<StoredIndex>(RETRIEVAL_INDEX_KEY, "tìm kiếm");

  // Số chiều lưu trong file phải khớp số chiều model đang trả về. Lệch nghĩa là
  // model hoặc cấu hình đã đổi mà chỉ mục chưa dựng lại — cosine giữa câu hỏi và
  // vector cũ lúc đó là vô nghĩa, mà vẫn ra một con số trông hợp lý.
  if (stored.dimensions !== embedDimensions()) {
    throw new RetrievalIndexUnavailableError(
      `tìm kiếm (chỉ mục ${stored.dimensions} chiều, model đang trả ${embedDimensions()} chiều — dựng lại)`,
    );
  }

  const data: RetrievalIndex = {
    builtAt: stored.builtAt,
    dimensions: stored.dimensions,
    entries: stored.entries.map((e) => ({
      slug: e.slug,
      text: e.text,
      keywords: e.keywords,
      sourceFingerprint: e.sourceFingerprint,
      builtAt: e.builtAt,
      vector: decodeVector(e.v),
    })),
  };

  cache = { data, at: Date.now() };
  return data;
}

export async function saveVectorIndex(index: RetrievalIndex): Promise<void> {
  const stored: StoredIndex = {
    builtAt: index.builtAt,
    dimensions: index.dimensions,
    entries: index.entries.map((e) => ({
      slug: e.slug,
      text: e.text,
      keywords: e.keywords,
      sourceFingerprint: e.sourceFingerprint,
      builtAt: e.builtAt,
      v: encodeVector(e.vector),
    })),
  };
  await writeIndex(RETRIEVAL_INDEX_KEY, stored);
  cache = { data: index, at: Date.now() };
}

/**
 * Ghi lại entry của **một** dataset, giữ nguyên phần còn lại (R4, FR-032/FR-033).
 *
 * Dựng lại cả chỉ mục mỗi lần upload là 495 lượt gọi embedding cho một thay đổi.
 * Đọc–sửa–ghi cả file không phải nguyên tử, nhưng ở quy mô một toà soạn thì hai
 * lượt upload trùng đúng một giây là chuyện không xảy ra, và `--apply` của script
 * dựng lại là đường chữa khi có.
 */
export async function upsertVectorEntry(
  entry: RetrievalIndexEntry,
): Promise<void> {
  const index = await loadVectorIndex();
  const rest = index.entries.filter((e) => e.slug !== entry.slug);
  await saveVectorIndex({
    ...index,
    entries: [...rest, entry],
    builtAt: index.builtAt,
  });
}

/** Bỏ entry khi dataset bị xoá (D6). Không có entry thì không làm gì. */
export async function removeVectorEntry(slug: string): Promise<boolean> {
  const index = await loadVectorIndex();
  const rest = index.entries.filter((e) => e.slug !== slug);
  if (rest.length === index.entries.length) return false;
  await saveVectorIndex({ ...index, entries: rest });
  return true;
}

/**
 * Tích vô hướng — bằng cosine vì cả hai vector đã được chuẩn hoá độ dài ở
 * `embed.ts`. Không chuẩn hoá ở đó thì phép này sai mà không báo gì.
 */
function dot(a: number[], b: number[]): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

export interface VectorHit {
  slug: string;
  /** Cosine trong [-1, 1]; thực tế với embedding text thường nằm trong [0, 1] */
  score: number;
}

/** Xếp mọi entry theo độ tương đồng với vector câu hỏi. */
export function rankByVector(
  index: RetrievalIndex,
  queryVector: number[],
): VectorHit[] {
  return index.entries
    .map((e) => ({ slug: e.slug, score: dot(e.vector, queryVector) }))
    .sort((a, b) => b.score - a.score);
}

export { RETRIEVAL_INDEX_KEY };
