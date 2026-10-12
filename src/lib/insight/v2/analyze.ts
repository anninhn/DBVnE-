/**
 * Pipeline phân tích (code, tất định): với các chỉ tiêu đã chọn, chạy các họ giả
 * thuyết mà Ý ĐỊNH câu hỏi cần (scope.ts quyết), áp Benjamini–Hochberg trên mọi phép thử của
 * phiên, giữ PHÁT HIỆN vượt ngưỡng, xếp hạng, sinh câu diễn giải theo mẫu với chỗ
 * trống. Không có AI ở bước này.
 *
 * Bậc 1 có 2 họ: quan hệ theo vùng (2 chỉ tiêu cấp tỉnh), diễn biến / kỷ lục / đổi
 * chiều (một chỉ tiêu theo thời gian). Bậc 2 thêm họ theo THIET-KE-V6 mục 5.4.
 */

import { loadDataset } from "../load";
import { sliceTable, type Slice } from "../dataset";
import { regionReversal, trendBreak, type RegionFitData } from "../detectors";
import { regionName } from "../geo";
import type { CatalogEntry } from "./catalog";
import {
  cleanUnit,
  describeQ,
  describeR,
  fmtVN,
  isExpectedRecord,
  isExtensive,
  isNominalMoney,
  measureName,
  MAX_Q,
  MIN_ABS_R,
  MIN_PER_REGION,
  NULL_ABS_R,
  type DirectionPair,
} from "./rules";

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
  /** Cặp mốc số + hướng thật — bộ kiểm bắt câu nói ngược chiều */
  directions?: DirectionPair[];
  /** Chỗ trống bắt buộc có trong lời văn (vd tên đầy đủ của chỉ tiêu) */
  requiredSlots?: string[];
  /** Đơn vị đã gắn vào giá trị — để dọn "vụ vụ" sau khi điền */
  unit?: string | null;
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
 * DIỄN BIẾN bằng các đoạn tăng / giảm / đi ngang — code tính, AI chỉ chép (vòng thử 1).
 *
 * Bản trước lấy hướng từ độ dốc hai bên MỘT điểm gãy, ngưỡng "đi ngang" tính theo năm:
 * diện tích lúa +17% trong 18 năm thành "đi ngang"; ly hôn giảm 3 năm liền (2019–2021)
 * thành "tăng nhanh hơn". Nay: tìm các đỉnh/đáy đổi chiều ≥ ZIGZAG_SHARE mức trung bình
 * (zigzag), mỗi đoạn có hướng + mức thay đổi CẢ ĐOẠN; đoạn cuối nhỏ hơn ngưỡng = đi ngang.
 */
const ZIGZAG_SHARE = 0.05;
const MAX_SEGMENTS = 4;

type Pt = { year: number; value: number; provisional?: boolean };

function zigzag(P: Pt[], thr: number): number[] {
  const n = P.length;
  if (n < 2) return [0];
  const piv = [0];
  let dir = 0;
  let ext = 0;
  for (let i = 1; i < n; i++) {
    const v = P[i].value;
    if (dir === 0) {
      if (Math.abs(v - P[0].value) >= thr) {
        dir = Math.sign(v - P[0].value);
        ext = i;
      }
      continue;
    }
    if ((dir > 0 && v >= P[ext].value) || (dir < 0 && v <= P[ext].value)) {
      ext = i;
      continue;
    }
    if (Math.abs(v - P[ext].value) >= thr) {
      piv.push(ext);
      dir = -dir;
      ext = i;
    }
  }
  if (dir !== 0 && ext !== piv[piv.length - 1]) piv.push(ext);
  if (piv[piv.length - 1] !== n - 1) piv.push(n - 1);
  return piv;
}

type SegDir = "tăng" | "giảm" | "gần như đi ngang";
interface Segment {
  from: Pt;
  to: Pt;
  dir: SegDir;
  pct: number;
}

function segmentsOf(P: Pt[]): Segment[] {
  const mean = P.reduce((a, p) => a + Math.abs(p.value), 0) / P.length;
  let thr = ZIGZAG_SHARE * mean;
  let piv = zigzag(P, thr);
  for (let k = 0; k < 6 && piv.length - 1 > MAX_SEGMENTS; k++) {
    thr *= 1.5;
    piv = zigzag(P, thr);
  }
  const segs: Segment[] = [];
  for (let i = 0; i + 1 < piv.length; i++) {
    const a = P[piv[i]];
    const b = P[piv[i + 1]];
    const d = b.value - a.value;
    const dir: SegDir = Math.abs(d) < thr ? "gần như đi ngang" : d > 0 ? "tăng" : "giảm";
    segs.push({ from: a, to: b, dir, pct: a.value ? (d / Math.abs(a.value)) * 100 : 0 });
  }
  return segs;
}

