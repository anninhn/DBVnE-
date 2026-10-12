/**
 * Kiểm bản trả lời — dùng CHUNG cho tool `check_answer` và Stop hook của Claude Code
 * (tools/insight-stop-hook.mjs). Hook là gate cứng: chạy lại đúng hàm này trên câu trả lời
 * cuối, đối chiếu với kết quả tool có trong transcript.
 *
 * Luật (lấy từ bậc 1, rules.ts + guard.ts):
 *  1. Mọi con số phải có trong kết quả tool (hoặc trong câu hỏi) — sai số trong phạm vi làm tròn,
 *     nhận "1,2 triệu" ↔ 1.234.567. Số viết kiểu Anh ("0.13") bị bắt.
 *  2. Câu có số liệu không dùng từ nhân quả, lời bình, so sánh nhất (trừ khi có kết quả xếp hạng /
 *     kỷ lục / ngoại lệ), không nói về cá nhân khi số là tương quan giữa các tỉnh.
 *  3. Câu nói "tăng"/"giảm" giữa hai mốc của cùng một chuỗi phải đúng chiều thật.
 *  4. Có số thì phải có dòng nguồn.
 */

import { extractNumbers } from "../guard";
import { CAUSAL_WORDS, DOWN_WORDS, EDITORIAL_WORDS, INDIVIDUAL_WORDS, SUPERLATIVE_WORDS, UP_WORDS } from "../v2/rules";

/** Hằng số được phép dù không có trong kết quả (số tỉnh theo hai danh mục) */
const ALLOWED = new Set([63, 34]);
const SCALE: Record<string, number> = { nghìn: 1e3, ngàn: 1e3, triệu: 1e6, tỷ: 1e9, tỉ: 1e9 };

export interface ToolResultForCheck {
  op: string;
  data: unknown;
}

export interface CheckOutcome {
  ok: boolean;
  errors: string[];
  so_con_so_da_kiem: number;
}

function numbersIn(v: unknown, out: number[] = []): number[] {
  if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  else if (typeof v === "string") for (const t of extractNumbers(v)) out.push(t.value);
  else if (Array.isArray(v)) v.forEach((x) => numbersIn(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => numbersIn(x, out));
  return out;
}

/** Chuỗi (năm → giá trị) có trong kết quả: `chuoi`, cặp `tu`/`den` */
function seriesIn(v: unknown, out: Map<number, number>[] = []): Map<number, number>[] {
  if (Array.isArray(v)) {
    const pts = v.filter((x) => x && typeof x === "object" && "nam" in x && "gia_tri" in x) as { nam: number; gia_tri: number }[];
    if (pts.length >= 2 && pts.length === v.length) out.push(new Map(pts.map((p) => [p.nam, p.gia_tri])));
    else v.forEach((x) => seriesIn(x, out));
  } else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const tu = o.tu as { nam?: number; gia_tri?: number } | undefined;
    const den = o.den as { nam?: number; gia_tri?: number } | undefined;
    if (tu?.nam !== undefined && den?.nam !== undefined && tu.gia_tri !== undefined && den.gia_tri !== undefined) {
      out.push(new Map([[tu.nam, tu.gia_tri], [den.nam, den.gia_tri]]));
    }
    Object.values(o).forEach((x) => seriesIn(x, out));
  }
  return out;
}

interface Tok {
  text: string;
  value: number;
  decimals: number;
  scale: number;
  index: number;
}

function tokens(text: string): Tok[] {
  const out: Tok[] = [];
  const re = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const after = text.slice(m.index! + raw.length, m.index! + raw.length + 8).trim().toLowerCase();
    const word = Object.keys(SCALE).find((w) => after.startsWith(w) && !/[\p{L}]/u.test(after.charAt(w.length)));
    out.push({
      text: raw,
      value: Number(raw.replace(/\./g, "").replace(",", ".")),
      decimals: raw.includes(",") ? raw.split(",")[1].length : 0,
      scale: word ? SCALE[word] : 1,
      index: m.index!,
    });
  }
  return out;
}

function matchesAny(t: Tok, cands: number[]): boolean {
  // "9.544 nghìn người": 9.544 có thể là số trần (đơn vị của chỉ tiêu là nghìn người) hoặc 9.544.000
  const at = (scale: number) => {
    const v = t.value * scale;
    const tol = (t.decimals === 0 && scale === 1 ? 1e-9 : 0.5 * 10 ** -t.decimals * scale) + 1e-9;
    return cands.some((c) => Math.abs(Math.abs(c) - v) <= tol);
  };
  return at(1) || (t.scale !== 1 && at(t.scale));
}

function englishDecimals(text: string): string[] {
  return [...text.matchAll(/\d+\.\d+/g)].map((m) => m[0]).filter((t) => !/^\d{1,3}(\.\d{3})+$/.test(t));
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.;!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/** Bỏ đường dẫn, mã id, slug — không phải số liệu */
function strip(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\b[a-z0-9]+(?:-[a-z0-9]+){2,}\b/g, " ") // slug
    .replace(/\bm\d{5}\b/g, " ") // id chỉ tiêu
    .replace(/\br\d+\b/g, " ") // id kết quả
    .replace(/[\p{L}]+-?\d+(?:[.,]\d+)?(?:[\p{L}]+\d*)*/gu, " "); // mã: PM2.5, CO2, COVID-19, H5N1
}

