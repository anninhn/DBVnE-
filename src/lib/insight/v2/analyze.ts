/**
 * Pipeline phân tích (code, tất định): với các chỉ tiêu đã chọn, chạy MỌI họ giả
 * thuyết hợp với hình dạng dữ liệu, áp Benjamini–Hochberg trên mọi phép thử của
 * phiên, giữ PHÁT HIỆN vượt ngưỡng, xếp hạng, sinh câu diễn giải theo mẫu với chỗ
 * trống. Không có AI ở bước này.
 *
 * Bậc 1 có 2 họ: quan hệ theo vùng (2 chỉ tiêu cấp tỉnh), xu hướng / kỷ lục / điểm
 * gãy (một chỉ tiêu theo thời gian). Bậc 2 thêm họ theo THIET-KE-V6 mục 5.4.
 */

import { loadDataset } from "../load";
import { sliceTable, type Slice } from "../dataset";
import { regionReversal, trendBreak, type RegionFitData } from "../detectors";
import { regionName } from "../geo";
import type { CatalogEntry } from "./catalog";
import { cleanUnit, describeQ, describeR, fmtVN, isExpectedRecord, MAX_Q, MIN_ABS_R, MIN_PER_REGION, NULL_ABS_R } from "./rules";

export interface Badge {
  kind: "ok" | "warn" | "info";
  text: string;
}

export interface Finding {
  id: string;
  family: "quan_he_theo_vung" | "xu_huong";
  familyLabel: string;
  /** Độ "đáng viết" để xếp hạng — cao trước */
  score: number;
  /** Giá trị đã định dạng cho từng chỗ trống */
  slots: Record<string, string>;
  /** Ý nghĩa của từng chỗ trống — đưa cho AI viết lời (KHÔNG kèm số) */
  slotMeaning: Record<string, string>;
  /** Mẫu câu do code sinh — dùng làm dự phòng khi AI viết sai */
  templateTitle: string;
  templateText: string;
  /** Các ý chính bằng chữ (không số) để AI viết lời */
  points: string[];
  /** Chữ không được xuất hiện trong lời văn (vd thẻ xu hướng một chỉ tiêu không được nói "quan hệ") */
  offTopic?: string[];
  allowSuperlative: boolean;
  badges: Badge[];
  verify: string;
  caveat: string;
  sources: { slug: string; label: string }[];
  chart?: Record<string, unknown>;
  scheme: string | null;
  raw: unknown;
}

export interface AnalysisResult {
  findings: Finding[];
  testsInSession: number;
  ranAnalyses: string[];
  ms: number;
}

/** Benjamini–Hochberg: q cho từng p, trên toàn bộ p của phiên. */
export function bhQ(all: number[]): Map<number, number> {
  const sorted = all.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const m = sorted.length;
  const q = new Array<number>(m);
  let min = 1;
  for (let k = m - 1; k >= 0; k--) {
    min = Math.min(min, (sorted[k].p * m) / (k + 1));
    q[sorted[k].i] = min;
  }
  const out = new Map<number, number>();
  all.forEach((p, i) => out.set(i, q[i]));
  return out;
}

async function sliceOf(e: CatalogEntry, level: "province" | "nation"): Promise<Slice> {
  const { table, profile } = await loadDataset(e.slug);
  return sliceTable(table, profile, { slug: e.slug, measure: e.measure, dims: e.dims, level });
}

function shortLabel(e: CatalogEntry) {
  return e.label.replace(/\s*\([^)]*\)\s*$/, "");
}

/**
 * Chạy phân tích. `sessionP`: p-value của các phép thử TRƯỚC trong phiên (để BH tính
 * trên toàn phiên); hàm trả p-value mới để lưu lại.
 */
export interface AnalysisPick {
  entry: CatalogEntry;
  /** Từ phóng viên dùng (vd "thu nhập") — dùng trong lời văn thay cho tên cột thô ("Bình quân chung") */
  concept: string;
}

