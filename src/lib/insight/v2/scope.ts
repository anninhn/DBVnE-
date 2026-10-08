/**
 * PHẠM VI TRẢ LỜI — code nói rõ phần nào của câu hỏi trả lời được, phần nào chưa.
 *
 * Vòng thử 1 (2026-10-09, bench/runs/2026-10-09-vong1): 7/12 câu bị BỎ IM LẶNG một vế
 * (xếp hạng, một tỉnh, vùng, so sánh hai nơi, quy đổi 34, "giảm bao nhiêu trong 20 năm",
 * khái niệm kho không có). Hệ thống không biết mình không trả lời. Nên:
 *  - ý định, nơi được nhắc, mốc thời gian: LUẬT trên chữ trong câu hỏi trước, model bổ sung;
 *  - ánh xạ ý định → họ giả thuyết bằng code;
 *  - mọi vế không làm được / không có dữ liệu được nói ra trong thẻ "phạm vi" (code viết, không AI).
 */

import { PROVINCES_63, REGIONS } from "../geo";

export type Intent = "quan_he" | "xep_hang" | "xu_huong" | "so_sanh" | "mot_noi" | "mo";

export const INTENT_LABEL: Record<Intent, string> = {
  quan_he: "quan hệ giữa các chỉ tiêu",
  xep_hang: "xếp hạng tỉnh (cao nhất / thấp nhất)",
  xu_huong: "xu hướng theo thời gian",
  so_sanh: "so sánh giữa các nơi",
  mot_noi: "số liệu của một tỉnh / vùng cụ thể",
  mo: "câu hỏi mở",
};

/** Họ đã có ở bậc hiện tại — ý định nào không có họ thì phải nói "chưa làm được" */
export const SUPPORTED_INTENTS: Intent[] = ["quan_he", "xu_huong", "mo"];

export interface Place {
  kind: "province" | "region";
  code: string;
  name: string;
}

export interface Timeframe {
  /** "N năm qua / gần đây" */
  window?: number;
  /** "năm 2024" */
  year?: number;
  /** "từ 2020" */
  fromYear?: number;
}