export function checkAnswer(answer: string, results: ToolResultForCheck[], question = ""): CheckOutcome {
  const errors: string[] = [];
  const text = strip(answer);
  const cands = [...results.flatMap((r) => numbersIn(r.data)), ...extractNumbers(question).map((t) => t.value)];
  const series = results.flatMap((r) => seriesIn(r.data));
  const ops = new Set(results.map((r) => r.op));
  const superOk = ["rank", "outlier", "compare"].some((o) => ops.has(o)) || results.some((r) => r.op === "trend" && (r.data as { ky_luc?: unknown })?.ky_luc);
  const provinceCorr = ops.has("relation");

  for (const t of englishDecimals(text)) errors.push(`"${t}" viết kiểu Anh — dùng dấu phẩy thập phân, dấu chấm phân cách nghìn (1.234,5).`);
  const body = text.replace(/\d+\.\d+/g, (m) => (/^\d{1,3}(\.\d{3})+$/.test(m) ? m : " "));

  let checked = 0;
  let dataChecked = 0;
  for (const s of sentences(body)) {
    const toks = tokens(s);
    if (!toks.length) continue;
    const low = s.toLowerCase();
    const qNums = extractNumbers(question).map((t) => t.value);
    const dataToks = toks.filter((t) => !(t.decimals === 0 && t.scale === 1 && t.value >= 1900 && t.value <= 2100) && !qNums.includes(t.value));
    for (const t of toks) {
      if (t.scale === 1 && ALLOWED.has(t.value)) continue;
      checked++;
      if (!matchesAny(t, cands)) errors.push(`Số "${t.text}${t.scale !== 1 ? " " + Object.keys(SCALE).find((k) => SCALE[k] === t.scale) : ""}" không có trong kết quả tool nào: "${s.slice(0, 120)}". Gọi compute để có số, hoặc bỏ số. Số đếm nhỏ (vd năm tỉnh) viết bằng chữ.`);
    }
    dataChecked += dataToks.length;
    if (!dataToks.length) continue;
    if (/(^|[\s,])(bởi )?vì(?! sao)[\s,]/.test(low)) errors.push(`Câu có số liệu dùng từ nhân quả "vì": "${s.slice(0, 120)}". Dữ liệu chỉ cho thấy đi cùng nhau.`);
    for (const w of CAUSAL_WORDS) if (low.includes(w)) errors.push(`Câu có số liệu dùng từ nhân quả "${w}": "${s.slice(0, 120)}". Dữ liệu chỉ cho thấy đi cùng nhau.`);
    for (const w of EDITORIAL_WORDS) if (low.includes(w)) errors.push(`Câu có số liệu dùng lời bình "${w}": "${s.slice(0, 120)}".`);
    if (!superOk) for (const w of SUPERLATIVE_WORDS) if (low.includes(w)) errors.push(`Từ so sánh nhất "${w}" nhưng chưa có kết quả rank / outlier / kỷ lục: "${s.slice(0, 120)}".`);
    if (provinceCorr) for (const w of INDIVIDUAL_WORDS) if (low.includes(w)) errors.push(`Tương quan giữa các tỉnh không nói về cá nhân ("${w}"): "${s.slice(0, 120)}".`);

    // Chiều tăng / giảm giữa hai mốc của cùng một chuỗi (theo thứ tự xuất hiện trong câu)
    const up = UP_WORDS.some((w) => low.includes(w));
    const down = DOWN_WORDS.some((w) => low.includes(w));
    // Chỉ xét câu đúng hai mốc số liệu — câu kể nhiều đoạn ("lên 2,69 rồi xuống 2,34") không quy được về một cặp
    if (up !== down && dataToks.length === 2) {
      for (const m of series) {
        const hits = toks.flatMap((t) => [...m.entries()].filter(([, v]) => matchesAny(t, [v])).map(([y]) => ({ y, t })));
        const years = [...new Set(hits.map((h) => h.y))];
        if (years.length !== 2) continue;
        const [a, b] = hits.sort((x, y) => x.t.index - y.t.index).filter((h, i, arr) => arr.findIndex((q) => q.y === h.y) === i);
        if (!a || !b) continue;
        const [from, to] = a.y < b.y ? [a.y, b.y] : [b.y, a.y];
        const real = m.get(to)! - m.get(from)!;
        if (up && real < 0) errors.push(`Câu nói tăng nhưng số thực giảm từ ${from} đến ${to}: "${s.slice(0, 120)}".`);
        if (down && real > 0) errors.push(`Câu nói giảm nhưng số thực tăng từ ${from} đến ${to}: "${s.slice(0, 120)}".`);
        break;
      }
    }
  }
  if (dataChecked && !/nguồn/i.test(answer)) errors.push("Câu trả lời có số liệu nhưng không có dòng nguồn (nơi phát hành + dataset).");
  return { ok: errors.length === 0, errors: [...new Set(errors)], so_con_so_da_kiem: checked };
}
