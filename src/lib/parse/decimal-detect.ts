/**
 * Auto-detect decimal format per-column — majority vote từ sample cells.
 *
 * Phục vụ Frictionless Data approach: AI đề xuất decimal_char/group_char
 * từ dữ liệu thực, user xác nhận trong wizard.
 *
 * Patterns:
 *   vi full   : /^\d{1,3}(\.\d{3})+,\d+$/      → "1.234.567,89"  (đích accuracy cao)
 *   vi simple : /^\d+,\d{1,2}$/                → "1234,56"
 *   en full   : /^\d{1,3}(,\d{3})+\.\d+$/      → "1,234,567.89"
 *   en simple : /^\d+\.\d+$/                   → "1234.56"
 *   integer   : /^\d+$/                        → "1234"
 *
 * Ambiguous (skip, không count):
 *   - "1,234"  → có thể EN thousand (1234) hoặc vi decimal (1.234)
 *   - "1.234"  → có thể EN decimal (1.234) hoặc vi thousand (1234)
 */

export type DecimalFormat = "vi" | "en" | "unknown";

export interface DecimalDetectionResult {
  format: DecimalFormat;
  /** Số cell match strong signal / tổng non-null sample */
  confidence: number;
  /** Schema đề xuất (decimal_char + group_char) nếu format !== "unknown" */
  schema?: {
    decimal_char: "." | ",";
    group_char: "." | ",";
  };
}

// Patterns strong signal (unambiguous)
const PATTERNS = {
  viFull: /^\d{1,3}(\.\d{3})+,\d+$/, // 1.234.567,89
  viSimple: /^\d+,\d{1,2}$/, // 1234,56
  enFull: /^\d{1,3}(,\d{3})+\.\d+$/, // 1,234,567.89
  enSimple: /^\d+\.\d{1,2}$/, // 1234.56 (giới hạn 2 decimal để avoid false positive)
  enLongDecimal: /^\d+\.\d{3,}$/, // 1234.567 (3+ decimal — chắc EN)
  integer: /^\d+$/, // 1234
};

/**
 * Detect decimal format từ sample values.
 *
 * @param samples array các cell value (đã strip null/empty)
 * @param minConfidence ngưỡng tối thiểu để declare format (mặc định 0.5)
 * @returns "vi" | "en" | "unknown" + schema đề xuất
 */
export function detectDecimalFormat(
  samples: string[],
  minConfidence = 0.5
): DecimalDetectionResult {
  if (samples.length === 0) {
    return { format: "unknown", confidence: 0 };
  }

  let viScore = 0;
  let enScore = 0;
  let totalSignal = 0;

  for (const raw of samples) {
    const s = String(raw).trim();
    if (!s) continue;

    // Skip ambiguous patterns
    // "1,234" (có thể EN thousand hoặc vi decimal)
    if (/^\d{1,3},\d{3}$/.test(s)) continue;
    // "1.234" (có thể EN decimal hoặc vi thousand)
    if (/^\d{1,3}\.\d{3}$/.test(s)) continue;

    if (PATTERNS.viFull.test(s)) {
      viScore += 2;
      totalSignal += 2;
    } else if (PATTERNS.enFull.test(s)) {
      enScore += 2;
      totalSignal += 2;
    } else if (PATTERNS.viSimple.test(s)) {
      viScore += 1;
      totalSignal += 1;
    } else if (PATTERNS.enSimple.test(s)) {
      enScore += 1;
      totalSignal += 1;
    } else if (PATTERNS.enLongDecimal.test(s)) {
      enScore += 1;
      totalSignal += 1;
    }
    // integer + không match → không count
  }

  if (totalSignal === 0) {
    return { format: "unknown", confidence: 0 };
  }

  const totalSamples = samples.length;
  const confidence = totalSignal / totalSamples;

  // Đảm bảo confidence đủ cao + clear winner
  if (confidence < minConfidence) {
    return { format: "unknown", confidence };
  }

  if (viScore > enScore) {
    return {
      format: "vi",
      confidence,
      schema: { decimal_char: ",", group_char: "." },
    };
  }

  if (enScore > viScore) {
    return {
      format: "en",
      confidence,
      schema: { decimal_char: ".", group_char: "," },
    };
  }

  // Tie → unknown
  return { format: "unknown", confidence };
}