/**
 * Hướng xu hướng trước/sau điểm gãy, bằng chữ — AI KHÔNG tự suy hướng. Đo 2026-10-09:
 * chỉ được báo "đảo chiều", AI viết mức sinh "đi lên từ 2020 rồi trượt xuống" (sai);
 * khi có hướng theo dấu độ dốc, AI viết "trước 2020 chủ yếu đi lên" trong khi số chỉ
 * dao động 2,0–2,1. Nên: đổi dưới FLAT_SHARE mỗi năm (so với mức trung bình) = đi ngang.
 */
const FLAT_SHARE = 0.005;
type Dir = "tăng" | "giảm" | "gần như đi ngang";
function dirOf(slope: number | null, scale: number): Dir | null {
  if (slope === null) return null;
  if (!scale || Math.abs(slope) / Math.abs(scale) < FLAT_SHARE) return "gần như đi ngang";
  return slope > 0 ? "tăng" : "giảm";
}
function trendWords(before: number | null, after: number | null, scale: number): { text: string; reversed: boolean } {
  const b = dirOf(before, scale);
  const a = dirOf(after, scale);
  if (!b || !a) return { text: "xu hướng đổi khác", reversed: false };
  if (b === a && b !== "gần như đi ngang") {
    return { text: `trước đó ${b}, sau đó vẫn ${a} nhưng ${Math.abs(after!) > Math.abs(before!) ? "nhanh hơn" : "chậm lại"}`, reversed: false };
  }
  return { text: `trước đó ${b}, sau đó ${a}`, reversed: (b === "tăng" && a === "giảm") || (b === "giảm" && a === "tăng") };
}

