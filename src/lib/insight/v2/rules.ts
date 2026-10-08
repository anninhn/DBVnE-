/**
 * MỘT bộ luật, hai bên dùng (THIET-KE-V6 mục 15, bài học 3): mỗi luật khai một lần ở
 * đây → sinh phần hướng dẫn trong prompt VÀ làm bộ kiểm bằng code. Sửa một chỗ thì
 * AI lẫn code cùng đổi — tránh lỗi "luật chỉ có ở một lời nhắc" đã gặp khi thử XLSX.
 */

// ── Ngưỡng thống kê ──────────────────────────────────────────────────────────

/** Một vùng chỉ được kết luận khi đủ tỉnh */
export const MIN_PER_REGION = 8;
/** Quan hệ "rõ": |r| ≥ ngưỡng và q (sau BH) ≤ ngưỡng */
export const MIN_ABS_R = 0.3;
export const MAX_Q = 0.1;
/** Vùng "không theo quy luật": |r| dưới ngưỡng này trong khi cả nước có quan hệ rõ */
export const NULL_ABS_R = 0.2;

// ── Diễn giải bằng tiếng Việt thường (mẫu câu do code sinh) ──────────────────

export function describeR(r: number): string {
  const a = Math.abs(r);
  const dir = r < 0 ? "ngược chiều" : "cùng chiều";
  if (a < NULL_ABS_R) return "gần như không có quan hệ";
  if (a < MIN_ABS_R) return `quan hệ ${dir} yếu`;
  if (a < 0.6) return `quan hệ ${dir} mức vừa`;
  return `quan hệ ${dir} chặt`;
}

/**
 * Đo 2026-10-09: cách nói cũ "khó do ngẫu nhiên" bị AI đọc NGƯỢC thành "khó loại trừ
 * yếu tố ngẫu nhiên". Dùng cách nói không nhập nhằng.
 */
export function describeQ(q: number | null): string {
  if (q === null) return "chưa đủ tỉnh để kiểm định";
  if (q <= 0.05) return "ít khả năng chỉ là ngẫu nhiên";
  if (q <= MAX_Q) return "khá ít khả năng chỉ là ngẫu nhiên";
  return "có thể chỉ là ngẫu nhiên";
}

/** Số kiểu Việt: dấu phẩy thập phân, dấu chấm hàng nghìn, dấu trừ thật. */
export function fmtVN(v: number, maxFrac = 2): string {
  const s = v.toLocaleString("vi-VN", { maximumFractionDigits: maxFrac, minimumFractionDigits: 0 });
  return s.replace(/^-/, "−");
}

// ── Câu chữ ──────────────────────────────────────────────────────────────────

/** Từ chỉ nhân quả — dữ liệu tương quan không cho phép */
export const CAUSAL_WORDS = ["khiến", "làm tăng", "làm giảm", "dẫn đến", "gây ra", "nhờ", "do đó", "vì vậy", "nguyên nhân"];
/** Từ nói về cá nhân / hộ — dữ liệu cấp tỉnh không cho phép */
export const INDIVIDUAL_WORDS = ["người dân", "mỗi gia đình", "các gia đình", "hộ gia đình", "người giàu", "người nghèo", "cặp vợ chồng"];
/** Từ so sánh nhất — chỉ được dùng khi có phát hiện xếp hạng tương ứng */
export const SUPERLATIVE_WORDS = ["cao nhất", "thấp nhất", "nhiều nhất", "ít nhất", "đứng đầu", "đứng cuối", "nhanh nhất", "chậm nhất", "kỷ lục"];

/** Phần luật câu chữ chèn vào prompt — sinh từ CHÍNH các danh sách trên. */
export function writingRulesForPrompt(): string {
  return [
    "- KHÔNG viết bất kỳ chữ số nào. Mọi con số phải là chỗ trống dạng {ten_cho_trong} lấy từ danh sách được cho; code sẽ điền số.",
    `- Không dùng từ chỉ nhân quả: ${CAUSAL_WORDS.map((w) => `"${w}"`).join(", ")}. Dữ liệu chỉ cho thấy tương quan.`,
    `- Dữ liệu cấp tỉnh: nói về TỈNH, không nói về cá nhân hay hộ (${INDIVIDUAL_WORDS.map((w) => `"${w}"`).join(", ")}).`,
    `- Chỉ dùng từ so sánh nhất (${SUPERLATIVE_WORDS.map((w) => `"${w}"`).join(", ")}) khi phát hiện ghi rõ là kỷ lục / xếp hạng.`,
  ].join("\n");
}