function pctText(p: number): string {
  return `${p > 0 ? "+" : ""}${fmtVN(p, 1)}%`;
}

/** Các khoảng năm bị thiếu trong chuỗi (vd siêu thị 2006–2012) */
function gapsOf(P: Pt[]): string[] {
  const g: string[] = [];
  for (let i = 1; i < P.length; i++) {
    if (P[i].year - P[i - 1].year > 1) {
      const a = P[i - 1].year + 1;
      const b = P[i].year - 1;
      g.push(a === b ? String(a) : `${a}–${b}`);
    }
  }
  return g;
}

/** Chia số tuyệt đối theo dân số tỉnh cùng năm. Điểm không có dân số bị bỏ. */
function perCapita(s: Slice, pop: Slice): Slice {
  const key = (g: string, y: number) => `${g}|${y}`;
  const pm = new Map(pop.points.map((p) => [key(p.geo, p.year), p.value]));
  return {
    ...s,
    points: s.points.flatMap((p) => {
      const d = pm.get(key(p.geo, p.year));
      return d ? [{ ...p, value: p.value / d }] : [];
    }),
  };
}

export interface AnalyzeOpts {
  level: "province" | "nation";
  year?: number;
  excludeProvisional?: boolean;
  sessionP: number[];
  /** Họ được chạy — do ý định câu hỏi quyết (scope.ts) */
  families?: { relation: boolean; trend: boolean; trendIsContext: boolean };
  /** "N năm qua" → mức thay đổi so với N năm trước */
  window?: number;
  /** "từ năm X" → mức thay đổi so với năm X */
  fromYear?: number;
  /** Chỉ tiêu dân số theo tỉnh — để chia số tuyệt đối */
  population?: CatalogEntry | null;
  /** Chuỗi cả nước dài hơn cho từng chỉ tiêu (id → entry) */
  nationAlt?: Map<string, CatalogEntry>;
}

