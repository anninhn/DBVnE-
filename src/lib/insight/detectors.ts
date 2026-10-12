/**
 * Bộ dò của harness. Mỗi bộ dò nhận lát dữ liệu đã cắt (`Slice`), tính bằng code,
 * trả về:
 *  - `summary`: tóm tắt gửi cho AI — mọi con số ở đây đã làm tròn (`roundSig`) và
 *    là nguồn DUY NHẤT mà thẻ được trích (rào chắn khớp số đối chiếu với nó);
 *  - `chart`: dữ liệu vẽ biểu đồ — chỉ lưu log, không gửi AI;
 *  - `tests`: số phép kiểm định đã làm (cộng vào bộ đếm của phiên).
 *
 * Lát 1: `region_reversal`, `trend_break`.
 */

import { ols, permutationPValue, roundSig, sse } from "./stats";
import { regionName, provinceName } from "./geo";
import type { Slice, SlicePoint } from "./dataset";

export interface DetectorOutput {
  summary: Record<string, unknown>;
  chart?: Record<string, unknown>;
  tests: number;
  /** Số thô có cấu trúc cho pipeline v2 (BH, mẫu câu) — summary là bản đã định dạng cho AI */
  data?: Record<string, unknown>;
}

export interface RegionFitData {
  region: string;
  n: number;
  slope: number;
  r: number;
  p: number | null;
}

export class DetectorError extends Error {}

const MIN_PER_REGION = 8;
/** Một vùng chỉ được tính là "có quan hệ" khi đủ mạnh và khó do ngẫu nhiên. */
const MIN_ABS_R = 0.3;
const MAX_P = 0.1;

function index(points: SlicePoint[]): Map<string, Map<number, SlicePoint>> {
  const m = new Map<string, Map<number, SlicePoint>>();
  for (const p of points) {
    if (!m.has(p.geo)) m.set(p.geo, new Map());
    m.get(p.geo)!.set(p.year, p);
  }
  return m;
}

function commonYears(x: Slice, y: Slice): number[] {
  const yx = new Set(x.points.map((p) => p.year));
  return [...new Set(y.points.map((p) => p.year))].filter((v) => yx.has(v)).sort((a, b) => a - b);
}

interface PairPoint {
  geo: string;
  region: string;
  x: number;
  y: number;
}

function pairsForYear(x: Slice, y: Slice, year: number): PairPoint[] {
  const ix = index(x.points);
  const iy = index(y.points);
  const out: PairPoint[] = [];
  for (const [geo, byYear] of ix) {
    const px = byYear.get(year);
    const py = iy.get(geo)?.get(year);
    if (!px || !py || !px.region) continue;
    out.push({ geo, region: px.region, x: px.value, y: py.value });
  }
  return out;
}

interface RegionFit {
  region: string;
  n: number;
  slope: number;
  r: number;
  p: number | null;
}

function fitByRegion(pairs: PairPoint[], seed: number): { pooled: RegionFit; regions: RegionFit[]; tests: number } {
  const pooledFit = ols(pairs.map((p) => p.x), pairs.map((p) => p.y));
  if (!pooledFit) throw new DetectorError("Không đủ điểm chung giữa hai lát dữ liệu để hồi quy.");
  let tests = 1;
  const pooled: RegionFit = {
    region: "Cả nước (gộp)",
    n: pooledFit.n,
    slope: pooledFit.slope,
    r: pooledFit.r,
    p: permutationPValue(pairs.map((p) => p.x), pairs.map((p) => p.y), 2000, seed),
  };
  const regions: RegionFit[] = [];
  const byRegion = new Map<string, PairPoint[]>();
  for (const p of pairs) {
    if (!byRegion.has(p.region)) byRegion.set(p.region, []);
    byRegion.get(p.region)!.push(p);
  }
  for (const [region, pts] of byRegion) {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const fit = ols(xs, ys);
    if (!fit) continue;
    const enough = pts.length >= MIN_PER_REGION;
    regions.push({
      region,
      n: pts.length,
      slope: fit.slope,
      r: fit.r,
      p: enough ? permutationPValue(xs, ys, 2000, seed) : null,
    });
    if (enough) tests++;
  }
  return { pooled, regions, tests };
}

function fmtFit(f: RegionFit) {
  return {
    vung: f.region === "Cả nước (gộp)" ? f.region : regionName(f.region),
    so_tinh: f.n,
    do_doc: roundSig(f.slope),
    tuong_quan_r: roundSig(f.r, 2),
    p_hoan_vi: f.p === null ? `không tính (dưới ${MIN_PER_REGION} tỉnh)` : roundSig(f.p, 2),
  };
}

/**
 * Quan hệ x–y trong từng vùng so với khi gộp cả nước. Đánh dấu đổi dấu giữa các
 * vùng. TỰ chạy trên 2 năm (năm chọn + năm chung xa nhất về trước) để xem pattern
 * có lặp lại không.
 */
