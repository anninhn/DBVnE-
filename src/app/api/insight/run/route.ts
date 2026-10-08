import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

import { requireUserOr401 } from "@/lib/auth";
import { insightEnabled } from "@/lib/insight/local";
import { INSIGHT_SYSTEM_PROMPT, SUGGEST_SYSTEM_PROMPT } from "@/lib/insight/prompt";
import { createSession, INSIGHT_DATA_DIR, loadSession, withSession } from "@/lib/insight/session";
import { SUGGEST_TOOL_NAMES, TOOL_DEFS } from "@/lib/insight/tools";

/**
 * Chạy một lượt hỏi của harness insight (pilot, CHỈ local).
 *
 *   POST { mode: "suggest", question }                       → bước 1: đề xuất chỉ tiêu
 *   POST { mode: "analyze", sessionId, question, picks }     → bước 2: phân tích với chỉ tiêu
 *                                                              phóng viên đã xác nhận
 *   (không có mode: { sessionId?, question, slugs? } — phân tích thẳng, giữ cho tương thích)
 *   → stream NDJSON sự kiện
 *
 * Luồng: route spawn Claude Code headless (`claude -p`) trỏ vào GLM qua gói
 * subscription của Z.ai (Claude Code là tool được Z.ai hỗ trợ — app KHÔNG gọi
 * endpoint Coding bằng SDK). Claude Code dùng MCP server "insight"
 * (tools/insight-mcp.mjs) → các tool ở /api/insight/tools.
 *
 * Phiên nhiều lượt: lượt đầu `--session-id <id>`, các lượt sau `--resume <id>`;
 * cùng id đó là id phiên của harness (data/insight/sessions/<id>.json).
 *
 * Biến môi trường (.env.local):
 *   INSIGHT_LOCAL=1           bật pilot
 *   INSIGHT_ZAI_API_KEY       key của tài khoản có GLM Coding Plan
 *   INSIGHT_MODEL             mặc định glm-5.3
 *   INSIGHT_CLAUDE_BIN        đường dẫn claude, mặc định "claude" trên PATH
 */

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const MCP_SCRIPT = path.join(process.cwd(), "tools", "insight-mcp.mjs");
const CLAUDE_CONFIG_DIR = path.join(INSIGHT_DATA_DIR, "claude-config");
const WORK_DIR = path.join(INSIGHT_DATA_DIR, "workdir");

/** Cùng một tool + cùng tham số gọi lặp lại từng này lần → coi là kẹt vòng, dừng. */
const LOOP_LIMIT = 3;

/**
 * Không nhận được phản hồi nào từ model sau từng này giây → dừng. Đo 2026-10-08: key
 * sai thì `claude -p` không báo lỗi mà tự thử lại, treo > 150 giây.
 */
const FIRST_REPLY_TIMEOUT_MS = 90_000;

type Event = Record<string, unknown> & { type: string };