/** Bỏ dấu, chữ thường, giữ khoảng trắng — để so tên địa danh trong câu hỏi */
function fold(s: string): string {
  return ` ${s
    .replace(/[ĐđÐð]/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

// Cách gọi đời thường của vùng / tỉnh — bổ sung từ log khi gặp
const REGION_ALIASES: [string, string][] = [
  ["mien nui phia bac", "tdmnpb"],
  ["trung du mien nui", "tdmnpb"],
  ["tay bac", "tdmnpb"],
  ["dong bac", "tdmnpb"],
  ["dbsh", "dbsh"],
  ["dong bang bac bo", "dbsh"],
  ["mien trung", "btb-dhmt"],
  ["bac trung bo", "btb-dhmt"],
  ["duyen hai mien trung", "btb-dhmt"],
  ["nam trung bo", "btb-dhmt"],
  ["dbscl", "dbscl"],
  ["mien tay", "dbscl"],
  ["mien tay nam bo", "dbscl"],
];
const PROVINCE_ALIASES: [string, string][] = [
  ["tp hcm", "ho-chi-minh"],
  ["tphcm", "ho-chi-minh"],
  ["hcm", "ho-chi-minh"],
  ["sai gon", "ho-chi-minh"],
  ["ho chi minh", "ho-chi-minh"],
  ["hue", "hue"],
];

export function detectPlaces(question: string): Place[] {
  // Tên chính thức so CÓ DẤU — so không dấu thì "diễn biến" thành tỉnh Điện Biên (vòng 2, q11).
  // Bí danh viết tắt / đời thường mới so không dấu.
  const lower = ` ${question.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  const has = (name: string) => lower.includes(` ${name.normalize("NFC").toLowerCase()} `);
  const q = fold(question);
  const out = new Map<string, Place>();
  for (const r of REGIONS) if (has(r.name)) out.set(r.code, { kind: "region", code: r.code, name: r.name });
  for (const [a, code] of REGION_ALIASES) {
    if (q.includes(` ${a} `)) out.set(code, { kind: "region", code, name: REGIONS.find((r) => r.code === code)!.name });
  }
  for (const p of PROVINCES_63) {
    if (has(p.name) && ![...out.values()].some((r) => r.name.toLowerCase().includes(p.name.toLowerCase()))) {
      out.set(p.code, { kind: "province", code: p.code, name: p.name });
    }
  }
  for (const [a, code] of PROVINCE_ALIASES) {
    if (q.includes(` ${a} `)) out.set(code, { kind: "province", code, name: PROVINCES_63.find((p) => p.code === code)!.name });
  }
  return [...out.values()];
}

export function detectTimeframe(question: string): Timeframe {
  const t = question.toLowerCase();
  const tf: Timeframe = {};
  const w = t.match(/(\d+)\s*năm\s*(qua|gần đây|gần nhất|trở lại|vừa qua)/);
  if (w) tf.window = Number(w[1]);
  const from = t.match(/(?:từ|kể từ|sau)\s*(?:năm\s*)?((?:19|20)\d{2})/);
  if (from) tf.fromYear = Number(from[1]);
  const y = t.match(/năm\s*((?:19|20)\d{2})/);
  if (y && !from) tf.year = Number(y[1]);
  return tf;
}

/**
 * Ý định: LUẬT trước (chữ trong câu hỏi), ý định model trả chỉ bổ sung khi luật không
 * bắt được gì. Có thể nhiều ý định (vd q01: xếp hạng + quan hệ).
 */
export function detectIntents(question: string, nConcepts: number, places: Place[], modelIntents: string[] = []): Intent[] {
  const t = question.toLowerCase();
  const set = new Set<Intent>();
  if (/(tỉnh|địa phương|nơi|thành phố|vùng) nào.*\snhất|xếp hạng|đứng đầu|top \d+|hàng đầu/.test(t)) set.add("xep_hang");
  if (/so sánh|so với|hơn hay kém/.test(t) && places.length >= 2) set.add("so_sanh");
  if (places.length >= 2 && /\bvà\b/.test(t) && places.filter((p) => p.kind === "province").length >= 2) set.add("so_sanh");
  if (places.length >= 1) set.add("mot_noi");
  if (nConcepts >= 2 && /liên quan|tương quan|quan hệ|gắn với|đi kèm|có phải|thì .*(hơn|ít|nhiều)|ảnh hưởng/.test(t)) set.add("quan_he");
  if (/xu hướng(?! chung)|tăng|giảm|diễn biến|thay đổi|biến động|còn .* không|bao nhiêu .*năm|năm qua|gần đây/.test(t)) set.add("xu_huong");
  if (!set.size) {
    for (const m of modelIntents) if (m in INTENT_LABEL) set.add(m as Intent);
  }
  if (!set.size) set.add(nConcepts >= 2 ? "quan_he" : "mo");
  return [...set];
}

export interface Scope {
  /** Phần trả lời được — sẽ có thẻ */
  answered: string[];
  /** Phần CHƯA làm được ở bậc hiện tại — nêu lý do */
  notYet: string[];
  /** Khái niệm kho không có chỉ tiêu */
  missing: string[];
  /** Ghi chú khác (danh mục 63/34, chỉ tiêu đang dùng có phương án khác…) */
  notes: string[];
}

export function buildScope(args: {
  intents: Intent[];
  places: Place[];
  timeframe: Timeframe;
  scheme: "63" | "34" | null;
  missingConcepts: string[];
  ran: { relation: boolean; trend: boolean; window: boolean };
  dataScheme: string | null;
  measureNotes: string[];
  anyFinding: boolean;
}): Scope {
  const s: Scope = { answered: [], notYet: [], missing: [], notes: [] };
  for (const c of args.missingConcepts) s.missing.push(`Kho chưa có chỉ tiêu cho "${c}" — không thay bằng chỉ tiêu gần chữ khác nghĩa.`);

  if (args.ran.relation) s.answered.push("Quan hệ giữa hai chỉ tiêu trên các tỉnh, theo từng vùng.");
  const tfText = args.timeframe.window ? `trong ${args.timeframe.window} năm` : args.timeframe.fromYear ? `từ ${args.timeframe.fromYear}` : "";
  if (args.ran.trend) s.answered.push(`Diễn biến cả nước theo thời gian${args.ran.window ? `, kèm mức thay đổi ${tfText}` : ""}.`);
  if (args.intents.includes("quan_he") && !args.ran.relation) {
    s.notYet.push(args.missingConcepts.length ? "Quan hệ giữa các chỉ tiêu — thiếu dữ liệu một vế (xem dưới)." : "Quan hệ giữa các chỉ tiêu — không có năm chung hoặc chưa đủ tỉnh.");
  }
  if (args.intents.includes("xep_hang")) s.notYet.push(`Xếp hạng tỉnh — chưa có ở bản thử này.`);
  if (args.intents.includes("so_sanh")) s.notYet.push(`So sánh ${args.places.map((p) => p.name).join(" – ")} — chưa có ở bản thử này.`);
  else if (args.intents.includes("mot_noi") && args.places.length) {
    s.notYet.push(`Số liệu riêng của ${args.places.map((p) => p.name).join(", ")} — chưa có ở bản thử này; các thẻ dưới là số cả nước hoặc so giữa các tỉnh.`);
  }
  if (args.scheme === "34") {
    s.notes.push(`Câu hỏi theo danh mục 34 tỉnh mới; dữ liệu theo danh mục ${args.dataScheme ?? "63"} tỉnh cũ. Quy đổi sang 34 tỉnh chưa có ở bản thử này.`);
  }
  if (tfText && args.ran.trend && !args.ran.window) s.notYet.push(`Mức thay đổi ${tfText} — chuỗi không có năm mốc phù hợp.`);
  s.notes.push(...args.measureNotes);
  // Chỉ nói "không có phát hiện" khi đã chạy được phần được hỏi — đừng che lý do thật là "chưa làm được"
  if (!args.anyFinding && !s.missing.length && !s.notYet.length) s.notes.push("Không có phát hiện nào đủ chắc với các chỉ tiêu này.");
  return s;
}

/** Ý định → họ được chạy. Có vế chính không làm được thì xu hướng cả nước chỉ là bối cảnh. */
export function familiesFor(intents: Intent[], nConcepts: number, missing: number): { relation: boolean; trend: boolean; trendIsContext: boolean } {
  const relation = intents.includes("quan_he") && nConcepts >= 2 && missing === 0;
  const askedTrend = intents.includes("xu_huong") || intents.includes("mo");
  // Hỏi quan hệ mà thiếu một vế → không trả thẻ vế còn lại như thể là câu trả lời (q10 vòng 1)
  const trend = !(intents.includes("quan_he") && missing > 0);
  return { relation, trend, trendIsContext: !askedTrend };
}