export function regionReversal(x: Slice, y: Slice, params: { year?: number }): DetectorOutput {
  if (x.scheme && y.scheme && x.scheme !== y.scheme) {
    throw new DetectorError(`Hai lát dữ liệu khác danh mục tỉnh (${x.scheme} vs ${y.scheme}) — không ghép được.`);
  }
  const years = commonYears(x, y);
  if (!years.length) {
    const yx = [...new Set(x.points.map((p) => p.year))].sort();
    const yy = [...new Set(y.points.map((p) => p.year))].sort();
    throw new DetectorError(
      `Hai lát dữ liệu không có năm chung. x: ${yx[0]}–${yx[yx.length - 1]}, y: ${yy[0]}–${yy[yy.length - 1]}.`
    );
  }
  const main = params.year ?? years[years.length - 1];
  if (!years.includes(main)) throw new DetectorError(`Năm ${main} không có ở cả hai lát. Năm chung: ${years.join(", ")}.`);
  const other = years.filter((v) => Math.abs(v - main) >= 4);
  const second = other.length ? other[0] : null;

  const run = (year: number, seed: number) => {
    const pairs = pairsForYear(x, y, year);
    return { year, pairs, ...fitByRegion(pairs, seed) };
  };
  const a = run(main, 42);
  const b = second !== null ? run(second, 43) : null;

  const signOf = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  // Chỉ vùng đủ tỉnh VÀ quan hệ rõ (|r| ≥ 0,3, p ≤ 0,1) mới được dùng để kết luận —
  // một vùng r = 0,005 không phải là "đổi dấu".
  const clear = (fits: RegionFit[]) =>
    fits.filter((f) => f.n >= MIN_PER_REGION && Math.abs(f.r) >= MIN_ABS_R && f.p !== null && f.p <= MAX_P);
  const clearA = clear(a.regions);
  const signsA = clearA.map((f) => signOf(f.slope));
  const reversal = signsA.includes(1) && signsA.includes(-1);

  // Lặp lại: mọi vùng có quan hệ rõ ở năm chính phải cùng chiều ở năm kiểm
  // (năm kiểm chỉ cần cùng dấu, không đòi cũng rõ).
  let windowsAgree: boolean | null = null;
  if (b && clearA.length) {
    const mapB = new Map(b.regions.filter((f) => f.n >= MIN_PER_REGION).map((f) => [f.region, signOf(f.slope)]));
    windowsAgree = clearA.every((f) => mapB.get(f.region) === signOf(f.slope));
  }

  const summary: Record<string, unknown> = {
    x: x.label,
    y: y.label,
    danh_muc_tinh: x.scheme ?? y.scheme ?? "không rõ",
    nam_chung: years,
    nam_phan_tich: main,
    gop_ca_nuoc: fmtFit(a.pooled),
    theo_vung: a.regions.sort((p, q) => q.n - p.n).map(fmtFit),
    tieu_chi_quan_he_ro: `vùng ≥ ${MIN_PER_REGION} tỉnh, |r| ≥ ${MIN_ABS_R}, p ≤ ${MAX_P}`,
    vung_co_quan_he_ro: clearA.map((f) => `${regionName(f.region)} (${f.slope > 0 ? "cùng chiều" : "ngược chiều"})`),
    doi_dau_giua_cac_vung: reversal,
    nam_kiem_lap_lai: second,
    kiem_lap_lai: b ? b.regions.sort((p, q) => q.n - p.n).map(fmtFit) : "không có năm chung cách ≥ 4 năm",
    windows_agree: windowsAgree,
    ghi_chu: [...x.notes, ...y.notes],
  };

  const chart = {
    type: "scatter",
    xLabel: x.label,
    yLabel: y.label,
    year: main,
    points: a.pairs.map((p) => ({ geo: provinceName(p.geo, x.scheme ?? "63"), region: p.region, x: p.x, y: p.y })),
  };

  return {
    summary,
    chart,
    tests: a.tests + (b?.tests ?? 0),
    data: { year: main, secondYear: second, pooled: a.pooled, regions: a.regions, secondRegions: b?.regions ?? null, nPairs: a.pairs.length },
  };
}

/**
 * Một chuỗi theo thời gian (cả nước hoặc một tỉnh/vùng): kỷ lục, đảo chiều,
 * điểm gãy (tách 2 đoạn tuyến tính sao cho tổng sai số nhỏ nhất).
 */