function hasWord(text: string, w: string): boolean {
  return text.toLowerCase().includes(w);
}

/**
 * Kiểm văn do AI viết (TRƯỚC khi điền số). Trả danh sách vi phạm; rỗng = đạt.
 * `allowedSlots`: các chỗ trống hợp lệ. `allowSuperlative`: có phát hiện kỷ lục/xếp hạng.
 */
export function checkProse(
  text: string,
  opts: { allowedSlots: Set<string>; allowSuperlative: boolean; provinceLevel: boolean }
): string[] {
  const v: string[] = [];
  const withoutSlots = text.replace(/\{[a-z0-9_.]+\}/gi, " ");
  if (/\d/.test(withoutSlots)) v.push("có chữ số viết thẳng — phải dùng chỗ trống");
  for (const m of text.matchAll(/\{([a-z0-9_.]+)\}/gi)) {
    if (!opts.allowedSlots.has(m[1])) v.push(`chỗ trống lạ {${m[1]}}`);
  }
  for (const w of CAUSAL_WORDS) if (hasWord(text, w)) v.push(`từ nhân quả "${w}"`);
  if (opts.provinceLevel) for (const w of INDIVIDUAL_WORDS) if (hasWord(text, w)) v.push(`nói về cá nhân "${w}"`);
  if (!opts.allowSuperlative) for (const w of SUPERLATIVE_WORDS) if (hasWord(text, w)) v.push(`từ so sánh nhất "${w}" không có phát hiện xếp hạng`);
  return v;
}

/** Điền chỗ trống bằng số đã định dạng. Chỗ trống không có giá trị → giữ nguyên để lộ lỗi. */
export function fillSlots(text: string, slots: Record<string, string>): string {
  return text.replace(/\{([a-z0-9_.]+)\}/gi, (m, k) => slots[k] ?? m);
}

// ── Khái niệm đo được ────────────────────────────────────────────────────────

/**
 * Từ KHÔNG phải chỉ tiêu đo được — model hay tách nhầm thành khái niệm (bậc 0: 4/4 lần
 * có "vùng", "tương quan"…). Code loại chúng sau khi model trả về.
 */
export const NON_MEASURE_WORDS = [
  "vùng", "tỉnh", "địa phương", "cả nước", "việt nam", "khu vực", "miền",
  "tương quan", "quan hệ", "liên quan", "so sánh", "khác biệt", "khác nhau", "xu hướng", "thay đổi",
];

export function isMeasurableConcept(c: string): boolean {
  const k = c.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
  if (!k) return false;
  if (NON_MEASURE_WORDS.includes(k)) return false;
  // "quan hệ thu nhập - mức sinh", "khác biệt vùng", "so sánh các tỉnh" — phép phân tích, không phải chỉ tiêu
  return !/^(quan hệ|tương quan|liên quan|so sánh|khác biệt|khác nhau|xu hướng)(\s|$)/.test(k) && !k.includes("tương quan");
}

/** Danh mục tỉnh theo chữ trong câu hỏi — luật, không để model đoán. */
export function schemeFromQuestion(q: string): "63" | "34" | null {
  const t = q.toLowerCase();
  if (/34 tỉnh|sau sáp nhập|tỉnh mới/.test(t)) return "34";
  if (/63 tỉnh|trước sáp nhập|tỉnh cũ/.test(t)) return "63";
  return null;
}

/** Đơn vị dùng được để in ra — dictionary đôi khi ghi chữ "unknown". */
export function cleanUnit(u?: string | null): string | null {
  if (!u) return null;
  const t = u.trim();
  return /^(unknown|không rõ|n\/a|na|-|)$/i.test(t) ? null : t;
}

/**
 * Kỷ lục "đã được chờ đợi" — không phải phát hiện. Chuỗi tăng ở ≥ 80% số năm thì đỉnh
 * mới là bình thường (vd thu nhập theo giá hiện hành); tương tự chuỗi giảm đều thì đáy
 * mới. Đo 2026-10-09: không có luật này, "thu nhập cao nhất kể từ 2018" thành một thẻ.
 */
export const EXPECTED_TREND_SHARE = 0.8;
export function isExpectedRecord(values: number[], record: "cao nhất" | "thấp nhất"): boolean {
  if (values.length < 3) return false;
  let up = 0;
  let down = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) up++;
    else if (values[i] < values[i - 1]) down++;
  }
  const steps = values.length - 1;
  return record === "cao nhất" ? up / steps >= EXPECTED_TREND_SHARE : down / steps >= EXPECTED_TREND_SHARE;
}