function short(s: string, n = 800): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export async function POST(req: NextRequest) {
  if (!insightEnabled()) return new NextResponse(null, { status: 404 });
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;
  const username = authCheck.user.username;

  const apiKey = process.env.INSIGHT_ZAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Thiếu INSIGHT_ZAI_API_KEY trong .env.local" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as {
    mode?: "suggest" | "analyze";
    sessionId?: string;
    question?: string;
    slugs?: string[];
    picks?: { ten: string; slug: string; measure: string }[];
  } | null;
  const mode = body?.mode;
  const picks = (body?.picks ?? []).filter((p) => p?.slug && p?.measure && p?.ten).slice(0, 4);
  if (mode === "analyze" && (!body?.sessionId || !picks.length)) {
    return NextResponse.json({ error: "Bước phân tích cần sessionId và chỉ tiêu đã chọn" }, { status: 400 });
  }
  const question = body?.question?.trim();
  if (!question) return NextResponse.json({ error: "Thiếu câu hỏi" }, { status: 400 });

  // Phiên: tạo mới hoặc nối tiếp (chỉ chủ phiên được nối tiếp)
  let sessionId = body?.sessionId;
  let firstTurn = false;
  if (sessionId) {
    const existing = await loadSession(sessionId);
    if (!existing || existing.user !== username) {
      return NextResponse.json({ error: "Phiên không tồn tại" }, { status: 404 });
    }
  } else {
    const s = await createSession(username, mode === "suggest" ? [] : (body?.slugs ?? []).slice(0, 5));
    sessionId = s.id;
    firstTurn = true;
  }
  const session = await withSession(sessionId, async (s) => {
    s.turn += 1;
    if (mode === "analyze") {
      // Phân tích CHỈ trên các chỉ tiêu phóng viên đã xác nhận
      s.confirmed = picks;
      s.slugs = [...new Set(picks.map((p) => p.slug))];
    }
    for (const slug of body?.slugs ?? []) if (!s.slugs.includes(slug)) s.slugs.push(slug);
    s.questions.push({ turn: s.turn, text: question, at: new Date().toISOString() });
    return s;
  });

  // Cấu hình MCP cho lượt này
  await fs.mkdir(CLAUDE_CONFIG_DIR, { recursive: true });
  await fs.mkdir(WORK_DIR, { recursive: true });
  const mcpConfigFile = path.join(INSIGHT_DATA_DIR, "sessions", `${session.id}.mcp.json`);
  await fs.writeFile(
    mcpConfigFile,
    JSON.stringify({
      mcpServers: {
        insight: {
          command: process.execPath,
          args: [MCP_SCRIPT],
          env: {
            INSIGHT_BASE_URL: req.nextUrl.origin,
            INSIGHT_SESSION: session.id,
            INSIGHT_TOKEN: session.token,
          },
        },
      },
    })
  );

  const userMessage =
    mode === "suggest"
      ? `Câu hỏi của phóng viên: ${question}`
      : [
          `Câu hỏi của phóng viên: ${question}`,
          picks.length
            ? `Chỉ tiêu phóng viên ĐÃ XÁC NHẬN (bắt buộc dùng đúng):\n${picks.map((p) => `- ${p.ten} → "${p.measure}" (dataset ${p.slug})`).join("\n")}`
            : body?.slugs?.length
              ? `Dataset phóng viên đã chọn (slug): ${body.slugs.join(", ")}`
              : "",
          session.turn > 1 && mode !== "analyze" ? `Đây là lượt hỏi tiếp thứ ${session.turn} trong phiên.` : "",
        ]
          .filter(Boolean)
          .join("\n");

  const toolNames =
    mode === "suggest"
      ? SUGGEST_TOOL_NAMES
      : TOOL_DEFS.map((t) => t.name).filter((n) => !SUGGEST_TOOL_NAMES.includes(n));
  const allowed = toolNames.map((n) => `mcp__insight__${n}`).join(",");
  const args = [
    "-p",
    userMessage,
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    process.env.INSIGHT_MODEL ?? "glm-5.3",
    "--system-prompt",
    mode === "suggest" ? SUGGEST_SYSTEM_PROMPT : INSIGHT_SYSTEM_PROMPT,
    "--mcp-config",
    mcpConfigFile,
    "--strict-mcp-config",
    "--tools",
    "", // tắt toàn bộ tool có sẵn của Claude Code (Bash, đọc/ghi file, web…)
    "--allowedTools",
    allowed,
    ...(firstTurn ? ["--session-id", session.id] : ["--resume", session.id]),
  ];

  // Môi trường tối thiểu: không truyền các bí mật khác của app (GitHub, R2…) cho CLI.
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    LANG: "en_US.UTF-8",
    CLAUDE_CONFIG_DIR, // thư mục riêng: không đọc CLAUDE.md / memory cá nhân
    ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
    ANTHROPIC_AUTH_TOKEN: apiKey,
    API_TIMEOUT_MS: "600000",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  } satisfies NodeJS.ProcessEnv;

  const child = spawn(process.env.INSIGHT_CLAUDE_BIN ?? "claude", args, {
    cwd: WORK_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (e: Event) => {
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      };
      const finish = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      send({ type: "session", sessionId: session.id, turn: session.turn });

      const calls = new Map<string, number>();
      let buf = "";
      let stderr = "";
      let gotReply = false;
      const watchdog = setTimeout(() => {
        if (gotReply) return;
        send({
          type: "error",
          message: `Không nhận được phản hồi từ model sau ${FIRST_REPLY_TIMEOUT_MS / 1000} giây — kiểm INSIGHT_ZAI_API_KEY (key của tài khoản có GLM Coding Plan) và kết nối mạng.`,
        });
        child.kill("SIGTERM");
      }, FIRST_REPLY_TIMEOUT_MS);

      child.stdout.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: Record<string, unknown>;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          handle(ev);
        }
      });
      child.stderr.on("data", (c: Buffer) => {
        stderr = (stderr + c.toString("utf8")).slice(-4000);
      });

      function handle(ev: Record<string, unknown>) {
        const msg = ev.message as { content?: Record<string, unknown>[] } | undefined;
        if (ev.type === "system" && ev.subtype === "init") {
          send({ type: "start", model: ev.model, mcp: ev.mcp_servers });
        } else if (ev.type === "assistant" && msg?.content) {
          gotReply = true;
          for (const block of msg.content) {
            if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
              send({ type: "text", text: block.text });
            } else if (block.type === "tool_use") {
              const name = String(block.name).replace(/^mcp__insight__/, "");
              const sig = `${name}:${JSON.stringify(block.input)}`;
              const n = (calls.get(sig) ?? 0) + 1;
              calls.set(sig, n);
              send({ type: "tool_call", id: block.id, name, input: block.input });
              if (n >= LOOP_LIMIT) {
                send({ type: "error", message: `Dừng: gọi lặp lại ${name} với cùng tham số ${n} lần (kẹt vòng).` });
                child.kill("SIGTERM");
              }
            }
          }
        } else if (ev.type === "user" && msg?.content) {
          for (const block of msg.content) {
            if (block.type !== "tool_result") continue;
            const content = block.content as string | { type: string; text?: string }[];
            const text = typeof content === "string" ? content : (content ?? []).map((c) => c.text ?? "").join("\n");
            send({ type: "tool_result", id: block.tool_use_id, ok: !block.is_error, text: short(text) });
          }
        } else if (ev.type === "result") {
          gotReply = true;
          send({
            type: "done",
            isError: ev.is_error,
            result: ev.result,
            durationMs: ev.duration_ms,
            turns: ev.num_turns,
            usage: ev.usage,
          });
        }
      }

      child.on("error", (err) => {
        send({ type: "error", message: `Không chạy được Claude Code: ${err.message}` });
        finish();
      });

      child.on("close", async (code) => {
        clearTimeout(watchdog);
        if (code !== 0 && code !== null) {
          send({ type: "error", message: `Claude Code thoát mã ${code}. ${short(stderr, 1500)}` });
        }
        // Thẻ + biểu đồ của lượt này, đọc từ phiên (nguồn sự thật là harness, không phải lời AI)
        const s = await loadSession(session.id);
        if (s && mode === "suggest") {
          send({ type: "suggestion", suggestion: s.suggestion ?? null });
        } else if (s) {
          send({ type: "cards", cards: s.cards.filter((c) => c.turn === s.turn) });
          send({
            type: "results",
            results: Object.values(s.results)
              .filter((r) => r.turn === s.turn)
              .map((r) => ({ id: r.id, tool: r.tool, args: r.args, summary: r.summary, chart: r.chart })),
          });
        }
        finish();
      });

      req.signal.addEventListener("abort", () => child.kill("SIGTERM"));
    },
    cancel() {
      child.kill("SIGTERM");
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
