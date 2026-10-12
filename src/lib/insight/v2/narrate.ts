/**
 * AI 3 · Viết lời — văn có CHỖ TRỐNG, code điền số (poka-yoke: lỗi sai số không thể
 * xảy ra). Kiểm câu chữ bằng luật dùng chung; vi phạm → sửa 1 lần; vẫn sai → dùng
 * mẫu câu do code sinh. Không bao giờ chặn người hỏi.
 */

import { callModel } from "./llm";
import { checkProse, fillSlots, writingRulesForPrompt } from "./rules";
import type { Finding } from "./analyze";

export interface Card {
  findingId: string;
  title: string;
  text: string;
  /** "ai" = model viết, qua kiểm; "mau" = dùng mẫu câu của code */
  writtenBy: "ai" | "mau";
  violations: string[];
}

const SYSTEM = "Bạn là biên tập viên dữ liệu của báo VnExpress. Chỉ trả JSON hợp lệ.";

function prompt(question: string, findings: Finding[], feedback?: string) {
  const items = findings.map((f) => ({
    id: f.id,
    loai: f.familyLabel,
    y_chinh: f.points,
    cho_trong: f.slotMeaning,
  }));
  return `Câu hỏi của phóng viên: "${question}"
Viết cho MỖI phát hiện: một tít (≤ 16 từ) và một đoạn 2–3 câu, tiếng Việt báo chí, dễ hiểu với người không học thống kê.
Luật bắt buộc:
${writingRulesForPrompt()}
- Chỉ dùng chỗ trống có trong "cho_trong" của đúng phát hiện đó, viết dạng {ten}.
${feedback ? `\nLần trước vi phạm, sửa lại:\n${feedback}\n` : ""}
Trả: {"the": [{"id": "...", "tieu_de": "...", "doan": "..."}]}
${JSON.stringify(items)}`;
}

export async function narrate(question: string, findings: Finding[], provinceLevel: boolean): Promise<{ cards: Card[]; ms: number }> {
  const t0 = Date.now();
  type Out = { the?: { id: string; tieu_de: string; doan: string }[] };
  const check = (f: Finding, title: string, text: string) => {
    const v = checkProse(`${title}\n${text}`, {
      allowedSlots: new Set(Object.keys(f.slots)),
      allowSuperlative: f.allowSuperlative,
      provinceLevel,
      directions: f.directions,
      requiredSlots: f.requiredSlots,
    });
    const low = `${title}\n${text}`.toLowerCase();
    for (const w of f.offTopic ?? []) if (low.includes(w.toLowerCase())) v.push(`lạc đề: không được nói "${w}" trong thẻ này`);
    return v;
  };

  // Mỗi thẻ một lời gọi, chạy SONG SONG — thời gian bằng thẻ chậm nhất (đo 2026-10-09:
  // viết 3 thẻ trong một lời gọi mất tới 25 giây).
  const one = async (f: Finding): Promise<Card> => {
    let res = await callModel<Out>(SYSTEM, prompt(question, [f]));
    let w = res.data?.the?.find((t) => t.id === f.id) ?? res.data?.the?.[0];
    let v = w ? check(f, w.tieu_de, w.doan) : ["thiếu thẻ"];
    if (v.length) {
      res = await callModel<Out>(SYSTEM, prompt(question, [f], `- ${f.id}: ${v.join("; ")}`));
      w = res.data?.the?.find((t) => t.id === f.id) ?? res.data?.the?.[0];
      v = w ? check(f, w.tieu_de, w.doan) : ["thiếu thẻ"];
    }
    if (w && !v.length) {
      return { findingId: f.id, title: fillSlots(w.tieu_de, f.slots, f.unit), text: fillSlots(w.doan, f.slots, f.unit), writtenBy: "ai", violations: [] };
    }
    return { findingId: f.id, title: fillSlots(f.templateTitle, f.slots, f.unit), text: fillSlots(f.templateText, f.slots, f.unit), writtenBy: "mau", violations: v };
  };
  const cards = await Promise.all(findings.map(one));
  return { cards, ms: Date.now() - t0 };
}
