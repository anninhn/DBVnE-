/**
 * Gọi model cho luồng chuẩn — mỗi lời gọi một tiến trình `claude -p` không tool,
 * trả JSON. Bậc 0 (2026-10-09) đo: khởi động chỉ ~1 giây, giữ tiến trình sống không
 * nhanh hơn rõ rệt → không dùng.
 *
 * Model: GLM qua gói subscription Z.ai, đi qua Claude Code (tool được hỗ trợ). App
 * KHÔNG gọi endpoint Coding bằng SDK. Chỉ chạy local.
 */

import { spawn } from "child_process";
import path from "path";
import { promises as fs } from "fs";
import { INSIGHT_DATA_DIR } from "../session";

const CLAUDE_CONFIG_DIR = path.join(INSIGHT_DATA_DIR, "claude-config");
const WORK_DIR = path.join(INSIGHT_DATA_DIR, "workdir");
const TIMEOUT_MS = 90_000;

export interface ModelCall<T> {
  data: T | null;
  text: string;
  ms: number;
  outputTokens?: number;
  error?: string;
}

/** Bóc JSON khỏi câu trả lời (model đôi khi bọc trong ```json — đo ở bậc 0: 1/6 lần). */
export function extractJSON<T>(text: string): T | null {
  const cleaned = text.replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export async function callModel<T>(system: string, prompt: string): Promise<ModelCall<T>> {
  const apiKey = process.env.INSIGHT_ZAI_API_KEY;
  if (!apiKey) return { data: null, text: "", ms: 0, error: "Thiếu INSIGHT_ZAI_API_KEY trong .env.local" };
  await fs.mkdir(CLAUDE_CONFIG_DIR, { recursive: true });
  await fs.mkdir(WORK_DIR, { recursive: true });

  const env = {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    LANG: "en_US.UTF-8",
    CLAUDE_CONFIG_DIR,
    ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
    ANTHROPIC_AUTH_TOKEN: apiKey,
    API_TIMEOUT_MS: "120000",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  } satisfies NodeJS.ProcessEnv;

  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--model",
    process.env.INSIGHT_MODEL ?? "glm-5.3",
    "--tools",
    "",
    "--system-prompt",
    system,
  ];

  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn(/*turbopackIgnore: true*/ process.env.INSIGHT_CLAUDE_BIN ?? "claude", args, {
      cwd: WORK_DIR,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
    child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (err = (err + d.toString("utf8")).slice(-2000)));
    child.on("close", () => {
      clearTimeout(timer);
      const ms = Date.now() - t0;
      let text = "";
      let outputTokens: number | undefined;
      try {
        const r = JSON.parse(out);
        text = String(r.result ?? "");
        outputTokens = r.usage?.output_tokens;
      } catch {
        return resolve({ data: null, text: out.slice(0, 500), ms, error: `Không đọc được kết quả model. ${err.slice(-300)}` });
      }
      resolve({ data: extractJSON<T>(text), text, ms, outputTokens });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ data: null, text: "", ms: Date.now() - t0, error: `Không chạy được Claude Code: ${e.message}` });
    });
  });
}
