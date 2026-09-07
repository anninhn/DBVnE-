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
import {
  buildCandidateBlock,
  buildFocusBlock,
  buildValueBlock,
} from "@/lib/chat/flatten-metadata";
import { extractDiscoveryJSON } from "@/lib/chat/extract-json";
import { getDatasetBySlug } from "@/lib/datasets/read";
import {
  findValuesInQuery,
  getDataset,
  searchDatasets,
  RetrievalIndexUnavailableError,
} from "@/lib/retrieval";
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

/**
 * Số ứng viên lấy từ tầng tra cứu TRƯỚC khi xếp lại theo giá trị.
 *
 * Lớn hơn `CANDIDATE_LIMIT` để khi câu hỏi nêu một địa danh, ta còn chỗ chọn ra
 * những dataset **vừa liên quan chủ đề vừa thật sự chứa địa danh đó**. Chỉ lấy 20
 * rồi lọc thì có câu hỏi lọc xong còn 2 ứng viên. Bể này không tốn thêm lượt gọi
 * mạng nào — `searchDatasets` xếp hạng trong memory, chỉ `getDataset` mới đọc
 * GitHub và nó vẫn chỉ đọc 20.
 */
const CANDIDATE_POOL = 60;

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
  /**
   * Mốc để đo TTFB — đặt ở ĐẦU handler, trước cả bước tra cứu.
   *
   * Đặt trong `ReadableStream.start()` là sai: lúc đó `searchDatasets`,
   * `findValuesInQuery` và `getDataset` đã chạy xong, nên con số ghi ra chỉ là
   * thời gian của model. Đo sai kiểu đó thì log báo 28/28 lượt dưới 4 giây
   * (median 1.624ms) trong khi đo từ phía client là 8/12 (median 3.832ms) —
   * tức là một tiêu chí "đạt" nhờ chỗ đặt đồng hồ.
   */
  const requestStart = Date.now();
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
  // Hai thông báo PHẢI khác nhau (FR-061). Chúng đòi hai hành động khác nhau:
  // hết hạn mức cá nhân thì người khác vẫn hỏi được và mình chờ sang ngày; hết
  // hạn mức hệ thống thì cả toà soạn đang bị chặn và việc cần làm là báo quản
  // trị. Gộp thành một câu "thử lại sau" là để người dùng chờ một thứ không tự
  // hết, và không ai biết đường nào mà lần.
  if (userCount >= RATE_LIMIT_PER_USER_PER_DAY) {
    return NextResponse.json(
      {
        error:
          `Bạn đã dùng hết ${RATE_LIMIT_PER_USER_PER_DAY} câu hỏi của mình hôm nay ` +
          `(hạn mức tính theo từng người, sang ngày mới sẽ được cấp lại). ` +
          `Đồng nghiệp khác vẫn hỏi được bình thường.`,
        quota: "user",
      },
      { status: 429 },
    );
  }
  if (globalQuota.count >= GLOBAL_QUOTA_HARD_LIMIT) {
    return NextResponse.json(
      {
        error:
          `Cả hệ thống đã dùng hết ${GLOBAL_QUOTA_HARD_LIMIT} câu hỏi trong ngày, ` +
          `nên hiện không ai hỏi được — không phải riêng bạn. ` +
          `Nếu cần dùng gấp, báo người quản trị để nâng hạn mức.`,
        quota: "global",
      },
      { status: 429 },
    );
  }

  // 4. Chọn ứng viên + load system prompt + build FOCUS block (nếu attached)
  let candidateBlock: string;
  let systemPrompt: string;
  let focusBlock = "";
  let valueBlock = "";
  try {
    const [search, valueHits, prompt] = await Promise.all([
      searchDatasets({ query: searchQuery, limit: CANDIDATE_POOL, caller: `chat:${userKey}` }),
      // Tra chỉ mục nghịch đảo xem câu hỏi có nêu giá trị nào thật có trong dữ
      // liệu. Đây là chỗ chữa lỗi nặng nhất của luồng cũ: câu "có dữ liệu gì về
      // Đà Nẵng" cho cosine cao nhất 0,613 nên tìm kiếm tương đồng coi như không
      // liên quan, và hệ thống trả lời "kho chưa có" về một giá trị có ở 176
      // dataset. Tra chỉ mục thì đúng/sai tuyệt đối, và 0 token.
      findValuesInQuery(searchQuery, `chat:${userKey}`),
      loadSystemPrompt(),
    ]);
    systemPrompt = prompt;

    // Xếp lại: dataset CHỨA giá trị tra được lên trước, giữ nguyên thứ tự liên
    // quan trong từng nhóm. Không thay hẳn danh sách bằng dataset chứa giá trị —
    // 176 dataset đều chứa "Đà Nẵng", nên nếu bỏ xếp hạng chủ đề thì câu "dữ liệu
    // KINH TẾ của Đà Nẵng" trả về 20 dataset ngẫu nhiên có Đà Nẵng.
    const valueSlugs = new Set(
      valueHits.matches.flatMap((m) => m.datasets.map((d) => d.slug)),
    );
    const ranked =
      valueSlugs.size > 0
        ? [
            ...search.results.filter((r) => valueSlugs.has(r.slug)),
            ...search.results.filter((r) => !valueSlugs.has(r.slug)),
          ]
        : search.results;
    const chosen = ranked.slice(0, CANDIDATE_LIMIT);
    valueBlock = buildValueBlock(valueHits.matches, valueHits.partialColumns.length);

    const detail = await getDataset({
      slugs: chosen.map((r) => r.slug),
      // Danh sách giá trị cột chỉ nạp cho dataset đang được hỏi thẳng (khối FOCUS).
      // Nạp cho cả 20 ứng viên là kéo hàng nghìn tên tỉnh vào ngữ cảnh, đúng thứ
      // vừa cắt đi.
      includeValues: false,
      caller: `chat:${userKey}`,
    });

    // Thứ tự của `searchDatasets` là thứ tự mức liên quan — `getDataset` không giữ
    // nó. Xếp lại theo slug, nếu không thì model đọc danh sách theo thứ tự ngẫu
    // nhiên và "dataset đầu bảng" mất hết ý nghĩa.
    const order = new Map(chosen.map((r, i) => [r.slug, i] as const));
    const ordered = [...detail.datasets].sort(
      (a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0),
    );

    candidateBlock = buildCandidateBlock(ordered, {
      total: search.total,
      valueSorted: valueSlugs.size > 0,
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
  // Khối giá trị đặt TRƯỚC danh sách ứng viên: nó là dữ kiện đúng/sai, còn danh
  // sách ứng viên là phỏng đoán theo mức liên quan. Model đọc tới đâu tin tới đó.
  const userContent = [
    `CÂU HỎI CỦA PHÓNG VIÊN:\n${query}`,
    focusBlock,
    valueBlock,
    candidateBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startTime = Date.now();
      let fullContent = "";
      // Mốc chữ đầu tiên — tính từ `requestStart` ở đầu handler, KHÔNG từ đây.
      let ttfbMs: number | null = null;

      try {
        // `extra_body` không có trong kiểu của SDK OpenAI (nó là đường truyền
        // tham số riêng của nhà cung cấp), nên phải cast một lần ở đây thay vì
        // rải `@ts-expect-error`. Xem chú thích `thinking_config` bên dưới.
        const params = {
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
          // 4000 vẫn chạm trần: đo thực tế câu "có dữ liệu gì về Đà Nẵng" bị cắt
          // giữa dòng. Nâng lên 8000 và siết prompt (answer 2–4 câu, tối đa 3
          // dataset) để bớt chạm; kèm nhánh cứu JSON cắt ở `extract-json.ts` vì
          // trần nào rồi cũng có câu chạm. Chỉ token ĐẦU RA mới tính tiền, và câu
          // trả lời thường dùng ~1.000 nên nâng trần không làm tăng chi phí thật.
          max_tokens: 8000,
          stream: true,
          /**
           * Tắt "thinking" của model.
           *
           * SC-012 đòi phóng viên thấy chữ đầu tiên trong 4 giây; đo thực tế
           * 2026-09-04 ra 6,6–10,0s — vượt 1,7 đến 2,7 lần. Ta chỉ chiếm
           * ~1,5–2,0s (gọi embedding), phần còn lại là model suy nghĩ trước khi
           * phát token đầu.
           *
           * Việc của model ở đây là **chọn dataset trong danh sách có sẵn rồi mô
           * tả**, không phải suy luận nhiều bước — mọi dữ kiện đã nằm trong ngữ
           * cảnh, kể cả kết quả tra chỉ mục giá trị. Con số đo được ghi ở commit
           * kèm theo.
           */
          extra_body: { google: { thinking_config: { thinking_budget: 0 } } },
          // Ép JSON ở tầng API, không chỉ nhờ system prompt.
          //
          // Lưu ý: nó KHÔNG chặn hẳn được văn xuôi. Đo lúc kiểm nhánh cắt, model
          // vẫn mở đầu bằng "Here is the JSON requested:\n```json" — nên
          // `extract-json.ts` vẫn phải giữ nhánh xử lý preamble và markdown fence.
          //
          // Comment cũ ở đây ghi "Gemini OpenAI compat chưa ổn định với stream +
          // json_object". Kiểm lại 2026-09-04 với SDK và model hiện tại: chạy tốt.
          // Và nó cần thiết từ khi có hội thoại nhiều lượt — đo thực tế: lượt 1 và
          // 2 trả JSON đúng, tới lượt 3 model chuyển sang văn xuôi, client parse
          // thất bại và hiện EmptyState dù nội dung câu trả lời hoàn toàn đúng.
          // Quy tắc trong prompt không đủ khi cuộc trò chuyện dài ra.
          response_format: { type: "json_object" },
        } as unknown as Parameters<
          ReturnType<typeof getAIClient>["chat"]["completions"]["create"]
        >[0] & { stream: true };

        const completion = await getAIClient().chat.completions.create(params);

        let finishReason: string | null = null;
        for await (const chunk of completion) {
          const choice = chunk.choices[0];
          const delta = choice?.delta?.content ?? "";
          if (delta) {
            if (ttfbMs === null) ttfbMs = Date.now() - requestStart;
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
            "[chat/discovery] stream bị cắt (chạm trần 8000 token). Client sẽ cứu " +
              "phần đọc được và hiện cảnh báo — không rơi về EmptyState nữa.",
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
          latency_ms: Date.now() - requestStart,
          ttfb_ms: ttfbMs ?? undefined,
          parse_ok: parsed !== null,
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
