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
  /**
   * `true` = JSON bị cắt giữa dòng (chạm trần token) và phần đọc được là phần cứu
   * lại. Caller PHẢI nói cho người dùng biết câu trả lời chưa hết.
   */
  truncated?: boolean;
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

  // Case 4: JSON bị CẮT giữa dòng — chạm trần token nên thiếu dấu đóng.
  //
  // Không có nhánh này thì một câu trả lời đã stream tới người dùng và đã đúng
  // nội dung lại bị thay bằng màn hình trống "Không tìm thấy dataset phù hợp".
  // Đó là cách hỏng tệ nhất: người đọc kết luận kho không có dữ liệu.
  return salvageTruncated(trimmed);
}

/** Giải mã escape trong chuỗi JSON — chỉ những dạng JSON cho phép. */
function unescape(text: string, i: number): [string, number] {
  const c = text[i];
  const simple: Record<string, string> = {
    n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/",
  };
  if (c === "u") {
    const hex = text.slice(i + 1, i + 5);
    if (/^[0-9a-fA-F]{4}$/.test(hex)) return [String.fromCharCode(parseInt(hex, 16)), i + 5];
    return ["", i + 1];
  }
  return [simple[c] ?? c, i + 1];
}

/** Đọc một chuỗi JSON từ vị trí sau dấu `"` mở, chấp nhận việc nó chưa đóng. */
function readJsonString(text: string, start: number): { value: string; closed: boolean; end: number } {
  let out = "";
  let i = start;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      const [ch, next] = unescape(text, i + 1);
      out += ch;
      i = next - 1;
      continue;
    }
    if (c === '"') return { value: out, closed: true, end: i + 1 };
    out += c;
  }
  return { value: out, closed: false, end: i };
}

/**
 * Cứu phần đọc được từ một JSON bị cắt.
 *
 * Lấy `answer` (kể cả khi chuỗi chưa đóng) và những phần tử `datasets[]` đã hoàn
 * chỉnh. Trả `truncated: true` để caller nói rõ là chưa hết — hiện phần cứu được
 * mà không nói gì thì người đọc tưởng đó là toàn bộ câu trả lời.
 */
function salvageTruncated(text: string): DiscoveryResponse | null {
  const m = /"answer"\s*:\s*"/.exec(text);
  if (!m) return null;

  const { value: answer } = readJsonString(text, m.index + m[0].length);
  if (!answer.trim()) return null;

  const datasets: DiscoveryDataset[] = [];
  const dm = /"datasets"\s*:\s*\[/.exec(text);
  if (dm) {
    // Quét từng object cân dấu ngoặc; dừng ở object đầu tiên chưa hoàn chỉnh.
    let i = dm.index + dm[0].length;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open === -1) break;
      let depth = 0;
      let end = -1;
      let inStr = false;
      for (let j = open; j < text.length; j++) {
        const c = text[j];
        if (inStr) {
          if (c === "\\") j++;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') inStr = true;
        else if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) { end = j + 1; break; }
        }
      }
      if (end === -1) break;
      const one = normalizeDataset(tryParse(text.slice(open, end)));
      if (one) datasets.push(one);
      i = end;
    }
  }

  const im = /"intent"\s*:\s*"(search|compute|both)"/.exec(text);
  return {
    answer,
    datasets,
    follow_ups: [],
    intent: normalizeIntent(im?.[1]),
    truncated: true,
  };
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
