/**
 * AI 1 · Hiểu câu hỏi — GỌI HAI LẦN SONG SONG + LUẬT HẬU KIỂM (THIET-KE-V6 mục 15).
 *
 * Bậc 0 đo: cùng câu hỏi, model định tuyến lệch 2/4 lần và 4/4 lần tách ra "khái
 * niệm" không đo được ("vùng", "tương quan"). Nên:
 *  - model CHỈ tách khái niệm + cấp địa lý;
 *  - code loại khái niệm không đo được, quyết danh mục 63/34 theo chữ trong câu hỏi,
 *    và quyết luồng theo luật (≥ 1 khái niệm đo được → luồng chuẩn);
 *  - hai lần gọi được so: khác nhau thì ghi lại (thang xác minh), dùng hợp của hai.
 */

import { callModel } from "./llm";
import { isMeasurableConcept, schemeFromQuestion } from "./rules";
import { detectIntents, detectPlaces, detectTimeframe, type Intent, type Place, type Timeframe } from "./scope";

export interface Understanding {
  concepts: string[];
  level: "province" | "nation";
  scheme: "63" | "34" | null;
  route: "chuan" | "hoi_lai";
  askBack?: string;
  agreement: "khop" | "lech";
  /** Ý định, nơi được nhắc, mốc thời gian — luật trước, model bổ sung (scope.ts) */
  intents: Intent[];
  places: Place[];
  timeframe: Timeframe;
  raw: unknown[];
  ms: number;
}

interface ModelOut {
  khai_niem?: string[];
  cap?: string;
  y_dinh?: string[];
}

const SYSTEM = "Bạn phân tích câu hỏi của phóng viên về số liệu. Chỉ trả JSON hợp lệ, không giải thích.";

const PROMPT_A = (q: string) => `Tách câu hỏi thành các CHỈ TIÊU đo được bằng số (vd "thu nhập", "mức sinh", "số bác sĩ"). KHÔNG đưa vào: địa danh, "vùng", "tỉnh", "tương quan", "so sánh", "xu hướng" — đó là cách phân tích, không phải chỉ tiêu. Xác định cấp địa lý: "province" nếu so giữa các tỉnh/vùng, "nation" nếu chỉ nói cả nước.
Xác định ý định (một hoặc nhiều): quan_he (quan hệ giữa chỉ tiêu), xep_hang (tỉnh nào cao/thấp nhất), xu_huong (thay đổi theo thời gian), so_sanh (so các nơi cụ thể), mot_noi (một tỉnh/vùng cụ thể), mo (hỏi chung chung).
Trả: {"khai_niem": [...], "cap": "province|nation", "y_dinh": [...]}
Câu hỏi: "${q}"`;

const PROMPT_B = (q: string) => `Câu hỏi dưới đây cần những chỉ tiêu thống kê nào? Liệt kê tên chỉ tiêu ngắn gọn bằng chữ của phóng viên — chỉ những thứ đếm/đo được, bỏ mọi từ chỉ địa lý hay phép phân tích. Câu hỏi so sánh giữa các địa phương thì cap = "province", chỉ nói tổng thể cả nước thì cap = "nation".
JSON: {"khai_niem": [...], "cap": "..."}
"${q}"`;

function norm(c: string): string {
  return c.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

export async function understand(question: string): Promise<Understanding> {
  const t0 = Date.now();
  const [a, b] = await Promise.all([
    callModel<ModelOut>(SYSTEM, PROMPT_A(question)),
    callModel<ModelOut>(SYSTEM, PROMPT_B(question)),
  ]);
  const clean = (o: ModelOut | null) => [...new Set((o?.khai_niem ?? []).map(norm).filter(isMeasurableConcept))];
  const ca = clean(a.data);
  const cb = clean(b.data);
  // Khớp khi mỗi khái niệm của lần này trùng nghĩa với một khái niệm của lần kia
  const match = (x: string[], y: string[]) => x.every((c) => y.some((k) => k.includes(c) || c.includes(k)));
  const agreement = ca.length > 0 && match(ca, cb) && match(cb, ca) ? "khop" : "lech";
  // Gộp hai lần: ưu tiên lần A; khái niệm của B chỉ thêm khi KHÔNG trùng nghĩa với cái đã có.
  // Đo 2026-10-09: A trả "thu nhập", B trả "thu nhập bình quân" — cùng một khái niệm.
  const overlaps = (x: string, y: string) => x.includes(y) || y.includes(x);
  const concepts: string[] = [...ca];
  for (const c of cb) if (!concepts.some((k) => overlaps(k, c))) concepts.push(c);
  concepts.splice(3);

  // Cấp địa lý: luật trước (chữ trong câu hỏi), model sau
  const t = question.toLowerCase();
  let level: "province" | "nation" = /tỉnh|địa phương|vùng|miền|thành phố/.test(t) ? "province" : "nation";
  if (level === "nation" && (a.data?.cap === "province" || b.data?.cap === "province")) level = "province";

  const scheme = schemeFromQuestion(question);
  const places = detectPlaces(question);
  const timeframe = detectTimeframe(question);
  const intents = detectIntents(question, concepts.length, places, a.data?.y_dinh ?? []);
  // Nhắc tên tỉnh/vùng → câu hỏi ở cấp địa phương dù không có chữ "tỉnh"
  if (places.length) level = "province";
  const route = concepts.length ? "chuan" : "hoi_lai";
  return {
    concepts,
    level,
    scheme,
    route,
    ...(route === "hoi_lai" ? { askBack: "Mình chưa nhận ra chỉ tiêu nào đo được trong câu hỏi. Bạn muốn xem số liệu gì (vd thu nhập, mức sinh, số bác sĩ…)?" } : {}),
    agreement,
    intents,
    places,
    timeframe,
    raw: [a.data ?? a.error ?? a.text, b.data ?? b.error ?? b.text],
    ms: Date.now() - t0,
  };
}
