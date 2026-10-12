/**
 * Nơi giữ kết quả tool để `check_answer` đối chiếu (spec 2026-10-12-mcp-connector).
 *
 *  - Local (stdio, cầu nối HTTP): một tiến trình = một phiên → giữ trong bộ nhớ.
 *  - Production (`/api/mcp`, serverless, stateless): mỗi lần gọi có thể chạy ở instance khác → lưu R2
 *    `_mcp/results/<băm email>/<result_id>.json`, chỉ dùng kết quả trong 24 giờ.
 *
 * Prefix `_mcp/` phải có trong PROTECTED_PREFIXES của tools/cleanup-orphans.mjs.
 */

import { createHash, randomBytes } from "crypto";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client } from "@/lib/r2/client";

export interface StoredResult {
  op: string;
  args: unknown;
  data: Record<string, unknown>;
}

export interface ResultStore {
  /** Lưu kết quả có result_id; trả id */
  put(r: StoredResult): Promise<string>;
  /** Lưu kết quả ngữ cảnh (find / describe / scope) — không có id nhưng số trong đó trích được */
  putContext(r: StoredResult): Promise<void>;
  get(ids: string[]): Promise<Map<string, StoredResult>>;
  /** Mọi kết quả + ngữ cảnh gần đây của phiên */
  recent(): Promise<StoredResult[]>;
}

export class MemoryStore implements ResultStore {
  private results = new Map<string, StoredResult>();
  private context: StoredResult[] = [];
  private n = 0;
  async put(r: StoredResult) {
    const id = `r${++this.n}`;
    this.results.set(id, r);
    return id;
  }
  async putContext(r: StoredResult) {
    this.context.push(r);
  }
  async get(ids: string[]) {
    return new Map(ids.filter((id) => this.results.has(id)).map((id) => [id, this.results.get(id)!]));
  }
  async recent() {
    return [...this.results.values(), ...this.context];
  }
}

const TTL_MS = 24 * 3600_000;
const CHART_PREFIX = "_mcp/charts/";

/** Lưu spec biểu đồ để trang /bieu-do/<id> vẽ — cho mọi client (kể cả client không hiển thị được HTML). Số liệu công khai, id ngẫu nhiên. */
export async function saveChart(spec: unknown): Promise<string> {
  const id = randomBytes(8).toString("hex");
  await getR2Client().send(
    new PutObjectCommand({ Bucket: getR2Bucket(), Key: `${CHART_PREFIX}${id}.json`, Body: JSON.stringify(spec), ContentType: "application/json" })
  );
  return id;
}

export async function loadChart(id: string): Promise<Record<string, unknown> | null> {
  if (!/^[0-9a-f]{16}$/.test(id)) return null;
  try {
    const res = await getR2Client().send(new GetObjectCommand({ Bucket: getR2Bucket(), Key: `${CHART_PREFIX}${id}.json` }));
    const body = await res.Body?.transformToString();
    return body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}
const PREFIX = "_mcp/results/";

export class R2Store implements ResultStore {
  private dir: string;
  constructor(user: string) {
    this.dir = `${PREFIX}${createHash("sha256").update(user.toLowerCase()).digest("hex").slice(0, 16)}/`;
  }
  private async write(name: string, r: StoredResult) {
    await getR2Client().send(
      new PutObjectCommand({ Bucket: getR2Bucket(), Key: `${this.dir}${name}.json`, Body: JSON.stringify(r), ContentType: "application/json" })
    );
  }
  private async read(key: string): Promise<StoredResult | null> {
    try {
      const res = await getR2Client().send(new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }));
      if (res.LastModified && Date.now() - res.LastModified.getTime() > TTL_MS) return null;
      const body = await res.Body?.transformToString();
      return body ? (JSON.parse(body) as StoredResult) : null;
    } catch {
      return null;
    }
  }
  async put(r: StoredResult) {
    const id = `r${randomBytes(4).toString("hex")}`;
    await this.write(id, r);
    return id;
  }
  async putContext(r: StoredResult) {
    await this.write(`c${randomBytes(4).toString("hex")}`, r);
  }
  async get(ids: string[]) {
    const out = new Map<string, StoredResult>();
    await Promise.all(
      ids.map(async (id) => {
        if (!/^r[0-9a-f]{8}$/.test(id)) return;
        const r = await this.read(`${this.dir}${id}.json`);
        if (r) out.set(id, r);
      })
    );
    return out;
  }
  async recent() {
    const list = await getR2Client().send(new ListObjectsV2Command({ Bucket: getR2Bucket(), Prefix: this.dir, MaxKeys: 500 }));
    const keys = (list.Contents ?? [])
      .filter((o) => o.Key && o.LastModified && Date.now() - o.LastModified.getTime() <= TTL_MS)
      .sort((a, b) => b.LastModified!.getTime() - a.LastModified!.getTime())
      .slice(0, 80)
      .map((o) => o.Key!);
    return (await Promise.all(keys.map((k) => this.read(k)))).filter(Boolean) as StoredResult[];
  }
}
