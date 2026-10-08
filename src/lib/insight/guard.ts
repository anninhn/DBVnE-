/**
 * Rào chắn chạy trong `submit_card` — CODE, không phải prompt. Platform không kiểm
 * soát system prompt của client (Claude Code), nên quy tắc cứng phải nằm ở đây.
 *
 * Lát 1: kiểm cấu trúc thẻ + KHỚP SỐ (rào chắn quan trọng nhất: AI không được
 * viết con số nào không đến từ kết quả tool trong phiên).
 */

import type { Session } from "./session";

export interface InsightCard {
  kind: "insight";
  tieu_de: string;
  dang_pattern: string;
  vi_sao_dang_viet: string;
  so_lieu: { nhan: string; gia_tri: string; result_id: string }[];
  nguon: string[];
  luu_y: string;
  can_kiem_them: string;
}

export interface InsufficientCard {
  kind: "insufficient";
  de_tai: string;
  thieu: string[];
  gan_dung?: string;
  noi_co_the_lay?: string;
}

export type Card = InsightCard | InsufficientCard;

/** Hằng số được phép xuất hiện dù không có trong kết quả tool. */
const ALLOWED_CONSTANTS = new Set([63, 34]);

interface Token {
  text: string;
  value: number;
  decimals: number;
}

/**
 * Lấy số theo định dạng Việt: "1.234,5", "0,13", "−0,21", "2018". Số viết kiểu Anh
 * ("0.13") sẽ bị tách sai và không khớp → AI nhận lỗi và phải viết lại kiểu Việt.
 */
export function extractNumbers(text: string): Token[] {
  const out: Token[] = [];
  const re = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;
  // Bỏ mã kết quả "r_042" khỏi văn bản trước khi lấy số
  for (const m of text.replace(/r_\d+/g, " ").matchAll(re)) {
    const raw = m[0];
    const dec = raw.includes(",") ? raw.split(",")[1].length : 0;
    const value = Number(raw.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(value)) out.push({ text: raw, value, decimals: dec });
  }
  return out;
}

/**
 * So bằng trị tuyệt đối (thẻ có thể viết "giảm 0,21" cho độ dốc −0,21), sai số trong
 * phạm vi làm tròn. Số nguyên phải khớp CHÍNH XÁC — nếu cho ±0,5 thì "0" khớp mọi
 * số nhỏ như 0,0005.
 */
function matches(tok: Token, candidates: number[]): boolean {
  const tol = tok.decimals === 0 ? 1e-9 : 0.5 * 10 ** -tok.decimals + 1e-9;
  return candidates.some((c) => Math.abs(Math.abs(c) - tok.value) <= tol);
}

/** Số viết kiểu Anh ("0.6", "1.25") — dấu chấm theo sau KHÔNG phải đúng 3 chữ số. */
function englishDecimals(text: string): string[] {
  return [...text.replace(/r_\d+/g, " ").matchAll(/\d+\.\d+/g)]
    .map((m) => m[0])
    .filter((t) => !/^\d{1,3}(\.\d{3})+$/.test(t));
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function checkCard(card: unknown, s: Session): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!card || typeof card !== "object") return { ok: false, errors: ["Thẻ phải là object JSON."] };
  const c = card as Record<string, unknown>;

  const allNumbers = Object.values(s.results).flatMap((r) => r.numbers);

  if (c.kind === "insufficient") {
    if (!str(c.de_tai)) errors.push("Thiếu `de_tai`.");
    if (!Array.isArray(c.thieu) || c.thieu.length === 0) errors.push("`thieu` phải là danh sách thứ còn thiếu.");
    return { ok: errors.length === 0, errors };
  }
  if (c.kind !== "insight") return { ok: false, errors: ['`kind` phải là "insight" hoặc "insufficient".'] };

  for (const f of ["tieu_de", "dang_pattern", "vi_sao_dang_viet", "luu_y", "can_kiem_them"]) {
    if (!str(c[f]).trim()) errors.push(`Thiếu hoặc rỗng: \`${f}\`.`);
  }

  // Số liệu chính: mỗi dòng trích một result_id có thật, mọi số phải khớp CHÍNH kết quả đó.
  const items = Array.isArray(c.so_lieu) ? (c.so_lieu as Record<string, unknown>[]) : [];
  if (!items.length) errors.push("`so_lieu` phải có ít nhất một dòng {nhan, gia_tri, result_id}.");
  for (const [i, it] of items.entries()) {
    const rid = str(it.result_id);
    const res = s.results[rid];
    if (!res) {
      errors.push(`so_lieu[${i}]: result_id "${rid}" không có trong phiên.`);
      continue;
    }
    for (const t of englishDecimals(`${str(it.nhan)} ${str(it.gia_tri)}`)) {
      errors.push(`so_lieu[${i}]: "${t}" viết kiểu Anh — dùng dấu phẩy thập phân (0,6).`);
    }
    for (const tok of extractNumbers(`${str(it.nhan)} ${str(it.gia_tri)}`)) {
      if (ALLOWED_CONSTANTS.has(tok.value)) continue;
      if (!matches(tok, res.numbers)) {
        errors.push(`so_lieu[${i}]: "${tok.text}" không khớp số nào trong ${rid}. Chỉ chép số từ kết quả tool, viết kiểu Việt (0,13).`);
      }
    }
  }

  // Văn bản tự do: mọi số phải có trong kết quả tool của phiên.
  for (const f of ["tieu_de", "vi_sao_dang_viet", "luu_y", "can_kiem_them"]) {
    for (const t of englishDecimals(str(c[f]))) errors.push(`${f}: "${t}" viết kiểu Anh — dùng dấu phẩy thập phân.`);
    for (const tok of extractNumbers(str(c[f]))) {
      if (ALLOWED_CONSTANTS.has(tok.value)) continue;
      if (!matches(tok, allNumbers)) {
        errors.push(`${f}: số "${tok.text}" không có trong kết quả tool nào của phiên — không được tự tính hay tự viết số.`);
      }
    }
  }

  // Nguồn: slug phải là dataset thực sự đã đọc trong phiên.
  const used = new Set<string>(s.slugs);
  for (const r of Object.values(s.results)) {
    const a = r.args as Record<string, unknown> | undefined;
    for (const k of ["slug", "x", "y", "series"]) {
      const v = a?.[k] as Record<string, unknown> | string | undefined;
      if (typeof v === "string") used.add(v);
      else if (v && typeof v.slug === "string") used.add(v.slug);
    }
  }
  const sources = Array.isArray(c.nguon) ? (c.nguon as unknown[]).map(str) : [];
  if (!sources.length) errors.push("`nguon` phải liệt kê slug dataset đã dùng.");
  for (const src of sources) if (!used.has(src)) errors.push(`nguon: "${src}" không phải dataset đã đọc trong phiên.`);

  return { ok: errors.length === 0, errors };
}
