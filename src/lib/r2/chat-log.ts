/**
 * Discovery Chat log — append-only JSON trong R2 bucket.
 *
 * Path layout:
 *   logs/chat/<YYYY-MM-DD>.json       — array of ChatLogEntry
 *   logs/chat/_quota/<YYYY-MM-DD>.json — { count, last_query_at } global counter
 *
 * Pattern reuse counter.ts (read-then-write, không atomic — OK cho low traffic Phase 2).
 * Entries có id (UUID) để update thumbs sau.
 *
 * Spec 2026-07-24-discovery-chat.
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { getR2Bucket, getR2Client } from "./client";

const CHAT_LOG_PREFIX = "logs/chat";

/** Per-user rate limit — Gemini free tier 15 RPM global, 1500 RPD. */
export const RATE_LIMIT_PER_USER_PER_DAY = 100;

/** Alert threshold (80% của Gemini free tier 1500 RPD). */
export const GLOBAL_QUOTA_WARN_THRESHOLD = 1200;

export interface ChatLogEntry {
  id: string;
  timestamp: string; // ISO datetime
  user_email: string;
  query: string;
  answer_summary: string; // 200 chars đầu của answer
  datasets_cited: string[]; // slugs
  thumbs: "up" | "down" | null;
  feedback_text?: string;
  latency_ms: number;
}

interface DailyQuota {
  count: number;
  last_query_at: string;
}

function logKey(date: string): string {
  return `${CHAT_LOG_PREFIX}/${date}.json`;
}

function quotaKey(date: string): string {
  return `${CHAT_LOG_PREFIX}/_quota/${date}.json`;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC — đủ granularity)
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const res = await getR2Client().send(
      new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }),
    );
    const body = await res.Body?.transformToString();
    if (!body) return fallback;
    return JSON.parse(body) as T;
  } catch (err) {
    if (err instanceof NoSuchKey) return fallback;
    console.warn(`[chat-log] read ${key} failed:`, err);
    return fallback;
  }
}

async function writeJson<T>(key: string, data: T): Promise<void> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: JSON.stringify(data),
      ContentType: "application/json",
    }),
  );
}

/**
 * Append entry vào log ngày hôm nay. Trả id (UUID) — client dùng cho thumbs update.
 *
 * Accept `id` optional — nếu route generate trước (để expose qua X-Chat-Id header),
 * dùng id đó; else tự generate.
 *
 * Failures (R2 down) không crash request — best-effort log. Return id luôn để client
 * không bị inconsistent UI (id không match → thumbs update silent fail OK).
 */
export async function appendChatLog(
  entry: Omit<ChatLogEntry, "id" | "timestamp" | "thumbs"> & {
    id?: string;
  },
): Promise<string> {
  const id = entry.id ?? randomUUID();
  const timestamp = new Date().toISOString();
  const date = todayDate();
  const { id: _omit, ...rest } = entry;
  const full: ChatLogEntry = {
    ...rest,
    id,
    timestamp,
    thumbs: null,
  };

  try {
    const entries = await readJson<ChatLogEntry[]>(logKey(date), []);
    entries.push(full);
    await writeJson(logKey(date), entries);
  } catch (err) {
    console.warn(`[chat-log] append failed (continuing):`, err);
  }

  return id;
}

/**
 * Update thumbs + feedback text cho entry theo id.
 * Trả true nếu tìm thấy entry + update OK.
 */
export async function updateChatThumbs(
  id: string,
  thumbs: "up" | "down",
  feedbackText?: string,
): Promise<boolean> {
  try {
    const date = todayDate();
    const entries = await readJson<ChatLogEntry[]>(logKey(date), []);
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    entries[idx].thumbs = thumbs;
    if (feedbackText !== undefined) entries[idx].feedback_text = feedbackText;
    await writeJson(logKey(date), entries);
    return true;
  } catch (err) {
    console.warn(`[chat-log] update thumbs failed:`, err);
    return false;
  }
}

/** Đếm số query của user hôm nay — cho rate limit check. */
export async function getUserDailyCount(userEmail: string): Promise<number> {
  const date = todayDate();
  const entries = await readJson<ChatLogEntry[]>(logKey(date), []);
  return entries.filter((e) => e.user_email === userEmail).length;
}

/** Đọc global quota counter — cho monitoring/alerting. */
export async function getDailyQuota(): Promise<DailyQuota> {
  const date = todayDate();
  return readJson<DailyQuota>(quotaKey(date), {
    count: 0,
    last_query_at: "",
  });
}

/** Tăng global quota counter + update last_query_at. */
export async function incrementDailyQuota(): Promise<void> {
  try {
    const date = todayDate();
    const current = await getDailyQuota();
    const next: DailyQuota = {
      count: current.count + 1,
      last_query_at: new Date().toISOString(),
    };
    await writeJson(quotaKey(date), next);

    // Warn khi >80% Gemini free tier (1500 RPD)
    if (next.count === GLOBAL_QUOTA_WARN_THRESHOLD) {
      console.warn(
        `[chat-log] Global daily quota hit ${GLOBAL_QUOTA_WARN_THRESHOLD} (80% of Gemini free tier 1500 RPD). Consider upgrade or fallback provider.`,
      );
    }
  } catch (err) {
    console.warn(`[chat-log] increment quota failed:`, err);
  }
}
