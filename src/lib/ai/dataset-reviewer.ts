import OpenAI, { APIError } from "openai";
import { readFile } from "fs/promises";
import path from "path";
import type { FileInspection } from "./inspect";

/**
 * AI client qua OpenAI-compatible endpoint.
 *
 * Config hiện tại: Gemini 2.5 Flash (free tier, 250 req/day).
 * Switch provider chỉ cần đổi 3 hằng số bên dưới.
 */

const AI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const AI_MODEL = "gemini-2.5-flash";
const AI_ENV_VAR = "GEMINI_API_KEY";

let _client: OpenAI | null = null;

export function getAIClient(): OpenAI {
  if (_client) return _client;

  const apiKey = process.env[AI_ENV_VAR];
  if (!apiKey) {
    throw new Error(`${AI_ENV_VAR} missing trong .env.local`);
  }

  _client = new OpenAI({
    apiKey,
    baseURL: AI_BASE_URL,
  });
  return _client;
}

export interface AIProposal {
  metadata: {
    title: string;
    description: string;
    category: string;
    tags: string[];
    source: string;
    source_url: string;
    confidence: "high" | "medium" | "low";
  };
  dictionary: {
    column: string;
    type: "string" | "number" | "date" | "boolean" | "category";
    unit: string;
    description: string;
    /** Frictionless Data Table Schema — optional, chỉ cho type: "number" */
    decimal_char?: "." | ",";
    /** Frictionless Data Table Schema — optional, chỉ cho type: "number" */
    group_char?: "." | "," | " ";
  }[];
  questions: string[];
}

/**
 * Load system prompt từ file markdown (version-controlled).
 *
 * Branch theo format: tabular (csv/xlsx) → tabular prompt, geojson → geojson prompt.
 * GeoJSON prompt có sections riêng (geometry vs properties, bbox coverage, source hints).
 */
async function loadSystemPrompt(format: string): Promise<string> {
  const promptFile =
    format === "geojson"
      ? "dataset-reviewer-geojson.md"
      : "dataset-reviewer-tabular.md";
  const promptPath = path.join(
    process.cwd(),
    "tools",
    "prompts",
    promptFile
  );
  return readFile(promptPath, "utf-8");
}

/**
 * Parse JSON từ LLM response — handle markdown wrapper nếu có.
 *
 * Throw error kèm raw content (truncated) nếu parse fail — giúp debug
 * trường hợp AI truncate giữa string do max_tokens quá thấp.
 */
function parseJSONResponse(content: string): unknown {
  let cleaned = content.trim();

  // Strip markdown code fence nếu AI wrap
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Log raw content để debug — thường là do max_tokens cắt giữa chuỗi
    const preview = cleaned.length > 300 ? cleaned.slice(0, 300) + "…[truncated]" : cleaned;
    console.error("[analyze] JSON parse fail. Raw content:", preview);
    throw new Error(
      `AI response không parse được JSON: ${err instanceof Error ? err.message : "unknown"}. ` +
      `Content length: ${cleaned.length} chars (có thể do max_tokens cắt giữa chuỗi). ` +
      `Preview: ${preview}`
    );
  }
}

/**
 * Wrap `client.chat.completions.create` với retry cho transient errors.
 *
 * Retry khi: 429 (rate limit), 500/502/503/504 (server overload), network errors.
 * Backoff: 1s → 2s → 4s + jitter (max 3 attempts, tổng tối đa ~7s chờ).
 *
 * Gemini free tier thường trả 503 khi capacity constraint → retry thường recover.
 */
async function callAIWithRetry(
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const MAX_ATTEMPTS = 3;
  const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await getAIClient().chat.completions.create(params);
    } catch (err) {
      lastErr = err;

      // OpenAI SDK ném APIError với status — check transient
      const status =
        err instanceof APIError ? err.status ?? 0 : 0;
      const isTransient =
        TRANSIENT_STATUS.has(status) ||
        // Network/timeout errors không có status → cũng retry
        !(err instanceof APIError);

      if (!isTransient || attempt === MAX_ATTEMPTS) {
        throw err;
      }

      // Exponential backoff + jitter (0-500ms)
      const baseMs = 1000 * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * 500);
      const waitMs = baseMs + jitter;
      console.warn(
        `[analyze] AI call attempt ${attempt}/${MAX_ATTEMPTS} failed (status=${status || "network"}). Retry in ${waitMs}ms...`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

/**
 * Analyze file inspection → AIProposal (metadata + dictionary + questions).
 *
 * Retry 3 lần với exponential backoff cho transient errors (429, 500, 502, 503, 504)
 * — Gemini free tier thường trả 503 khi capacity constraint, retry thường recover.
 */
export async function analyzeDataset(
  inspection: FileInspection
): Promise<AIProposal> {
  const systemPrompt = await loadSystemPrompt(inspection.format);

  // Trim inspection để tiết kiệm token — chỉ gửi stats + samples, không full rows.
  // GeoJSON inspection thêm feature_count + geometry_type + bbox + crs — prompt dùng
  // để suy luận phạm vi địa lý (coverage) + loại dataset từ geometry_type + properties.
  const trimmedInspection = {
    format: inspection.format,
    filename: inspection.filename,
    rowCount: inspection.rowCount,
    columnCount: inspection.columnCount,
    sheetName: inspection.sheetName,
    // GeoJSON-only — undefined cho tabular, JSON.stringify tự omit
    featureCount: inspection.featureCount,
    geometryType: inspection.geometryType,
    bbox: inspection.bbox,
    crs: inspection.crs,
    columns: inspection.columns.map((c) => ({
      name: c.name,
      inferredType: c.inferredType,
      nullCount: c.nullCount,
      uniqueCount: c.uniqueCount,
      ...(c.min !== undefined && { min: c.min }),
      ...(c.max !== undefined && { max: c.max }),
      samples: c.samples,
      // Frictionless schema detection — gợi ý cho AI declare decimal_char/group_char
      ...(c.decimalFormat && c.decimalFormat !== "unknown" && {
        decimalFormat: c.decimalFormat,
        decimalSchema: c.decimalSchema,
      }),
    })),
    sampleRows: inspection.sampleRows,
    // Full-dataset stats (computed streaming qua toàn bộ file, không từ sample).
    // AI dùng cho description — vd: segments cho cột "tỉnh" cho biết dataset
    // phủ bao nhiêu tỉnh, không bị lừa bởi first rows (data có thể sort theo tỉnh).
    columnStats: inspection.columnStats,
    note:
      inspection.format === "geojson"
        ? "GeoJSON: properties là tabular data embedded trong features. sampleRows lấy từ first 5 features — có thể không đại diện. columnStats tính từ TOÀN BỘ features (cap 10000). bbox + geometry_type dùng suy luận phạm vi địa lý + loại dataset."
        : "sampleRows + columns[].samples lấy từ ĐẦU file — có thể không đại diện (data có thể sort theo tỉnh/năm). columnStats tính từ TOÀN BỘ dataset — dùng cho description/phân tích.",
  };

  const response = await callAIWithRetry({
    model: AI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Phân tích dataset sau và đề xuất metadata + dictionary theo JSON schema đã nêu:\n\n${JSON.stringify(trimmedInspection, null, 2)}`,
      },
    ],
    temperature: 0.3, // thấp — muốn output deterministic, không sáng tạo
    max_tokens: 8000, // đủ chỗ cho metadata + dictionary đầy đủ (fix truncate)
    // Gemini OpenAI-compat: JSON mode → output luôn JSON hợp lệ
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("AI trả response rỗng");
  }

  const parsed = parseJSONResponse(content) as AIProposal;
  return parsed;
}