export async function analyze(
  pickList: AnalysisPick[],
  opts: AnalyzeOpts
): Promise<AnalysisResult & { newP: number[] }> {
  const t0 = Date.now();
  const picks = pickList.map((p) => p.entry);
  const nounOf = (e: CatalogEntry) => pickList.find((p) => p.entry === e)?.concept ?? shortLabel(e).toLowerCase();
  const findings: Finding[] = [];
  const ran: string[] = [];
  const newP: number[] = [];

  // ── Họ 1: quan hệ theo vùng (2 chỉ tiêu, cấp tỉnh) ──
  const fam = opts.families ?? { relation: true, trend: true, trendIsContext: false };
  if (fam.relation && picks.length >= 2 && opts.level === "province") {
    const [ex, ey] = picks;
    let [x, y] = await Promise.all([sliceOf(ex, "province"), sliceOf(ey, "province")]);
    // Số tuyệt đối lớn theo quy mô tỉnh → chia theo dân số trước khi so (vòng thử 1, q08)
    const extX = isExtensive(ex.label, ex.unit);
    const extY = isExtensive(ey.label, ey.unit);
    let normalized = false;
    if ((extX || extY) && opts.population) {
      const pop = await sliceOf(opts.population, "province");
      if (extX) x = perCapita(x, pop);
      if (extY) y = perCapita(y, pop);
      normalized = true;
    }
    const provisional = new Set([...ex.provisional, ...ey.provisional]);
    const common = [...new Set(x.points.map((p) => p.year))].filter((yr) => y.points.some((p) => p.year === yr)).sort((a, b) => a - b);
    const usable = opts.excludeProvisional ? common.filter((yr) => !provisional.has(yr)) : common;
    const year = opts.year !== undefined && usable.includes(opts.year) ? opts.year : usable[usable.length - 1];
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
        const perHead = (e: CatalogEntry, ext: boolean) => (normalized && ext ? `${nounOf(e)} bình quân đầu người` : nounOf(e));
        const xl = perHead(ex, extX);
        const yl = perHead(ey, extY);
        const dirWord = d.pooled.r < 0 ? "thấp hơn" : "cao hơn";
        const points = [
          `Cả nước: ${describeR(d.pooled.r)} giữa ${xl} và ${yl} (${describeQ(pooledQ)}).`,
          ...clearRegions.map((r) => `${r.name}: ${describeR(r.r)}.`),
          ...nullRegions.filter(() => pooledClear).map((r) => `${r.name}: ${describeR(r.r)} — khác cả nước.`),
          ...(oppositeRegions.length ? [`Đổi chiều ở: ${oppositeRegions.map((r) => r.name).join(", ")}.`] : []),
          ...(normalized ? [`Số tuyệt đối đã được chia theo dân số tỉnh — gọi đúng là "${[extX ? xl : null, extY ? yl : null].filter(Boolean).join('", "')}".`] : []),
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
        if (normalized) badges.push({ kind: "info", text: "đã chia theo dân số tỉnh" });
        if ((extX || extY) && !normalized) badges.push({ kind: "warn", text: "số tuyệt đối — có thể chỉ phản ánh quy mô tỉnh" });

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
          raw: { pooled: d.pooled, pooledQ, regions: regionInfo, secondYear: d.secondYear, secondRegions: d.secondRegions, perCapita: normalized ? { x: extX, y: extY } : null },
        });
      }
    }
  }

  // ── Họ 2: diễn biến / kỷ lục / đổi chiều (từng chỉ tiêu, cả nước) ──
  for (const pe of fam.trend ? picks : []) {
    if (!pe.nation) continue;
    // Chuỗi cả nước dài hơn chỉ được dùng khi SỐ khớp với chuỗi gốc ở các năm trùng —
    // dữ liệu phân xử, không phải tên (vòng 2: so tên đã ghép nhầm ly hôn với mức sinh).
    let e = pe;
    let full = await sliceOf(pe, "nation");
    const alt = opts.nationAlt?.get(pe.id);
    if (alt) {
      const altSlice = await sliceOf(alt, "nation");
      const own = new Map(full.points.map((p) => [p.year, p.value]));
      const overlap = altSlice.points.filter((p) => own.has(p.year));
      // Khớp đến chữ số cuối của bảng làm tròn thô hơn (GINI 0,42 / 0,43; hộ nghèo 4,36 / 4,4)
      const decimals = (pts: { value: number }[]) => Math.min(...pts.map((p) => (String(p.value).split(".")[1] ?? "").length));
      const tol = Math.pow(10, -Math.min(decimals(altSlice.points), decimals(full.points))) + 1e-9;
      const agree = overlap.filter((p) => Math.abs(p.value - own.get(p.year)!) <= Math.max(tol, 0.01 * Math.abs(p.value)));
      if (overlap.length >= 3 && agree.length === overlap.length) {
        e = alt;
        full = altSlice;
      }
    }
    if (full.points.length < 4) continue;
    const s = opts.excludeProvisional ? { ...full, points: full.points.filter((p) => !e.provisional.includes(p.year)) } : full;
    const P: Pt[] = s.points.slice().sort((a, b) => a.year - b.year).map((p) => ({ year: p.year, value: p.value, provisional: p.provisional }));
    if (P.length < 4) continue;
    ran.push(`Diễn biến cả nước: ${shortLabel(e)}${e !== pe ? " (chuỗi dài hơn)" : ""}`);
    const values = P.map((p) => p.value);
    const last = P[P.length - 1];
    const prev = values.slice(0, -1);
    // Kỷ lục chỉ khi VƯỢT mọi năm trước — bằng thì là hoà (vòng thử 1, q02: GINI 0,37 = 2020, 2021, 2023)
    let record: "cao nhất" | "thấp nhất" | null = last.value > Math.max(...prev) ? "cao nhất" : last.value < Math.min(...prev) ? "thấp nhất" : null;
    const tie = !record && (last.value === Math.max(...prev) || last.value === Math.min(...prev));
    if (record && isExpectedRecord(values, record)) record = null;
    const segs = segmentsOf(P);
    const lastSig = [...segs].reverse().find((g) => g.dir !== "gần như đi ngang");
    const prevSig = lastSig ? [...segs.slice(0, segs.indexOf(lastSig))].reverse().find((g) => g.dir !== "gần như đi ngang") : undefined;
    const reversal = !!lastSig && !!prevSig && lastSig.dir !== prevSig.dir;
    const nominal = isNominalMoney(e.label, e.datasetTitle, e.unit);
    const breakFlag = P.length >= 6 && !nominal ? !!(trendBreak(s, { geo: "nation" }).data as { breakFlag?: boolean }).breakFlag : false;
    const gaps = gapsOf(P);

    // Mốc "N năm qua"
    let windowPt: Pt | null = null;
    if (opts.fromYear) {
      windowPt = P.find((p) => p.year >= opts.fromYear! && p.year < last.year) ?? null;
      if (windowPt && windowPt.year - opts.fromYear > 2) windowPt = null;
    } else if (opts.window) {
      const base = last.year - opts.window;
      windowPt = [...P].reverse().find((p) => p.year <= base) ?? null;
      if (windowPt && last.year - windowPt.year > opts.window + 2) windowPt = null;
    }

    const asked = !fam.trendIsContext;
    if (!asked && !record && !(reversal && breakFlag)) continue;

    const noun = nounOf(pe);
    const name = measureName(e.label, e.datasetTitle);
    const label = noun.charAt(0).toUpperCase() + noun.slice(1);
    const u = cleanUnit(e.unit, e.label);
    const unit = u ? ` ${u}` : "";
    const val = (v: number) => fmtVN(v) + unit;

    const slots: Record<string, string> = { ten_chi_tieu: name, so_nam: String(P.length) };
    const meaning: Record<string, string> = {
      ten_chi_tieu: "tên đầy đủ của chỉ tiêu — dùng ở lần nhắc đầu, giữ nguyên định ngữ",
      so_nam: "số năm có số liệu (dùng như '{so_nam} năm')",
    };
    const directions: DirectionPair[] = [];
    const pivots: Pt[] = [segs[0].from, ...segs.map((g) => g.to)];
    pivots.forEach((p, i) => {
      slots[`nam_m${i}`] = String(p.year);
      slots[`gia_tri_m${i}`] = val(p.value);
      meaning[`nam_m${i}`] = `năm của mốc ${i}`;
      meaning[`gia_tri_m${i}`] = `giá trị năm {nam_m${i}}`;
    });
    segs.forEach((g, i) => {
      slots[`thay_doi_d${i}`] = pctText(g.pct);
      meaning[`thay_doi_d${i}`] = `mức thay đổi từ {nam_m${i}} đến {nam_m${i + 1}}`;
      directions.push({ from: `gia_tri_m${i}`, to: `gia_tri_m${i + 1}`, dir: g.dir });
    });
    const totalPct = ((last.value - P[0].value) / Math.abs(P[0].value)) * 100;
    const totalDir: SegDir = Math.abs(totalPct) < ZIGZAG_SHARE * 100 ? "gần như đi ngang" : totalPct > 0 ? "tăng" : "giảm";
    directions.push({ from: "gia_tri_m0", to: `gia_tri_m${pivots.length - 1}`, dir: totalDir });

    const segLine = (g: Segment, i: number) => `Từ {nam_m${i}} ({gia_tri_m${i}}) đến {nam_m${i + 1}} ({gia_tri_m${i + 1}}): ${g.dir} ({thay_doi_d${i}}).`;
    const points = [
      `Phát hiện này CHỈ nói về ${noun} của cả nước theo thời gian — không nói về quan hệ với chỉ tiêu khác.`,
      `Tên chính thức của chỉ tiêu là {ten_chi_tieu}.`,
      ...segs.map(segLine),
      ...(record ? [`Năm mới nhất là mức ${record} của cả chuỗi số liệu.`] : []),
      ...(tie ? ["Năm mới nhất NGANG mức của một năm trước đó — không phải đỉnh/đáy mới, không dùng từ so sánh nhất."] : []),
      ...(reversal ? [`Xu hướng đã đổi chiều: giai đoạn gần nhất ${lastSig!.dir}, trước đó ${prevSig!.dir}.`] : []),
    ];
    if (windowPt) {
      const wp = ((last.value - windowPt.value) / Math.abs(windowPt.value)) * 100;
      slots.nam_moc = String(windowPt.year);
      slots.gia_tri_moc = val(windowPt.value);
      slots.thay_doi_moc = pctText(wp);
      slots.so_nam_moc = `${last.year - windowPt.year} năm`;
      meaning.nam_moc = "năm làm mốc so sánh theo câu hỏi";
      meaning.gia_tri_moc = "giá trị năm {nam_moc}";
      meaning.thay_doi_moc = "mức thay đổi từ {nam_moc} đến năm mới nhất";
      meaning.so_nam_moc = "khoảng cách giữa {nam_moc} và năm mới nhất (đã gồm chữ 'năm')";
      // Người hỏi hỏi thẳng "giảm bao nhiêu" → nói hướng theo dấu; chỉ gọi đi ngang khi gần như bằng
      // (vòng 2, q07: −4,3% trong 20 năm bị gọi là "gần như đi ngang")
      const wdir: SegDir = Math.abs(wp) < 0.5 ? "gần như đi ngang" : wp > 0 ? "tăng" : "giảm";
      directions.push({ from: "gia_tri_moc", to: `gia_tri_m${pivots.length - 1}`, dir: wdir });
      points.push(`So với {nam_moc} ({gia_tri_moc}), tức {so_nam_moc} trước, năm mới nhất ${wdir} {thay_doi_moc}. Đây là ý trả lời trực tiếp câu hỏi — nêu sớm trong đoạn.`);
    }
    const offTopic = ["quan hệ", "liên hệ", "tương quan", "liên quan", ...pickList.map((p) => p.concept).filter((c) => c !== noun)];
    if (nominal) {
      const yrs = last.year - P[0].year;
      const cagr = yrs > 0 && P[0].value > 0 && last.value > 0 ? (Math.pow(last.value / P[0].value, 1 / yrs) - 1) * 100 : null;
      if (cagr !== null) {
        slots.tang_bq = `${fmtVN(cagr, 1)}%/năm`;
        meaning.tang_bq = "mức tăng bình quân mỗi năm cả chuỗi";
        points.push("Chuỗi tiền theo giá hiện hành, CHƯA trừ lạm phát: tăng bình quân {tang_bq}. Không nói 'tăng tốc' hay 'nhanh hơn'.");
      }
      offTopic.push("tăng tốc", "nhanh hơn", "chậm lại");
    }
    if (gaps.length) {
      points.push(`Chuỗi THIẾU số liệu các năm ${gaps.join(", ")} — không nói "liên tục".`);
      offTopic.push("liên tục");
    }

    const familyLabel = `${asked ? "" : "Bối cảnh · "}${record ? "Kỷ lục" : reversal ? "Đổi chiều xu hướng" : "Diễn biến"}`;
    const n = pivots.length - 1;
    const templateTitle = record
      ? `${label} cả nước ở mức ${record} kể từ {nam_m0}`
      : windowPt
        ? `${label} cả nước thay đổi {thay_doi_moc} so với {nam_moc}`
        : `${label} cả nước: ${lastSig ? lastSig.dir : "gần như đi ngang"} giai đoạn gần nhất`;
    const templateText = [
      `${name.charAt(0).toUpperCase() + name.slice(1)} cả nước năm {nam_m${n}} là {gia_tri_m${n}}${record ? `, mức ${record} kể từ {nam_m0}` : ""}.`,
      ...segs.map((g, i) => `Từ {nam_m${i}} đến {nam_m${i + 1}}: ${g.dir} ({thay_doi_d${i}}).`),
      windowPt ? "So với {nam_moc}: {thay_doi_moc}." : "",
      nominal && slots.tang_bq ? "Theo giá hiện hành, tăng bình quân {tang_bq}." : "",
    ]
      .filter(Boolean)
      .join(" ");
    const badges: Badge[] = [];
    if (last.provisional) badges.push({ kind: "warn", text: `số ${last.year} là sơ bộ` });
    badges.push({ kind: "info", text: `${P.length} năm số liệu (${P[0].year}–${last.year})` });
    if (gaps.length) badges.push({ kind: "warn", text: `thiếu số liệu ${gaps.join(", ")}` });
    if (nominal) badges.push({ kind: "warn", text: "giá hiện hành, chưa trừ lạm phát" });
    if (tie) badges.push({ kind: "info", text: "năm mới nhất ngang mức đã có" });
    findings.push({
      id: `f${findings.length + 1}`,
      family: "xu_huong",
      familyLabel,
      score: (asked ? 1 : 0) + (record ? 0.7 : 0) + (reversal ? 0.3 : 0) + (windowPt ? 0.3 : 0) - (last.provisional ? 0.1 : 0),
      slots,
      slotMeaning: meaning,
      templateTitle,
      templateText,
      points,
      offTopic,
      allowSuperlative: !!record,
      directions,
      requiredSlots: ["ten_chi_tieu"],
      unit: u,
      badges,
      verify: "Đối chiếu với số chính thức khi có; hỏi chuyên gia vì sao đổi chiều.",
      caveat: [
        last.provisional ? "Năm mới nhất là số sơ bộ, có thể điều chỉnh." : "",
        nominal ? "Theo giá hiện hành — một phần mức tăng là do lạm phát." : "",
        "Số cả nước, không cho biết khác biệt giữa các tỉnh.",
      ]
        .filter(Boolean)
        .join(" "),
      sources: [{ slug: e.slug, label: e.datasetTitle }],
      chart: { type: "line", label, unit: u, breakYear: reversal ? lastSig!.from.year : null, points: P.map((p) => [p.year, p.value]) },
      scheme: null,
      raw: { segments: segs.map((g) => ({ from: g.from.year, to: g.to.year, dir: g.dir, pct: g.pct })), record, tie, gaps, nominal, window: windowPt?.year ?? null, series: P },
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