export function trendBreak(s: Slice, params: { geo?: string }): DetectorOutput {
  const geos = [...new Set(s.points.map((p) => p.geo))];
  const geo = params.geo ?? (geos.length === 1 ? geos[0] : undefined);
  if (!geo) {
    throw new DetectorError(
      `Lát dữ liệu có ${geos.length} địa phương — chỉ định "geo" (mã tỉnh/vùng hoặc "nation"). Ví dụ: ${geos.slice(0, 6).join(", ")}.`
    );
  }
  const pts = s.points.filter((p) => p.geo === geo).sort((a, b) => a.year - b.year);
  if (pts.length < 6) throw new DetectorError(`Chỉ có ${pts.length} năm cho "${geo}" — cần ít nhất 6.`);

  const ts = pts.map((p) => p.year);
  const vs = pts.map((p) => p.value);
  const last = pts[pts.length - 1];

  // Kỷ lục: giá trị năm cuối cao/thấp nhất kể từ năm nào
  let highSince = pts[0].year;
  let lowSince = pts[0].year;
  for (let i = pts.length - 2; i >= 0; i--) {
    if (pts[i].value >= last.value) {
      highSince = pts[i + 1].year;
      break;
    }
    if (i === 0) highSince = pts[0].year;
  }
  for (let i = pts.length - 2; i >= 0; i--) {
    if (pts[i].value <= last.value) {
      lowSince = pts[i + 1].year;
      break;
    }
    if (i === 0) lowSince = pts[0].year;
  }
  const isMax = vs.every((v) => v <= last.value);
  const isMin = vs.every((v) => v >= last.value);

  // Điểm gãy: mỗi đoạn ≥ 3 năm
  let best: { k: number; total: number } | null = null;
  for (let k = 3; k <= pts.length - 3; k++) {
    const total = sse(ts.slice(0, k), vs.slice(0, k)) + sse(ts.slice(k), vs.slice(k));
    if (!best || total < best.total) best = { k, total };
  }
  const whole = ols(ts, vs)!;
  let breakInfo: Record<string, unknown> = { co_diem_gay: false };
  if (best) {
    const before = ols(ts.slice(0, best.k), vs.slice(0, best.k))!;
    const after = ols(ts.slice(best.k), vs.slice(best.k))!;
    const improvement = 1 - best.total / sse(ts, vs);
    const reversed = Math.sign(before.slope) !== Math.sign(after.slope) && before.slope !== 0 && after.slope !== 0;
    breakInfo = {
      co_diem_gay: improvement >= 0.5 || reversed,
      nam_bat_dau_doan_sau: pts[best.k].year,
      do_doc_truoc: roundSig(before.slope),
      do_doc_sau: roundSig(after.slope),
      dao_chieu: reversed,
      sai_so_giam_khi_tach_doan: roundSig(improvement, 2),
      nam_so_bo_trong_doan_sau: pts.slice(best.k).filter((p) => p.provisional).map((p) => p.year),
    };
  }

  const summary: Record<string, unknown> = {
    chuoi: s.label,
    don_vi: s.unit ?? "không rõ",
    dia_phuong: geo === "nation" ? "Cả nước" : provinceName(geo, s.scheme ?? "63"),
    khoang_nam: `${pts[0].year}–${last.year}`,
    so_nam: pts.length,
    gia_tri_dau: { nam: pts[0].year, gia_tri: roundSig(pts[0].value, 4) },
    gia_tri_cuoi: { nam: last.year, gia_tri: roundSig(last.value, 4), so_bo: !!last.provisional },
    cao_nhat_ke_tu: isMax ? `cao nhất cả chuỗi (${pts[0].year}–${last.year})` : highSince < last.year ? highSince : "không phải đỉnh",
    thap_nhat_ke_tu: isMin ? `thấp nhất cả chuỗi (${pts[0].year}–${last.year})` : lowSince < last.year ? lowSince : "không phải đáy",
    do_doc_ca_chuoi_moi_nam: roundSig(whole.slope),
    diem_gay: breakInfo,
    ghi_chu: s.notes,
  };

  const chart = {
    type: "line",
    yLabel: `${s.label}${s.unit ? ` (${s.unit})` : ""}`,
    series: [{ name: summary.dia_phuong, points: pts.map((p) => [p.year, p.value]) }],
  };
  return {
    summary,
    chart,
    tests: best ? 1 : 0,
    data: {
      geo,
      first: { year: pts[0].year, value: pts[0].value },
      last: { year: last.year, value: last.value, provisional: !!last.provisional },
      isMax,
      isMin,
      highSince: isMax ? pts[0].year : highSince,
      lowSince: isMin ? pts[0].year : lowSince,
      nYears: pts.length,
      breakYear: best ? pts[best.k].year : null,
      breakFlag: (breakInfo as { co_diem_gay?: boolean }).co_diem_gay ?? false,
      reversed: (breakInfo as { dao_chieu?: boolean }).dao_chieu ?? false,
      slopeBefore: (breakInfo as { do_doc_truoc?: number }).do_doc_truoc ?? null,
      slopeAfter: (breakInfo as { do_doc_sau?: number }).do_doc_sau ?? null,
    },
  };
}