export async function analyze(
  pickList: AnalysisPick[],
  opts: { level: "province" | "nation"; year?: number; excludeProvisional?: boolean; sessionP: number[] }
): Promise<AnalysisResult & { newP: number[] }> {
  const t0 = Date.now();
  const picks = pickList.map((p) => p.entry);
  const nounOf = (e: CatalogEntry) => pickList.find((p) => p.entry === e)?.concept ?? shortLabel(e).toLowerCase();
  const findings: Finding[] = [];
  const ran: string[] = [];
  const newP: number[] = [];

  // ── Họ 1: quan hệ theo vùng (2 chỉ tiêu, cấp tỉnh) ──
  if (picks.length >= 2 && opts.level === "province") {
    const [ex, ey] = picks;
    const [x, y] = await Promise.all([sliceOf(ex, "province"), sliceOf(ey, "province")]);
    const provisional = new Set([...ex.provisional, ...ey.provisional]);
    const common = [...new Set(x.points.map((p) => p.year))].filter((yr) => y.points.some((p) => p.year === yr)).sort((a, b) => a - b);
    const usable = opts.excludeProvisional ? common.filter((yr) => !provisional.has(yr)) : common;
    const year = opts.year ?? usable[usable.length - 1];
    if (year !== undefined) {
      const out = regionReversal(x, y, { year });
      ran.push(`Quan hệ theo vùng: ${shortLabel(ex)} × ${shortLabel(ey)}, năm ${year}`);
      const d = out.data as { year: number; secondYear: number | null; pooled: RegionFitData; regions: RegionFitData[]; secondRegions: RegionFitData[] | null };
      // BH trên toàn phiên: p cũ + p mới (cả nước + các vùng đủ tỉnh)
      const tested = [d.pooled, ...d.regions.filter((r) => r.n >= MIN_PER_REGION && r.p !== null)];
      tested.forEach((t) => newP.push(t.p ?? 1));
      const all = [...opts.sessionP, ...newP];
      const qMap = bhQ(all);
      const qOf = (t: RegionFitData) => (t.p === null ? null : qMap.get(opts.sessionP.length + tested.indexOf(t)) ?? null);

      const pooledQ = qOf(d.pooled);
      const pooledClear = Math.abs(d.pooled.r) >= MIN_ABS_R && pooledQ !== null && pooledQ <= MAX_Q;
      const regionInfo = d.regions.map((r) => ({ ...r, name: regionName(r.region), q: r.n >= MIN_PER_REGION ? qOf(r) : null }));
      const clearRegions = regionInfo.filter((r) => r.q !== null && r.q <= MAX_Q && Math.abs(r.r) >= MIN_ABS_R);
      const nullRegions = regionInfo.filter((r) => r.n >= MIN_PER_REGION && Math.abs(r.r) < NULL_ABS_R);
      const sameSign = (a: number, b: number) => Math.sign(a) === Math.sign(b);
      const oppositeRegions = clearRegions.filter((r) => !sameSign(r.r, d.pooled.r));
      const repeats =
        d.secondRegions && clearRegions.length
          ? clearRegions.every((r) => {
              const s = d.secondRegions!.find((x2) => x2.region === r.region);
              return s ? sameSign(s.r, r.r) : false;
            })
          : null;

      if (pooledClear || clearRegions.length) {
        const slots: Record<string, string> = { nam: String(d.year), so_tinh: String(d.pooled.n), r_ca_nuoc: fmtVN(d.pooled.r) };
        const meaning: Record<string, string> = {
          nam: "năm phân tích",
          so_tinh: "số tỉnh",
          r_ca_nuoc: `hệ số tương quan cả nước (${describeR(d.pooled.r)})`,
        };
        const featured = new Set([...clearRegions, ...(pooledClear ? nullRegions : [])].map((r) => r.region));
        regionInfo.forEach((r, i) => {
          if (!featured.has(r.region)) return; // chỉ đưa AI các vùng đáng nói — đoạn văn ngắn, đúng trọng tâm
          slots[`r_vung_${i + 1}`] = fmtVN(r.r);
          meaning[`r_vung_${i + 1}`] = `hệ số tương quan của ${r.name} (${describeR(r.r)}${r.n < MIN_PER_REGION ? ", chưa đủ tỉnh để kiểm định" : ""})`;
        });
        if (d.secondYear) {
          slots.nam_lap_lai = String(d.secondYear);
          meaning.nam_lap_lai = "năm kiểm lặp lại";
        }
        const xl = nounOf(ex);
        const yl = nounOf(ey);
        const dirWord = d.pooled.r < 0 ? "thấp hơn" : "cao hơn";
        const points = [
          `Cả nước: ${describeR(d.pooled.r)} giữa ${xl} và ${yl} (${describeQ(pooledQ)}).`,
          ...clearRegions.map((r) => `${r.name}: ${describeR(r.r)}.`),
          ...nullRegions.filter(() => pooledClear).map((r) => `${r.name}: ${describeR(r.r)} — khác cả nước.`),
          ...(oppositeRegions.length ? [`Đổi chiều ở: ${oppositeRegions.map((r) => r.name).join(", ")}.`] : []),
        ];
        const exc = pooledClear ? nullRegions : [];
        const idx = (r: { region: string }) => regionInfo.findIndex((x2) => x2.region === r.region) + 1;
        const templateTitle = pooledClear
          ? `Tỉnh có ${xl} cao hơn thường có ${yl} ${dirWord}${exc.length ? ` — trừ ${exc.map((r) => r.name).join(", ")}` : ""}`
          : `Quan hệ giữa ${xl} và ${yl} khác nhau theo vùng`;
        const templateText = [
          pooledClear
            ? `Trên {so_tinh} tỉnh năm {nam}, ${xl} và ${yl} có ${describeR(d.pooled.r)} (r = {r_ca_nuoc}).`
            : `Trên cả nước, ${xl} và ${yl} chưa có quan hệ rõ (r = {r_ca_nuoc}, năm {nam}).`,
          ...clearRegions.map((r) => `${r.name}: ${describeR(r.r)} (r = {r_vung_${idx(r)}}).`),
          ...exc.map((r) => `Riêng ${r.name} ${describeR(r.r)} (r = {r_vung_${idx(r)}}).`),
        ].join(" ");

        const badges: Badge[] = [];
        if (repeats === true && d.secondYear) badges.push({ kind: "ok", text: `lặp lại ở năm ${d.secondYear}` });
        if (repeats === false && d.secondYear) badges.push({ kind: "warn", text: `không lặp lại ở năm ${d.secondYear}` });
        if (pooledQ !== null) badges.push({ kind: pooledQ <= 0.05 ? "ok" : "warn", text: `cả nước: ${describeQ(pooledQ)}` });
        if (provisional.has(d.year)) badges.push({ kind: "warn", text: `số ${d.year} là sơ bộ` });
        const few = regionInfo.filter((r) => r.n < MIN_PER_REGION).map((r) => r.name);
        if (few.length) badges.push({ kind: "warn", text: `${few.join(", ")} dưới ${MIN_PER_REGION} tỉnh` });
        badges.push({ kind: "info", text: `danh mục ${x.scheme ?? "?"} tỉnh` });

        // +1: phóng viên hỏi về quan hệ — thẻ này trả lời thẳng câu hỏi, luôn đứng trước thẻ bối cảnh
        const score = 1 + Math.abs(d.pooled.r) + clearRegions.length * 0.1 + (exc.length ? 0.3 : 0) + (oppositeRegions.length ? 0.4 : 0) + (repeats ? 0.2 : 0);
        findings.push({
          id: `f${findings.length + 1}`,
          family: "quan_he_theo_vung",
          familyLabel: "Quan hệ theo vùng",
          score,
          slots,
          slotMeaning: meaning,
          templateTitle,
          templateText,
          points,
          allowSuperlative: false,
          badges,
          verify: exc.length
            ? `Vì sao ${exc.map((r) => r.name).join(", ")} không theo quy luật chung — hỏi chuyên gia.`
            : "Hỏi chuyên gia về cơ chế đằng sau quan hệ này.",
          caveat: "Tương quan giữa các tỉnh, không nói về từng người hay hộ gia đình, không phải quan hệ nhân quả.",
          sources: [
            { slug: ex.slug, label: ex.datasetTitle },
            { slug: ey.slug, label: ey.datasetTitle },
          ],
          chart: {
            type: "region_r",
            year: d.year,
            bars: regionInfo.map((r) => ({ name: r.name, r: r.r, n: r.n, enough: r.n >= MIN_PER_REGION })),
            national: d.pooled.r,
          },
          scheme: x.scheme ?? null,
          raw: { pooled: d.pooled, pooledQ, regions: regionInfo, secondYear: d.secondYear, secondRegions: d.secondRegions },
        });
      }
    }
  }

  // ── Họ 2: xu hướng / kỷ lục / điểm gãy (từng chỉ tiêu, cả nước) ──
  for (const e of picks) {
    if (!e.nation || e.nation.years.length < 6) continue;
    const full = await sliceOf(e, "nation");
    const s = opts.excludeProvisional ? { ...full, points: full.points.filter((p) => !e.provisional.includes(p.year)) } : full;
    const out = trendBreak(s, { geo: "nation" });
    ran.push(`Xu hướng cả nước: ${shortLabel(e)}`);
    const d = out.data as {
      first: { year: number; value: number };
      last: { year: number; value: number; provisional: boolean };
      isMax: boolean;
      isMin: boolean;
      highSince: number;
      lowSince: number;
      nYears: number;
      breakYear: number | null;
      breakFlag: boolean;
      reversed: boolean;
      slopeBefore: number | null;
      slopeAfter: number | null;
    };
    const values = s.points.slice().sort((p, q) => p.year - q.year).map((p) => p.value);
    let record: "cao nhất" | "thấp nhất" | null = d.isMax ? "cao nhất" : d.isMin ? "thấp nhất" : null;
    if (record && isExpectedRecord(values, record)) record = null; // đỉnh/đáy đã được chờ đợi
    if (!record && !d.breakFlag) continue;
    const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    const tw = trendWords(d.slopeBefore, d.slopeAfter, mean);
    const shift = tw.reversed ? "đảo chiều" : "đổi xu hướng";
    const noun = nounOf(e);
    const label = noun.charAt(0).toUpperCase() + noun.slice(1);
    const u = cleanUnit(e.unit);
    const unit = u ? ` ${u}` : "";
    const slots: Record<string, string> = {
      nam_cuoi: String(d.last.year),
      gia_tri_cuoi: fmtVN(d.last.value) + unit,
      nam_dau: String(d.first.year),
      gia_tri_dau: fmtVN(d.first.value) + unit,
      so_nam: String(d.nYears),
      ...(d.breakYear ? { nam_gay: String(d.breakYear) } : {}),
    };
    const meaning: Record<string, string> = {
      nam_cuoi: "năm mới nhất",
      gia_tri_cuoi: "giá trị năm mới nhất",
      nam_dau: "một năm cụ thể — năm bắt đầu chuỗi số liệu (dùng như 'kể từ {nam_dau}', KHÔNG phải số năm)",
      gia_tri_dau: "giá trị của năm bắt đầu chuỗi",
      so_nam: "số năm có số liệu trong chuỗi (dùng như '{so_nam} năm')",
      ...(d.breakYear ? { nam_gay: "năm bắt đầu đổi xu hướng" } : {}),
    };
    const points = [
      `Phát hiện này CHỈ nói về ${noun} của cả nước theo thời gian — không nói về quan hệ với chỉ tiêu khác.`,
      ...(record ? [`${label} cả nước năm mới nhất là mức ${record} của cả chuỗi số liệu.`] : []),
      ...(d.breakFlag ? [`Xu hướng ${shift} từ năm bắt đầu đổi xu hướng: ${tw.text}. Chỉ tả đúng các hướng này, không thêm hướng khác.`] : []),
    ];
    const templateTitle = record ? `${label} cả nước ở mức ${record} kể từ {nam_dau}` : `${label} cả nước ${shift} từ {nam_gay}`;
    const templateText = [
      `${label} cả nước năm {nam_cuoi} là {gia_tri_cuoi}${record ? `, mức ${record} kể từ {nam_dau} ({gia_tri_dau})` : ""}.`,
      d.breakFlag && d.breakYear ? `Từ năm {nam_gay}: ${tw.text}.` : "",
    ].join(" ");
    const badges: Badge[] = [];
    if (d.last.provisional) badges.push({ kind: "warn", text: `số ${d.last.year} là sơ bộ` });
    badges.push({ kind: "info", text: `${d.nYears} năm số liệu` });
    findings.push({
      id: `f${findings.length + 1}`,
      family: "xu_huong",
      familyLabel: record ? "Kỷ lục" : "Điểm gãy xu hướng",
      score: (record ? 0.7 : 0) + (d.breakFlag ? 0.4 : 0) + (tw.reversed ? 0.2 : 0) - (d.last.provisional ? 0.1 : 0),
      slots,
      slotMeaning: meaning,
      templateTitle,
      templateText,
      points,
      offTopic: ["quan hệ", "liên hệ", "tương quan", "liên quan", ...pickList.map((p) => p.concept).filter((c) => c !== noun)],
      allowSuperlative: !!record,
      badges,
      verify: "Đối chiếu với số chính thức khi có; hỏi chuyên gia vì sao đổi xu hướng.",
      caveat: d.last.provisional ? "Năm mới nhất là số sơ bộ, có thể điều chỉnh." : "Số cả nước, không cho biết khác biệt giữa các tỉnh.",
      sources: [{ slug: e.slug, label: e.datasetTitle }],
      chart: { type: "line", label, unit: u, breakYear: d.breakYear, points: s.points.map((p) => [p.year, p.value]) },
      scheme: null,
      raw: d,
    });
  }

  findings.sort((a, b) => b.score - a.score);
  return {
    findings: findings.slice(0, 3),
    testsInSession: opts.sessionP.length + newP.length,
    ranAnalyses: ran,
    newP,
    ms: Date.now() - t0,
  };
}
