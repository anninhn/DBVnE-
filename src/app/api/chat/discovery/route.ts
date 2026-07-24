/**
 * Discovery Chat API — streaming JSON response từ Gemini qua OpenAI SDK.
 *
 * POST /api/chat/discovery
 *   body: { query: string }
 *   response: stream text (JSON tokens incremental)
 *   headers: X-Chat-Id — UUID để client update thumbs sau
 *
 * Spec 2026-07-24-discovery-chat.
 *
 * Flow:
 *   1. Auth check (requireUserOr401)
 *   2. Rate limit check (per-user 100/day)
 *   3. Flatten metadata tất cả datasets (cache 60s)
 *   4. Stream Gemini response → forward về client
 *   5. On complete: parse JSON + append R2 log + increment quota
 *
 * Streaming: OpenAI SDK v6 với stream:true trả async iterable ChatCompletionChunk.
 * Forward delta content về client qua ReadableStream. Client accumulate + parse JSON cuối.
 *
 * Response format JSON mode KHÔNG dùng cùng stream (Gemini OpenAI compat chưa ổn định
 * với stream + response_format) → rely vào system prompt để enforce JSON.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { requireUserOr401 } from "@/lib/auth";
import { getAIClient } from "@/lib/ai/dataset-reviewer";
import { flattenAllDatasets } from "@/lib/chat/flatten-metadata";
import { extractDiscoveryJSON } from "@/lib/chat/extract-json";
import {
  appendChatLog,
  getUserDailyCount,
  incrementDailyQuota,
  RATE_LIMIT_PER_USER_PER_DAY,
} from "@/lib/r2/chat-log";

// AI_MODEL phải match dataset-reviewer.ts — import trực tiếp không được (private const),
// duplicate hằng số ở đây + comment sync.
const AI_MODEL = "gemini-2.5-flash";

export const maxDuration = 60; // AI stream có thể mất 10-30s với catalog lớn

interface DiscoveryRequest {
  query: string;
}

async function loadSystemPrompt(): Promise<string> {
  const promptPath = path.join(
    process.cwd(),
    "tools",
    "prompts",
    "discovery-chat.md",
  );
  return readFile(promptPath, "utf-8");
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;
  const user = authCheck.user;
  const userEmail = user.email ?? "unknown";

  // 2. Parse body
  let body: DiscoveryRequest;
  try {
    body = (await req.json()) as DiscoveryRequest;
  } catch {
    return NextResponse.json(
      { error: "Body phải là JSON hợp lệ" },
      { status: 400 },
    );
  }

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json(
      { error: "Thiếu câu hỏi" },
      { status: 400 },
    );
  }

  if (query.length > 1000) {
    return NextResponse.json(
      { error: "Câu hỏi quá dài (tối đa 1000 ký tự)" },
      { status: 400 },
    );
  }

  // 3. Rate limit
  const userCount = await getUserDailyCount(userEmail);
  if (userCount >= RATE_LIMIT_PER_USER_PER_DAY) {
    return NextResponse.json(
      {
        error: `Bạn đã hỏi quá ${RATE_LIMIT_PER_USER_PER_DAY} câu hôm nay. Quay lại sau.`,
      },
      { status: 429 },
    );
  }

  // 4. Flatten metadata + load system prompt
  let flattened: string;
  let systemPrompt: string;
  try {
    [flattened, systemPrompt] = await Promise.all([
      flattenAllDatasets(),
      loadSystemPrompt(),
    ]);
  } catch (err) {
    console.error("[chat/discovery] context prep failed:", err);
    return NextResponse.json(
      { error: "Tạm không tải được danh sách dataset. Thử lại sau." },
      { status: 500 },
    );
  }

  // 5. Stream response — generate chatId upfront để expose qua header
  const chatId = randomUUID();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startTime = Date.now();
      let fullContent = "";

      try {
        const completion = await getAIClient().chat.completions.create({
          model: AI_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `CÂU HỎI CỦA PHÓNG VIÊN:\n${query}\n\n\nDANH SÁCH DATASET:\n${flattened}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 2000,
          stream: true,
          // KHÔNG dùng response_format json_object — Gemini OpenAI compat chưa ổn định
          // với stream + json_object. Rely vào system prompt để enforce JSON output.
        });

        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            fullContent += delta;
            controller.enqueue(encoder.encode(delta));
          }
        }

        // 6. Parse JSON cuối + log — robust extractor handle conversational
        // text + JSON pattern (LLM thỉnh thoảng vi phạm JSON-only rule).
        let datasetsCited: string[] = [];
        let answerSummary = "";
        const parsed = extractDiscoveryJSON(fullContent);
        if (parsed) {
          datasetsCited = parsed.datasets.map((d) => d.slug);
          answerSummary = parsed.answer.slice(0, 200);
        } else {
          answerSummary = fullContent.slice(0, 200);
          console.warn(
            "[chat/discovery] JSON parse fail. Raw:",
            fullContent.slice(0, 300),
          );
        }

        await appendChatLog({
          id: chatId,
          user_email: userEmail,
          query,
          answer_summary: answerSummary,
          datasets_cited: datasetsCited,
          latency_ms: Date.now() - startTime,
        });
        await incrementDailyQuota();
      } catch (err) {
        console.error("[chat/discovery] AI stream failed:", err);
        // Emit error JSON để client parse + render error state.
        // Shape khớp DiscoveryResponse (extract-json.ts) — KHÔNG dùng satisfies
        // vì type đã removed locally (imported type không thể dùng trong satisfies
        // expression của object literal ở vị trí này).
        const errorJson = JSON.stringify({
          answer:
            "Tạm không trả lời được. Thử lại sau ít phút — có thể AI đang quá tải.",
          datasets: [],
          follow_ups: [],
        });
        controller.enqueue(encoder.encode(errorJson));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Chat-Id": chatId,
    },
  });
}
