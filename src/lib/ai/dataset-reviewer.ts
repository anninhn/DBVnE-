import OpenAI from "openai";
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
  }[];
  questions: string[];
}

/**
 * Load system prompt từ file markdown (version-controlled).
 */
async function loadSystemPrompt(): Promise<string> {
  const promptPath = path.join(
    process.cwd(),
    "tools",
    "prompts",
    "dataset-reviewer-tabular.md"
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
 * Analyze file inspection → AIProposal (metadata + dictionary + questions).
 */
export async function analyzeDataset(
  inspection: FileInspection
): Promise<AIProposal> {
  const client = getAIClient();
  const systemPrompt = await loadSystemPrompt();

  // Trim inspection để tiết kiệm token — chỉ gửi stats + samples, không full rows
  const trimmedInspection = {
    format: inspection.format,
    filename: inspection.filename,
    rowCount: inspection.rowCount,
    columnCount: inspection.columnCount,
    sheetName: inspection.sheetName,
    columns: inspection.columns.map((c) => ({
      name: c.name,
      inferredType: c.inferredType,
      nullCount: c.nullCount,
      uniqueCount: c.uniqueCount,
      ...(c.min !== undefined && { min: c.min }),
      ...(c.max !== undefined && { max: c.max }),
      samples: c.samples,
    })),
    sampleRows: inspection.sampleRows,
    // Full-dataset stats (computed streaming qua toàn bộ file, không từ sample).
    // AI dùng cho description — vd: segments cho cột "tỉnh" cho biết dataset
    // phủ bao nhiêu tỉnh, không bị lừa bởi first rows (data có thể sort theo tỉnh).
    columnStats: inspection.columnStats,
    note: "sampleRows + columns[].samples lấy từ ĐẦU file — có thể không đại diện (data có thể sort theo tỉnh/năm). columnStats tính từ TOÀN BỘ dataset — dùng cho description/phân tích.",
  };

  const response = await client.chat.completions.create({
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
