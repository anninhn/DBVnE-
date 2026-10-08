/**
 * Trạng thái phiên của harness — lưu ra ĐĨA, không giữ trong bộ nhớ. Mỗi lượt
 * `claude -p` sinh một tiến trình MCP mới, nhưng các lượt hỏi tiếp trong cùng phiên
 * phải thấy kết quả (`result_id`), bộ đếm phép thử và thẻ của lượt trước.
 *
 * Chỉ dùng khi chạy local (pilot). Thư mục nằm trong .gitignore.
 */

import { promises as fs } from "fs";
import path from "path";
import { randomBytes, randomUUID } from "crypto";
import type { ConceptCandidates, Level, SuggestResult } from "./measures";

export const INSIGHT_DATA_DIR = path.join(process.cwd(), "data", "insight");
const SESSION_DIR = path.join(INSIGHT_DATA_DIR, "sessions");

export interface ToolResult {
  id: string;
  tool: string;
  args: unknown;
  summary: unknown;
  chart?: unknown;
  /** Mọi con số xuất hiện trong summary — nguồn duy nhất để rào chắn khớp số */
  numbers: number[];
  turn: number;
  at: string;
}

export interface CardRecord {
  turn: number;
  at: string;
  card: unknown;
  ok: boolean;
  errors: string[];
  attempt: number;
}

/** Kết quả đối chiếu khái niệm trong câu hỏi ↔ cột đo trong dataset đã chọn. */
export interface AnalysisPlan {
  turn: number;
  concepts: { ten: string; slug: string | null; measure: string | null }[];
  /** Khái niệm chưa có số liệu trong các dataset đã chọn */
  missing: string[];
}

export interface Session {
  id: string;
  /** Bí mật dùng chung giữa route chạy và MCP proxy — chặn gọi tool từ ngoài phiên */
  token: string;
  createdAt: string;
  user?: string;
  slugs: string[];
  questions: { turn: number; text: string; at: string }[];
  results: Record<string, ToolResult>;
  testsCount: number;
  cards: CardRecord[];
  turn: number;
  /** Lần đối chiếu gần nhất (plan_analysis) */
  plan?: AnalysisPlan;
  /** Bước đề xuất chỉ tiêu: ứng viên code đo được + đề xuất cuối */
  candidates?: { level: Level; list: ConceptCandidates[] };
  suggestion?: SuggestResult;
  /** Chỉ tiêu phóng viên đã xác nhận — phân tích PHẢI dùng đúng các chỉ tiêu này */
  confirmed?: { ten: string; slug: string; measure: string }[];
}

function fileOf(id: string): string {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("session id không hợp lệ");
  return path.join(SESSION_DIR, `${id}.json`);
}

export async function createSession(user: string | undefined, slugs: string[]): Promise<Session> {
  await fs.mkdir(SESSION_DIR, { recursive: true });
  const s: Session = {
    id: randomUUID(),
    token: randomBytes(24).toString("hex"),
    createdAt: new Date().toISOString(),
    user,
    slugs,
    questions: [],
    results: {},
    testsCount: 0,
    cards: [],
    turn: 0,
  };
  await saveSession(s);
  return s;
}

export async function loadSession(id: string): Promise<Session | null> {
  try {
    return JSON.parse(await fs.readFile(fileOf(id), "utf8")) as Session;
  } catch {
    return null;
  }
}

export async function saveSession(s: Session): Promise<void> {
  await fs.mkdir(SESSION_DIR, { recursive: true });
  const f = fileOf(s.id);
  await fs.writeFile(`${f}.tmp`, JSON.stringify(s, null, 2));
  await fs.rename(`${f}.tmp`, f);
}

/** Gom mọi số trong một object lồng nhau (kể cả số nằm trong chuỗi như "2010–2018"). */
export function collectNumbers(v: unknown, out: number[] = []): number[] {
  if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  else if (typeof v === "string") {
    for (const m of v.matchAll(/-?\d+(?:\.\d+)?/g)) out.push(Number(m[0]));
  } else if (Array.isArray(v)) v.forEach((x) => collectNumbers(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectNumbers(x, out));
  return out;
}

export function nextResultId(s: Session): string {
  return `r_${String(Object.keys(s.results).length + 1).padStart(3, "0")}`;
}

// Claude Code có thể gọi nhiều tool song song → khoá theo phiên để đọc–sửa–ghi file
// không đè nhau. Khoá trong bộ nhớ là đủ vì mọi lượt gọi tool đi qua cùng một tiến
// trình Next (route /api/insight/tools).
const locks = new Map<string, Promise<unknown>>();

export async function withSession<T>(id: string, fn: (s: Session) => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const run = prev.then(async () => {
    const s = await loadSession(id);
    if (!s) throw new Error(`Không tìm thấy phiên ${id}`);
    const out = await fn(s);
    await saveSession(s);
    return out;
  });
  locks.set(id, run.catch(() => undefined));
  return run;
}
