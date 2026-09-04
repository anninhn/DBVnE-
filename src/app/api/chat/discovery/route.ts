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
 *   2. Rate limit check (per-user/ngày)
 *   3. `searchDatasets` chọn top-K ứng viên → `getDataset` lấy mô tả của chúng
 *   4. Stream AI response → forward về client
 *   5. On complete: parse JSON + append R2 log + increment quota
 *
 * Bước 3 là thay đổi của spec 005: trước đây nạp TOÀN BỘ kho vào mỗi câu hỏi
 * (~200.000 token, hơn 1.000 lượt gọi GitHub API ở 495 dataset). Chi phí đó tăng
 * tuyến tính theo số dataset — tức là hệ thống tự đặt hạn sử dụng cho chính nó.
 *
 * Streaming: OpenAI SDK v6 với stream:true trả async iterable ChatCompletionChunk.
 * Forward delta content về client qua ReadableStream. Client accumulate + parse JSON cuối.
 *
 * JSON được ép ở tầng API bằng `response_format: json_object` (kiểm lại 2026-09-04:
 * dùng được cùng stream), system prompt chỉ mô tả schema.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { requireUserOr401 } from "@/lib/auth";
import { getAIClient } from "@/lib/ai/dataset-reviewer";
import { buildCandidateBlock, buildFocusBlock } from "@/lib/chat/flatten-metadata";
import { extractDiscoveryJSON } from "@/lib/chat/extract-json";
import { getDatasetBySlug } from "@/lib/datasets/read";
import { getDataset, searchDatasets, RetrievalIndexUnavailableError } from "@/lib/retrieval";
import { WEAK_RELEVANCE_CEILING } from "@/lib/retrieval/fuse";
import {
  appendChatLog,
  getDailyQuota,
  getUserDailyCount,
  GLOBAL_QUOTA_HARD_LIMIT,
  incrementDailyQuota,
  RATE_LIMIT_PER_USER_PER_DAY,
} from "@/lib/r2/chat-log";

// AI_MODEL phải match dataset-reviewer.ts — import trực tiếp không được (private const),
// duplicate hằng số ở đây + comment sync.
const AI_MODEL = "gemini-2.5-flash";

export const maxDuration = 60; // AI stream có thể mất 10-30s

/**
 * Số dataset ứng viên đưa vào ngữ cảnh.
 *
 * 20 theo quyết định đã chốt ở spec § Clarifications: gấp 2–3 lần số đáp án đúng
 * thường gặp (2–8), và ~8.000 token nên vẫn dưới ngưỡng 15.000 của SC-001. Tăng số
 * này là tăng chi phí mọi câu hỏi để đổi lấy những ứng viên mà chính tầng tra cứu
 * đã xếp là kém liên quan nhất.
 */
const CANDIDATE_LIMIT = 20;

/** Một lượt đã xảy ra trong cuộc trò chuyện — client giữ và gửi lại. */
interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

interface DiscoveryRequest {
  query: string;
  /** Optional slug dataset user đã attach (ChatGPT-style chip). */
  attachedSlug?: string;
  /**
   * Các lượt trước của cùng cuộc trò chuyện, cũ → mới (FR-044).
   *
   * Client giữ lịch sử, không phải server: mỗi cuộc trò chuyện thuộc về một tab
   * của một người, và lưu server nghĩa là phải quyết định khi nào hết hạn, ai
   * được đọc, xoá lúc nào — cả một vòng đời cho thứ mà `localStorage` làm xong.
   */
  history?: HistoryTurn[];
}

/**
 * Số lượt lịch sử giữ lại.
 *
 * Đủ để hiểu câu hỏi rút gọn ("còn năm 2023 thì sao"), và có trần để một cuộc trò
 * chuyện dài không âm thầm đẩy chi phí mỗi câu hỏi vượt ngưỡng SC-001 — chi phí
 * tăng dần theo độ dài cuộc trò chuyện là kiểu vượt ngưỡng không ai để ý.
 */
const MAX_HISTORY_TURNS = 6;

async function loadSystemPrompt(): Promise<string> {
  const promptPath = path.join(
    process.cwd(),
    "tools",
    "prompts",
    "discovery-chat.md",
  );
  return readFile(promptPath, "utf-8");
}

/**
 * Đưa một lượt trả lời cũ về đúng dạng JSON.
 *
 * Model học khuôn từ các lượt trước trong cùng cuộc trò chuyện. Nếu lượt trợ lý cũ
 * là văn xuôi thì nó kết luận cuộc này nói bằng văn xuôi và bỏ luôn quy tắc
 * chỉ-trả-JSON — đo thực tế: lượt 1 trả JSON đúng, lượt 2 trả văn xuôi và client
 * parse thất bại, hiện ra EmptyState dù câu trả lời hoàn toàn đúng nội dung.
 *
 * Bọc ở đây chứ không bắt client gửi đúng dạng: client nào gửi sai cũng không được
 * phép làm sập cuộc trò chuyện.
 */
