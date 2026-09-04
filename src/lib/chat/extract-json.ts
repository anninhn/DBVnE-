/**
 * extractDiscoveryJSON — robust parse LLM output thành DiscoveryResponse.
 *
 * LLM (Gemini) thỉnh thoảng vi phạm "JSON-only" instruction và output:
 *   1. Markdown fence: ```json\n{...}\n```
 *   2. Conversational prefix + JSON: "Có dataset X phù hợp...\n{...}"
 *   3. JSON + suffix: "{...}\n\nHy vọng giúp ích!"
 *   4. Pure JSON (happy path)
 *
 * JSON.parse thuần chỉ xử lý case 4. Function này extract JSON object
 * cuối cùng trong text (greedy match first `{` → last `}`) để handle all cases.
 *
 * Spec 2026-07-24-discovery-chat.
 */

import { normalizeIntent, type QuestionIntent } from "./intent";

export interface DiscoveryDataset {
  slug: string;
  title?: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

export interface DiscoveryResponse {
  answer: string;
  datasets: DiscoveryDataset[];
  follow_ups: string[];
  /**
   * Câu hỏi thuộc loại nào — model tự phân loại theo quy tắc trong system prompt
   * (R8). Thiếu thì coi là `"search"`, xem `normalizeIntent`.
   */
  intent: QuestionIntent;
}

/**
 * Extract + parse DiscoveryResponse từ raw LLM text.
 *
 * @returns parsed response, hoặc null nếu không tìm thấy JSON hợp lệ.
 *          Caller xử lý null (render raw text fallback).
 */
export function extractDiscoveryJSON(text: string): DiscoveryResponse | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Case 1: markdown fence ```json ... ``` (hoặc ``` ... ```)
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    const parsed = tryParse(fenceMatch[1].trim());
    if (parsed) return normalized(parsed);
  }

  // Case 2: pure JSON
  const direct = tryParse(trimmed);
  if (direct) return normalized(direct);

  // Case 3: JSON embedded trong text (prefix/suffix).
  // Greedy: first `{` → last `}` để bắt được nested object hoàn chỉnh.
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = trimmed.slice(firstBrace, lastBrace + 1);
    const parsed = tryParse(slice);
    if (parsed) return normalized(parsed);
  }

  return null;
}

function tryParse(s: string): unknown | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Validate + coerce parsed object thành DiscoveryResponse shape.
 * Defensive: LLM có thể trả thiếu field hoặc sai type.
 */
function normalized(raw: unknown): DiscoveryResponse | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const answer = typeof obj.answer === "string" ? obj.answer : "";
  const datasets = Array.isArray(obj.datasets)
    ? obj.datasets
        .map((d) => normalizeDataset(d))
        .filter((d): d is DiscoveryDataset => d !== null)
    : [];
  const followUps = Array.isArray(obj.follow_ups)
    ? obj.follow_ups.filter((s): s is string => typeof s === "string")
    : [];

  // answer bắt buộc — thiếu thì coi như parse fail
  if (!answer) return null;

  return {
    answer,
    datasets,
    follow_ups: followUps.slice(0, 5),
    intent: normalizeIntent(obj.intent),
  };
}

function normalizeDataset(raw: unknown): DiscoveryDataset | null {
  if (typeof raw !== "object" || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.slug !== "string" || !d.slug) return null;

  const confidence = (
    typeof d.confidence === "string" ? d.confidence : "medium"
  ) as DiscoveryDataset["confidence"];
  return {
    slug: d.slug,
    title: typeof d.title === "string" ? d.title : undefined,
    reason: typeof d.reason === "string" ? d.reason : "",
    confidence:
      confidence === "high" || confidence === "low" ? confidence : "medium",
  };
}