function asJsonTurn(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) return trimmed;
  return JSON.stringify({ answer: trimmed, datasets: [], follow_ups: [] });
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;
  const user = authCheck.user;
  // Khoá rate-limit + attribution log. PHẢI là `username`, không phải `email`:
  // authorize() chỉ trả {id, username, displayName, role} và không callback nào
  // set email → `user.email ?? "unknown"` khiến MỌI user rơi vào cùng khoá
  // "unknown". Hệ quả: hạn mức 100/ngày thành hạn mức chung cho cả toà soạn,
  // và chat log mất hoàn toàn dấu vết ai hỏi gì.
  const userKey = user.username || user.email || "unknown";

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

  const attachedSlug = body.attachedSlug?.trim() || undefined;

  const history = (body.history ?? [])
    .filter(
      (t): t is HistoryTurn =>
        !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string",
    )
    .slice(-MAX_HISTORY_TURNS);

  /**
   * Câu dùng để TÌM dataset.
   *
   * Câu hỏi rút gọn ("còn năm 2023 thì sao") tự nó không mang chủ đề nào, nên đem
   * đi tìm thì ra kết quả vô nghĩa. Ghép câu hỏi người dùng gần nhất vào để phần
   * tìm kiếm hiểu được nó đang nói về cái gì (FR-044).
   *
   * Chỉ ghép MỘT lượt và câu hỏi hiện tại luôn đứng trước: đó là chỗ giữ FR-045 —
   * lịch sử để **hiểu** câu hỏi, không để **giới hạn** phạm vi. Ghép cả cuộc trò
   * chuyện thì lượt 3 đổi chủ đề vẫn bị kéo về chủ đề của lượt 1, đúng cái bẫy mà
   * SC-010 kiểm.
   */
  const lastUserQuery = [...history].reverse().find((t) => t.role === "user")?.content;
  const searchQuery = lastUserQuery ? `${query}\n${lastUserQuery}` : query;

  // 3. Rate limit — per-user + global (Gemini free tier guard)
  const [userCount, globalQuota] = await Promise.all([
    getUserDailyCount(userKey),
    getDailyQuota(),
  ]);
  if (userCount >= RATE_LIMIT_PER_USER_PER_DAY) {
    return NextResponse.json(
      {
        error: `Bạn đã hỏi quá ${RATE_LIMIT_PER_USER_PER_DAY} câu hôm nay. Quay lại sau.`,
      },
      { status: 429 },
    );
  }
  if (globalQuota.count >= GLOBAL_QUOTA_HARD_LIMIT) {
    return NextResponse.json(
      {
        error: "Hệ thống đã đạt giới hạn câu hỏi trong ngày. Vui lòng thử lại vào ngày mai.",
      },
      { status: 429 },
    );
  }

  // 4. Chọn ứng viên + load system prompt + build FOCUS block (nếu attached)
  let candidateBlock: string;
  let systemPrompt: string;
  let focusBlock = "";
  try {
    const [search, prompt] = await Promise.all([
      searchDatasets({ query: searchQuery, limit: CANDIDATE_LIMIT, caller: `chat:${userKey}` }),
      loadSystemPrompt(),
    ]);
    systemPrompt = prompt;

    const detail = await getDataset({
      slugs: search.results.map((r) => r.slug),
      // Danh sách giá trị cột chỉ nạp cho dataset đang được hỏi thẳng (khối FOCUS).
      // Nạp cho cả 20 ứng viên là kéo hàng nghìn tên tỉnh vào ngữ cảnh, đúng thứ
      // vừa cắt đi.
      includeValues: false,
      caller: `chat:${userKey}`,
    });

    // Thứ tự của `searchDatasets` là thứ tự mức liên quan — `getDataset` không giữ
    // nó. Xếp lại theo slug, nếu không thì model đọc danh sách theo thứ tự ngẫu
    // nhiên và "dataset đầu bảng" mất hết ý nghĩa.
    const order = new Map(search.results.map((r, i) => [r.slug, i] as const));
    const ordered = [...detail.datasets].sort(
      (a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0),
    );

    const best = search.results[0]?.semanticScore ?? 0;
    candidateBlock = buildCandidateBlock(ordered, {
      total: search.total,
      weakRelevance: search.results.length > 0 && best < WEAK_RELEVANCE_CEILING,
    });

    // FOCUS block — metadata + dictionary + danh sách giá trị cột của dataset attach.
    // Dùng `getDatasetBySlug` chứ KHÔNG `getDatasetDetail`: bản detail tải cả file
    // về để dựng preview, mà từ nay khối FOCUS không dùng dữ liệu mẫu nữa — tải
    // file chỉ để vứt đi là bắt phóng viên chờ thêm vài giây mỗi câu hỏi.
    // Silent fallback: slug invalid/deleted → focusBlock rỗng → flow như không attach.
    if (attachedSlug) {
      const [dataset, detail] = await Promise.all([
        getDatasetBySlug(attachedSlug),
        getDataset({ slugs: [attachedSlug], caller: `chat:${userKey}` }),
      ]);
      if (dataset) {
        focusBlock = buildFocusBlock(dataset, detail.datasets[0]?.columns);
      } else {
        console.warn(`[chat/discovery] attachedSlug "${attachedSlug}" not found — ignoring attach`);
      }
    }
  } catch (err) {
    // Chỉ mục chưa dựng là chuyện KHÁC với "không tìm thấy dataset nào". Nói rõ ra
    // và chỉ đúng cách chữa — trả lời "chưa có dataset phù hợp" lúc này là nói sai
    // về cả kho dữ liệu.
    if (err instanceof RetrievalIndexUnavailableError) {
      console.error("[chat/discovery] chỉ mục tra cứu chưa sẵn sàng:", err);
      return NextResponse.json(
        {
          error:
            "Chỉ mục tìm kiếm chưa sẵn sàng nên chưa trả lời được. " +
            "Người quản trị cần chạy tools/build-retrieval-index.mjs --apply.",
        },
        { status: 503 },
      );
    }
    console.error("[chat/discovery] context prep failed:", err);
    return NextResponse.json(
      { error: "Tạm không tải được danh sách dataset. Thử lại sau." },
      { status: 500 },
    );
  }

  // 5. Stream response — generate chatId upfront để expose qua header
  const chatId = randomUUID();
  const encoder = new TextEncoder();

  // Kích thước ngữ cảnh gửi cho model — thứ mà SC-001 đặt trần. Trả qua header để
  // đo được mà không phải dựng thêm công cụ: chi phí mỗi câu hỏi là con số dễ trôi
  // đi nhất khi sửa prompt, và trôi thì không ai thấy cho tới lúc hết hạn mức.
  const userContent = focusBlock
    ? `CÂU HỎI CỦA PHÓNG VIÊN:\n${query}\n\n${focusBlock}\n\n${candidateBlock}`
    : `CÂU HỎI CỦA PHÓNG VIÊN:\n${query}\n\n${candidateBlock}`;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startTime = Date.now();
      let fullContent = "";

      try {
        const completion = await getAIClient().chat.completions.create({
          model: AI_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            // Lịch sử đi vào đúng chỗ của nó — các lượt trước, không nhồi vào câu
            // hỏi hiện tại. Nhồi vào thì model không phân biệt được đâu là câu
            // đang hỏi và đâu là chuyện cũ.
            ...history.map((t) => ({
              role: t.role,
              content: t.role === "assistant" ? asJsonTurn(t.content) : t.content,
            }) as const),
            {
              role: "user",
              content: userContent,
            },
          ],
          temperature: 0.3,
          // 4000 tokens cho headroom khi LLM liệt kê 4+ datasets (bài Đà Nẵng
          // cut tại entry #4 với max_tokens=2000 → JSON parse fail → EmptyState).
          max_tokens: 4000,
          stream: true,
          // Ép JSON ở tầng API, không chỉ nhờ system prompt.
          //
          // Comment cũ ở đây ghi "Gemini OpenAI compat chưa ổn định với stream +
          // json_object". Kiểm lại 2026-09-04 với SDK và model hiện tại: chạy tốt.
          // Và nó cần thiết từ khi có hội thoại nhiều lượt — đo thực tế: lượt 1 và
          // 2 trả JSON đúng, tới lượt 3 model chuyển sang văn xuôi, client parse
          // thất bại và hiện EmptyState dù nội dung câu trả lời hoàn toàn đúng.
          // Quy tắc trong prompt không đủ khi cuộc trò chuyện dài ra.
          response_format: { type: "json_object" },
        });

        let finishReason: string | null = null;
        for await (const chunk of completion) {
          const choice = chunk.choices[0];
          const delta = choice?.delta?.content ?? "";
          if (delta) {
            fullContent += delta;
            controller.enqueue(encoder.encode(delta));
          }
          if (choice?.finish_reason) {
            finishReason = choice.finish_reason;
          }
        }

        // Phát hiện stream bị cắt do max_tokens — JSON không đóng → parse fail
        // → fallback datasets: [] → EmptyState dù LLM đã planned datasets.
        if (finishReason === "length") {
          console.warn(
            "[chat/discovery] stream truncated (max_tokens=4000 hit). " +
              "Answer likely incomplete — JSON parse may fail → EmptyState.",
          );
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
          user_email: userKey,
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
      "X-Context-Chars": String(systemPrompt.length + userContent.length),
    },
  });
}
