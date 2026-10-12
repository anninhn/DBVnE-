/**
 * Phép tính cho lớp tool MCP (THIET-KE-V8 mục 3b) — CODE THUẦN, không gọi AI.
 *
 * Mỗi phép ứng với một loại chuyện dữ liệu (change over time, contrast, outliers, factors,
 * intersections); drill down / zoom out là tham số `level` + `within`, không phải phép riêng.
 * Diễn biến và quan hệ dùng lại nguyên `analyze()` của bậc 1 (đã qua 2 vòng thử) — không viết
 * bản thứ hai có thể lệch.
 *
 * Mọi kết quả kèm `nguon` (dataset, nơi phát hành, chỉ tiêu, đơn vị, chiều đã chốt) và đánh dấu
 * năm sơ bộ. Số trả về là số đã làm tròn — câu trả lời chỉ được chép từ đây (check.ts kiểm).
 */

import { loadDataset } from "../load";
import { sliceTable, SliceError, type Slice, type SlicePoint } from "../dataset";
import { matchGeo, PROVINCES_63, provinceName, regionName, regionOf, REGIONS } from "../geo";
import { roundSig } from "../stats";
import { analyze } from "../v2/analyze";
import { longestNation, populationEntry, type Catalog, type CatalogEntry } from "../v2/catalog";
import { fillSlots, isExtensive } from "../v2/rules";
import { barChart, lineChart, type ChartSpec } from "./chart";

export type Level = "nation" | "region" | "province";

export class OpError extends Error {}

const TOTAL_VALUES = /^(tổng số|tổng|chung|toàn bộ|cả nước)$/i;
const MIN_OUTLIER_N = 10;
/** Ngưỡng ngoại lệ theo z bền (Iglewicz & Hoaglin): |z| > 3,5 */
const OUTLIER_Z = 3.5;

// ── Nguồn gốc ────────────────────────────────────────────────────────────────

export interface Provenance {
  id: string;
  chi_tieu: string;
  don_vi: string | null;
  dataset: string;
  slug: string;
  noi_phat_hanh: string;
  chieu_da_chot: Record<string, string>;
  nam_so_bo: number[];
}

export function provenance(e: CatalogEntry): Provenance {
  return {
    id: e.id,
    chi_tieu: e.label,
    don_vi: e.unit ?? null,
    dataset: e.datasetTitle,
    slug: e.slug,
    noi_phat_hanh: e.source,
    chieu_da_chot: e.dims,
    nam_so_bo: e.provisional,
  };
}

// ── Truy cập dữ liệu ─────────────────────────────────────────────────────────

export function entryOf(cat: Catalog, id: string): CatalogEntry {
  const e = cat.entries.find((x) => x.id === id);
  if (!e) throw new OpError(`Không có chỉ tiêu "${id}". Lấy id từ find_measures.`);
  return e;
}

async function slice(e: CatalogEntry, level: Level, dims?: Record<string, string>): Promise<Slice> {
  const { table, profile } = await loadDataset(e.slug);
  try {
    return sliceTable(table, profile, { slug: e.slug, measure: e.measure, dims: dims ?? e.dims, level });
  } catch (err) {
    if (err instanceof SliceError) throw new OpError(err.message);
    throw err;
  }
}

function geoName(code: string, level: Level, scheme?: string): string {
  if (code === "nation") return "Cả nước";
  if (level === "region") return regionName(code);
  return provinceName(code, scheme === "34" ? "34" : "63");
}

/** Tên nơi (có dấu, tự do) → mã. Nhận cả mã sẵn. */
export function resolvePlace(raw: string): { level: Level; code: string } {
  const r = raw.trim();
  if (/^(cả nước|toàn quốc|nation)$/i.test(r)) return { level: "nation", code: "nation" };
  if (REGIONS.some((x) => x.code === r)) return { level: "region", code: r };
  if (PROVINCES_63.some((x) => x.code === r)) return { level: "province", code: r };
  const m = matchGeo(r);
  if (m && (m.level === "province" || m.level === "region")) return { level: m.level, code: m.code };
  if (m?.level === "nation") return { level: "nation", code: "nation" };
  throw new OpError(`Không nhận ra địa danh "${raw}". Dùng tên tỉnh / vùng chính thức.`);
}

/** Lọc tỉnh theo vùng (drill down). Chỉ có cây tỉnh → vùng cho danh mục 63. */
function within(points: SlicePoint[], region: string | undefined, scheme?: string): SlicePoint[] {
  if (!region) return points;
  const code = resolvePlace(region);
  if (code.level !== "region") throw new OpError(`"within" phải là một vùng; "${region}" là ${code.level}.`);
  if (scheme === "34") throw new OpError("Chưa có bảng tỉnh 34 → vùng; drill down theo vùng chỉ làm được với danh mục 63 tỉnh.");
  return points.filter((p) => (p.region ?? regionOf(p.geo)) === code.code);
}

function latestYear(points: SlicePoint[], year?: number): number {
  const years = [...new Set(points.map((p) => p.year))].sort((a, b) => a - b);
  if (!years.length) throw new OpError("Lát dữ liệu rỗng.");
  if (year === undefined) return years[years.length - 1];
  if (!years.includes(year)) throw new OpError(`Không có số năm ${year}. Các năm có: ${years.join(", ")}.`);
  return year;
}

const r3 = (v: number) => roundSig(v, 4);
const pct = (a: number, b: number) => (a ? roundSig(((b - a) / Math.abs(a)) * 100, 3) : null);

// ── Các phép ─────────────────────────────────────────────────────────────────

export interface OpArgs {
  ids: string[];
  level?: Level;
  within?: string;
  year?: number;
  from_year?: number;
  to_year?: number;
  places?: string[];
  dim?: string;
  window?: number;
}

/** Chuỗi giá trị theo năm của một nơi (mặc định cả nước) */
async function series(cat: Catalog, a: OpArgs) {
  const e = entryOf(cat, a.ids[0]);
  const place = a.places?.[0] ? resolvePlace(a.places[0]) : { level: "nation" as Level, code: "nation" };
  const s = await slice(e, place.level);
  const pts = s.points.filter((p) => p.geo === place.code).sort((x, y) => x.year - y.year);
  if (!pts.length) throw new OpError(`Không có số của ${geoName(place.code, place.level)} cho chỉ tiêu này.`);
  return {
    noi: geoName(place.code, place.level, s.scheme),
    chuoi: pts.map((p) => ({ nam: p.year, gia_tri: r3(p.value), ...(p.provisional ? { so_bo: true } : {}) })),
    nguon: [provenance(e)],
  };
}

/** Thay đổi giữa hai năm, cho một hoặc nhiều nơi */
async function change(cat: Catalog, a: OpArgs) {
  const e = entryOf(cat, a.ids[0]);
  const places = a.places?.length ? a.places.map(resolvePlace) : [{ level: "nation" as Level, code: "nation" }];
  const out = [];
  for (const pl of places) {
    const s = await slice(e, pl.level);
    const pts = s.points.filter((p) => p.geo === pl.code).sort((x, y) => x.year - y.year);
    if (pts.length < 2) throw new OpError(`${geoName(pl.code, pl.level)}: chưa đủ hai năm có số.`);
    const from = a.from_year !== undefined ? pts.find((p) => p.year >= a.from_year!) : pts[0];
    const to = a.to_year !== undefined ? [...pts].reverse().find((p) => p.year <= a.to_year!) : pts[pts.length - 1];
    if (!from || !to || from.year >= to.year) throw new OpError(`${geoName(pl.code, pl.level)}: không có cặp năm hợp lệ trong khoảng đã cho.`);
    out.push({
      noi: geoName(pl.code, pl.level, s.scheme),
      tu: { nam: from.year, gia_tri: r3(from.value), ...(from.provisional ? { so_bo: true } : {}) },
      den: { nam: to.year, gia_tri: r3(to.value), ...(to.provisional ? { so_bo: true } : {}) },
      chenh_lech: r3(to.value - from.value),
      thay_doi_phan_tram: pct(from.value, to.value),
      huong: to.value > from.value ? "tăng" : to.value < from.value ? "giảm" : "không đổi",
      ...(a.from_year !== undefined && from.year !== a.from_year ? { ghi_chu: `không có số năm ${a.from_year}, dùng năm gần nhất sau đó là ${from.year}` } : {}),
    });
  }
  return { ket_qua: out, nguon: [provenance(e)] };
}

/** Diễn biến cả nước: đoạn tăng/giảm, kỷ lục, đổi chiều — dùng nguyên logic bậc 1 */
async function trend(cat: Catalog, a: OpArgs, sessionP: number[]) {
  const e = entryOf(cat, a.ids[0]);
  if (!e.nation) throw new OpError("Chỉ tiêu không có số cả nước — dùng series với một tỉnh cụ thể.");
  const alt = longestNation(cat, e);
  const res = await analyze([{ entry: e, concept: e.label }], {
    level: "nation",
    sessionP,
    families: { relation: false, trend: true, trendIsContext: false },
    window: a.window,
    fromYear: a.from_year,
    nationAlt: alt !== e ? new Map([[e.id, alt]]) : undefined,
  });
  const f = res.findings[0];
  if (!f) throw new OpError("Chuỗi cả nước dưới 4 năm — chưa đủ để nói diễn biến.");
  const raw = f.raw as { segments: unknown[]; record: string | null; tie: boolean; gaps: string[]; nominal: boolean; series: { year: number; value: number; provisional?: boolean }[] };
  return {
    tom_tat: fillSlots(f.templateText, f.slots, f.unit),
    cac_doan: (raw.segments as { pct: number }[]).map((g) => ({ ...g, pct: roundSig(g.pct, 3) })),
    ky_luc: raw.record,
    ngang_muc_cu: raw.tie,
    nam_thieu: raw.gaps,
    gia_hien_hanh_chua_tru_lam_phat: raw.nominal,
    chuoi: raw.series.map((p) => ({ nam: p.year, gia_tri: r3(p.value), ...(p.provisional ? { so_bo: true } : {}) })),
    canh_bao: f.badges.filter((b) => b.kind === "warn").map((b) => b.text),
    luu_y: f.caveat,
    nguon: f.sources.map((s) => provenance(s.slug === alt.slug ? alt : e)),
  };
}

/** Xếp hạng (contrast). Số tuyệt đối có dân số → trả thêm bảng theo đầu người. */
async function rank(cat: Catalog, a: OpArgs) {
  const e = entryOf(cat, a.ids[0]);
  const level = a.level ?? "province";
  if (level === "nation") throw new OpError("Xếp hạng cần level province hoặc region.");
  const s = await slice(e, level);
  const pts = within(s.points, a.within, s.scheme);
  const year = latestYear(pts, a.year);
  const at = pts.filter((p) => p.year === year);
  if (at.length < 3) throw new OpError(`Năm ${year} chỉ có ${at.length} nơi có số — chưa đủ để xếp hạng.`);
  const table = (vals: { geo: string; value: number }[]) =>
    vals
      .slice()
      .sort((x, y) => y.value - x.value)
      .map((p, i, arr) => ({ hang: arr.findIndex((q) => q.value === p.value) + 1, noi: geoName(p.geo, level, s.scheme), gia_tri: r3(p.value), _i: i }))
      .map(({ _i, ...r }) => r);
  const tong = table(at);
  const out: Record<string, unknown> = {
    nam: year,
    cap: level,
    ...(a.within ? { trong: a.within } : {}),
    so_noi: at.length,
    cao_nhat: tong.slice(0, 5),
    thap_nhat: tong.slice(-5).reverse(),
    toan_bang: tong,
    gap_lan_cao_nhat_so_thap_nhat: tong[tong.length - 1].gia_tri > 0 ? r3(tong[0].gia_tri / tong[tong.length - 1].gia_tri) : null,
    ...(at.some((p) => p.provisional) ? { so_bo: true } : {}),
  };
  const nguon = [provenance(e)];
  const pop = populationEntry(cat);
  if (level === "province" && isExtensive(e.label, e.unit) && pop) {
    const ps = await slice(pop, "province");
    const pm = new Map(ps.points.filter((p) => p.year === year).map((p) => [p.geo, p.value]));
    const per = at.flatMap((p) => (pm.get(p.geo) ? [{ geo: p.geo, value: p.value / pm.get(p.geo)! }] : []));
    if (per.length >= 3) {
      const t = table(per);
      const per1000 = /nghìn/i.test(pop.unit ?? "");
      out.theo_dau_nguoi = { don_vi: `${e.unit ?? "?"} trên ${per1000 ? "1.000 người" : pop.unit ?? "người"}`, ghi_chu: `chia cho "${pop.label}" (${pop.unit ?? "?"}) cùng năm — tổng và tỷ lệ có thể xếp khác nhau`, cao_nhat: t.slice(0, 5), thap_nhat: t.slice(-5).reverse() };
      nguon.push(provenance(pop));
    }
  }
  return { ...out, nguon };
}

/** So sánh vài nơi tại một năm */
async function compare(cat: Catalog, a: OpArgs) {
  const e = entryOf(cat, a.ids[0]);
  if (!a.places || a.places.length < 2) throw new OpError("compare cần ít nhất 2 nơi trong `places`.");
  const places = a.places.map(resolvePlace);
  const rows = [];
  let year: number | undefined = a.year;
  const byLevel = new Map<Level, Slice>();
  for (const pl of places) if (!byLevel.has(pl.level)) byLevel.set(pl.level, await slice(e, pl.level));
  if (year === undefined) {
    const sets = places.map((pl) => new Set(byLevel.get(pl.level)!.points.filter((p) => p.geo === pl.code).map((p) => p.year)));
    const common = [...sets[0]].filter((y) => sets.every((st) => st.has(y))).sort((x, y) => x - y);
    if (!common.length) throw new OpError("Các nơi không có năm chung.");
    year = common[common.length - 1];
  }
  for (const pl of places) {
    const s = byLevel.get(pl.level)!;
    const p = s.points.find((q) => q.geo === pl.code && q.year === year);
    if (!p) throw new OpError(`${geoName(pl.code, pl.level)} không có số năm ${year}.`);
    const peers = s.points.filter((q) => q.year === year).sort((x, y) => y.value - x.value);
    rows.push({ noi: geoName(pl.code, pl.level, s.scheme), gia_tri: r3(p.value), ...(pl.level !== "nation" ? { hang: peers.findIndex((q) => q.value === p.value) + 1, tren_tong_so_noi: peers.length } : {}), ...(p.provisional ? { so_bo: true } : {}) });
  }
  const [x, y] = rows;
  return {
    nam: year,
    cac_noi: rows,
    chenh_lech_noi_1_tru_noi_2: r3(x.gia_tri - y.gia_tri),
    ti_so_noi_1_tren_noi_2: y.gia_tri ? r3(x.gia_tri / y.gia_tri) : null,
    nguon: [provenance(e)],
  };
}

/** Ngoại lệ theo z bền (trung vị + MAD) */
async function outlier(cat: Catalog, a: OpArgs) {
  const e = entryOf(cat, a.ids[0]);
  const level = a.level ?? "province";
  const s = await slice(e, level);
  const pts = within(s.points, a.within, s.scheme);
  const year = latestYear(pts, a.year);
  const at = pts.filter((p) => p.year === year);
  if (at.length < MIN_OUTLIER_N) throw new OpError(`Năm ${year} chỉ có ${at.length} nơi — cần ít nhất ${MIN_OUTLIER_N} để nói ngoại lệ.`);
  const vals = at.map((p) => p.value).sort((x, y) => x - y);
  const med = (v: number[]) => (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2);
  const m = med(vals);
  const mad = med(vals.map((v) => Math.abs(v - m)).sort((x, y) => x - y));
  if (!mad) throw new OpError("Hơn nửa số nơi có cùng giá trị — không đo được độ phân tán.");
  const flagged = at
    .map((p) => ({ noi: geoName(p.geo, level, s.scheme), gia_tri: r3(p.value), z_ben: roundSig((0.6745 * (p.value - m)) / mad, 3) }))
    .filter((p) => Math.abs(p.z_ben) > OUTLIER_Z)
    .sort((x, y) => Math.abs(y.z_ben) - Math.abs(x.z_ben));
  return {
    nam: year,
    so_noi: at.length,
    trung_vi: r3(m),
    do_lech_tuyet_doi_trung_vi: r3(mad),
    nguong: `|z bền| > ${OUTLIER_Z}`.replace(".", ","),
    ngoai_le: flagged,
    toan_bang: at.map((p) => ({ noi: geoName(p.geo, level, s.scheme), gia_tri: r3(p.value) })).sort((x, y) => y.gia_tri - x.gia_tri),
    ...(flagged.length ? {} : { ghi_chu: "Không nơi nào vượt ngưỡng ngoại lệ." }),
    nguon: [provenance(e)],
  };
}

/** Thành phần (factors): các giá trị của một chiều so với "Tổng số". Kiểm các phần có cộng thành tổng không. */
async function composition(cat: Catalog, a: OpArgs) {
  const e = entryOf(cat, a.ids[0]);
  const { profile } = await loadDataset(e.slug);
  const measure = profile.measures.find((m) => m.name === e.measure)!;
  const dims = profile.dims.filter((d) => d.total > 1 && d.values.some((v) => TOTAL_VALUES.test(v.trim())));
  const d = a.dim ? dims.find((x) => x.name === a.dim) : dims[0];
  if (!d) throw new OpError(`Dataset không có chiều nào có giá trị "Tổng số" để chia phần${a.dim ? ` (chiều "${a.dim}")` : ""}. Các chiều: ${profile.dims.map((x) => x.name).join(", ") || "không có"}.`);
  if (!measure.additive) throw new OpError(`"${measure.name}" không cộng được (${measure.additiveReason}) — không chia thành phần chiếm tỷ trọng.`);
  const place = a.places?.[0] ? resolvePlace(a.places[0]) : { level: "nation" as Level, code: "nation" };
  const total = d.values.find((v) => TOTAL_VALUES.test(v.trim()))!;
  const parts = d.values.filter((v) => v !== total);
  const valueAt = async (v: string) => {
    const s = await slice(e, place.level, { ...e.dims, [d.name]: v }).catch(() => null);
    return s?.points.filter((p) => p.geo === place.code) ?? [];
  };
  const tot = await valueAt(total);
  const year = latestYear(tot, a.year);
  const T = tot.find((p) => p.year === year)!.value;
  const rows = [];
  for (const v of parts) {
    const p = (await valueAt(v)).find((q) => q.year === year);
    if (p) rows.push({ phan: v, gia_tri: r3(p.value), ty_trong_phan_tram: roundSig((p.value / T) * 100, 3) });
  }
  const sum = rows.reduce((acc, r) => acc + r.gia_tri, 0);
  const sumOk = Math.abs(sum - T) <= 0.01 * Math.abs(T);
  return {
    nam: year,
    noi: geoName(place.code, place.level),
    chieu: d.name,
    tong: r3(T),
    cac_phan: rows.sort((x, y) => y.gia_tri - x.gia_tri),
    cac_phan_cong_bang_tong: sumOk,
    ...(sumOk ? {} : { canh_bao: `Các phần cộng lại ${r3(sum)} ≠ tổng ${r3(T)} — các phần chồng lấn hoặc thiếu; không nói "chiếm X% tổng".` }),
    nguon: [provenance(e)],
  };
}

/** Điểm cắt (intersections): hai chuỗi cùng đơn vị, hoặc một chỉ tiêu ở hai nơi */
async function crossing(cat: Catalog, a: OpArgs) {
  type Line = { ten: string; pts: Map<number, number>; e: CatalogEntry };
  const lines: Line[] = [];
  if (a.ids.length >= 2) {
    const [e1, e2] = [entryOf(cat, a.ids[0]), entryOf(cat, a.ids[1])];
    if ((e1.unit ?? "") !== (e2.unit ?? "")) throw new OpError(`Hai chỉ tiêu khác đơn vị ("${e1.unit ?? "?"}" vs "${e2.unit ?? "?"}") — so điểm cắt không có nghĩa.`);
    const place = a.places?.[0] ? resolvePlace(a.places[0]) : { level: "nation" as Level, code: "nation" };
    for (const e of [e1, e2]) {
      const s = await slice(e, place.level);
      lines.push({ ten: e.label, e, pts: new Map(s.points.filter((p) => p.geo === place.code).map((p) => [p.year, p.value])) });
    }
  } else {
    const e = entryOf(cat, a.ids[0]);
    if (!a.places || a.places.length < 2) throw new OpError("crossing cần 2 id (cùng đơn vị) hoặc 1 id + 2 nơi trong `places`.");
    for (const raw of a.places.slice(0, 2)) {
      const pl = resolvePlace(raw);
      const s = await slice(e, pl.level);
      lines.push({ ten: geoName(pl.code, pl.level, s.scheme), e, pts: new Map(s.points.filter((p) => p.geo === pl.code).map((p) => [p.year, p.value])) });
    }
  }
  const [A, B] = lines;
  const years = [...A.pts.keys()].filter((y) => B.pts.has(y)).sort((x, y) => x - y);
  if (years.length < 3) throw new OpError(`Hai chuỗi chỉ có ${years.length} năm chung — chưa đủ.`);
  const diff = years.map((y) => A.pts.get(y)! - B.pts.get(y)!);
  const cuts = [];
  for (let i = 1; i < years.length; i++) {
    if (Math.sign(diff[i]) !== Math.sign(diff[i - 1]) && diff[i] !== 0) {
      cuts.push({
        giua_nam: [years[i - 1], years[i]],
        truoc: { [A.ten]: r3(A.pts.get(years[i - 1])!), [B.ten]: r3(B.pts.get(years[i - 1])!) },
        sau: { [A.ten]: r3(A.pts.get(years[i])!), [B.ten]: r3(B.pts.get(years[i])!) },
        vuot_len: diff[i] > 0 ? A.ten : B.ten,
      });
    }
  }
  return {
    chuoi_1: A.ten,
    chuoi_2: B.ten,
    nam_chung: [years[0], years[years.length - 1]],
    diem_cat: cuts,
    ...(cuts.length ? {} : { ghi_chu: `Không có điểm cắt: ${diff[0] > 0 ? A.ten : B.ten} luôn cao hơn trong ${years.length} năm chung.` }),
    chenh_lech_nam_cuoi: r3(diff[diff.length - 1]),
    nguon: [...new Set(lines.map((l) => l.e))].map(provenance),
    luu_y: "Tool chỉ tìm điểm cắt. Vì sao cắt nhau là câu hỏi cho chuyên gia / phóng viên, không suy từ số.",
  };
}

/** Gộp lên cấp trên (zoom out): tỉnh → vùng. Chỉ cộng khi cộng được; không thì dùng số vùng chính thức nếu có. */
async function aggregate(cat: Catalog, a: OpArgs) {
  const e = entryOf(cat, a.ids[0]);
  const { profile } = await loadDataset(e.slug);
  const measure = profile.measures.find((m) => m.name === e.measure)!;
  const official = await slice(e, "region").catch(() => null);
  if (official?.points.length) {
    const year = latestYear(official.points, a.year);
    return {
      nam: year,
      cach_lam: "số cấp vùng do nơi phát hành công bố (không tự cộng)",
      cac_vung: official.points.filter((p) => p.year === year).map((p) => ({ vung: regionName(p.geo), gia_tri: r3(p.value) })).sort((x, y) => y.gia_tri - x.gia_tri),
      nguon: [provenance(e)],
    };
  }
  if (!measure.additive) {
    throw new OpError(`"${measure.name}" không cộng được (${measure.additiveReason}) và dataset không có số cấp vùng — gộp cần mẫu số, chưa có. Dùng rank với within để so tỉnh trong vùng.`);
  }
  const s = await slice(e, "province");
  if (s.scheme === "34") throw new OpError("Chưa có bảng tỉnh 34 → vùng.");
  const year = latestYear(s.points, a.year);
  const at = s.points.filter((p) => p.year === year);
  const by = new Map<string, { sum: number; n: number }>();
  for (const p of at) {
    const r = p.region ?? regionOf(p.geo);
    if (!r) continue;
    const cur = by.get(r) ?? { sum: 0, n: 0 };
    by.set(r, { sum: cur.sum + p.value, n: cur.n + 1 });
  }
  const need = (r: string) => PROVINCES_63.filter((p) => p.region === r).length;
  return {
    nam: year,
    cach_lam: "cộng các tỉnh trong vùng (số đo cộng được)",
    cac_vung: [...by.entries()]
      .map(([r, v]) => ({ vung: regionName(r), gia_tri: r3(v.sum), so_tinh_co_so: v.n, so_tinh_cua_vung: need(r), ...(v.n < need(r) ? { thieu_tinh: true } : {}) }))
      .sort((x, y) => y.gia_tri - x.gia_tri),
    nguon: [provenance(e)],
  };
}

/** Quan hệ hai chỉ tiêu theo tỉnh, từng vùng — dùng nguyên logic bậc 1 (BH trên cả phiên) */
async function relation(cat: Catalog, a: OpArgs, sessionP: number[]) {
  if (a.ids.length < 2) throw new OpError("relation cần 2 id.");
  const [e1, e2] = [entryOf(cat, a.ids[0]), entryOf(cat, a.ids[1])];
  const res = await analyze(
    [
      { entry: e1, concept: e1.label },
      { entry: e2, concept: e2.label },
    ],
    { level: "province", year: a.year, sessionP, families: { relation: true, trend: false, trendIsContext: false }, population: populationEntry(cat) }
  );
  sessionP.push(...res.newP);
  const f = res.findings[0];
  if (!f) return { ket_qua: "Không có quan hệ đủ chắc giữa hai chỉ tiêu trên các tỉnh (cả nước lẫn từng vùng).", so_phep_kiem_trong_phien: res.testsInSession, nguon: [provenance(e1), provenance(e2)] };
  const raw = f.raw as { pooled: { n: number; r: number }; pooledQ: number | null; regions: { name: string; n: number; r: number; q: number | null }[] };
  return {
    tom_tat: fillSlots(f.templateText, f.slots, f.unit),
    nam: Number(f.slots.nam),
    ca_nuoc: { so_tinh: raw.pooled.n, r: roundSig(raw.pooled.r, 2), q_bh: raw.pooledQ === null ? null : roundSig(raw.pooledQ, 2) },
    tung_vung: raw.regions.map((r) => ({ vung: r.name, so_tinh: r.n, r: roundSig(r.r, 2), q_bh: r.q === null ? null : roundSig(r.q, 2) })),
    canh_bao: f.badges.filter((b) => b.kind === "warn").map((b) => b.text),
    luu_y: f.caveat,
    nguon: [provenance(e1), provenance(e2)],
  };
}

export const OPS = ["series", "change", "trend", "rank", "compare", "outlier", "composition", "crossing", "aggregate", "relation"] as const;
export type Op = (typeof OPS)[number];

export async function runOp(cat: Catalog, op: Op, a: OpArgs, sessionP: number[]): Promise<Record<string, unknown>> {
  const out = await runOpRaw(cat, op, a, sessionP);
  const chart = chartFor(op, out);
  return chart ? { ...out, bieu_do: chart } : out;
}

type Row = { noi: string; gia_tri: number; nam?: number; so_bo?: boolean };

/** Biểu đồ cho từng phép — dựng từ CHÍNH kết quả trả về (số đã làm tròn), không đọc lại dữ liệu */
function chartFor(op: Op, r: Record<string, unknown>): ChartSpec | null {
  const src = (r.nguon as Provenance[] | undefined) ?? [];
  const p = src[0];
  if (!p) return null;
  const source = [...new Set(src.map((x) => `${x.noi_phat_hanh} — ${x.dataset}`))].join("; ");
  // Tên cột chung chung ("Tổng số", "Bình quân chung") — nghĩa nằm ở tên dataset
  const generic = /^(tổng số|tổng|chung|bình quân chung|cả nước|giá trị)$/i.test(p.chi_tieu.trim());
  const label = (x: Provenance) => (/^(tổng số|tổng|chung|bình quân chung|cả nước|giá trị)$/i.test(x.chi_tieu.trim()) ? x.dataset : x.chi_tieu);
  const name = generic ? p.dataset : p.chi_tieu;
  const unit = p.don_vi;
  switch (op) {
    case "series":
    case "trend": {
      const noi = (r.noi as string) ?? "Cả nước";
      const rows = (r.chuoi as Row[]).map((x) => ({ noi, nam: x.nam!, gia_tri: x.gia_tri, so_bo: x.so_bo }));
      return lineChart(rows, { title: `${name} — ${noi}`, unit, source });
    }
    case "change": {
      const rows = (r.ket_qua as { noi: string; tu: Row; den: Row }[]).flatMap((k) => [
        { noi: k.noi, nam: k.tu.nam!, gia_tri: k.tu.gia_tri, so_bo: k.tu.so_bo },
        { noi: k.noi, nam: k.den.nam!, gia_tri: k.den.gia_tri, so_bo: k.den.so_bo },
      ]);
      return lineChart(rows, { title: `${name}: thay đổi giữa hai năm`, unit, source });
    }
    case "rank":
      return barChart((r.toan_bang as Row[]).map((x) => ({ nhan: x.noi, gia_tri: x.gia_tri })), {
        title: `${name}, năm ${r.nam}${r.trong ? ` — ${r.trong}` : ""}`,
        unit,
        source,
      });
    case "compare":
      return barChart((r.cac_noi as Row[]).map((x) => ({ nhan: x.noi, gia_tri: x.gia_tri })), { title: `${name}, năm ${r.nam}`, unit, source });
    case "outlier": {
      const out = new Set((r.ngoai_le as Row[]).map((x) => x.noi));
      return barChart((r.toan_bang as Row[]).map((x) => ({ nhan: x.noi, gia_tri: x.gia_tri, nhom: out.has(x.noi) ? "ngoại lệ" : "các nơi khác" })), {
        title: `${name}, năm ${r.nam} — nơi khác hẳn phần còn lại`,
        unit,
        source,
        colorTitle: "Nhóm",
      });
    }
    case "composition":
      return barChart((r.cac_phan as { phan: string; ty_trong_phan_tram: number }[]).map((x) => ({ nhan: x.phan, gia_tri: x.ty_trong_phan_tram })), {
        title: `${name}: tỷ trọng theo ${r.chieu}, năm ${r.nam}${r.noi && r.noi !== "Cả nước" ? ` — ${r.noi}` : ""}`,
        unit: "% của tổng",
        source,
      });
    case "aggregate":
      return barChart((r.cac_vung as { vung: string; gia_tri: number }[]).map((x) => ({ nhan: x.vung, gia_tri: x.gia_tri })), { title: `${name} theo vùng, năm ${r.nam}`, unit, source });
    case "crossing": {
      // dữ liệu chuỗi không nằm trong kết quả crossing → không vẽ (gọi series cho từng nơi)
      return null;
    }
    case "relation": {
      const v = r.tung_vung as { vung: string; r: number; so_tinh: number }[] | undefined;
      if (!v) return null;
      return barChart(
        v.map((x) => ({ nhan: `${x.vung} (${x.so_tinh} tỉnh)`, gia_tri: x.r, nhom: x.so_tinh < 8 ? "dưới 8 tỉnh — không kiểm định" : "đủ tỉnh" })),
        { title: `Tương quan giữa ${src.map(label).join(" và ")} trong từng vùng, năm ${r.nam}`, unit: "hệ số tương quan r (−1 đến 1)", source, sort: "desc", colorTitle: "Số tỉnh" }
      );
    }
    default:
      return null;
  }
}

async function runOpRaw(cat: Catalog, op: Op, a: OpArgs, sessionP: number[]): Promise<Record<string, unknown>> {
  if (!a.ids?.length) throw new OpError("Thiếu `ids`.");
  switch (op) {
    case "series":
      return series(cat, a);
    case "change":
      return change(cat, a);
    case "trend":
      return trend(cat, a, sessionP);
    case "rank":
      return rank(cat, a);
    case "compare":
      return compare(cat, a);
    case "outlier":
      return outlier(cat, a);
    case "composition":
      return composition(cat, a);
    case "crossing":
      return crossing(cat, a);
    case "aggregate":
      return aggregate(cat, a);
    case "relation":
      return relation(cat, a, sessionP);
    default:
      throw new OpError(`Phép "${op}" không có. Có: ${OPS.join(", ")}.`);
  }
}

// ── Loại chuyện kể được (describe_measure) ───────────────────────────────────

export interface StoryType {
  loai: string;
  ke_duoc: boolean;
  phep: string[];
  ly_do: string;
}

export async function storyTypes(cat: Catalog, e: CatalogEntry): Promise<StoryType[]> {
  const { profile } = await loadDataset(e.slug);
  const measure = profile.measures.find((m) => m.name === e.measure);
  const nYears = e.nation?.years.length ?? 0;
  const nProv = e.province?.n ?? 0;
  const regionRows = profile.geoLevels.regions > 0;
  const totalDim = profile.dims.find((d) => d.total > 1 && d.values.some((v) => TOTAL_VALUES.test(v.trim())));
  const sameUnit = cat.entries.filter((x) => x.slug === e.slug && x.id !== e.id && (x.unit ?? "") === (e.unit ?? "")).length;
  const alt = longestNation(cat, e);
  const T = (loai: string, ok: boolean, phep: string[], yes: string, no: string): StoryType => ({ loai, ke_duoc: ok, phep, ly_do: ok ? yes : no });
  return [
    T("change_over_time", nYears >= 4 || (e.province?.years.length ?? 0) >= 4, ["trend", "change", "series"], `cả nước ${alt.nation?.years.length ?? nYears} năm${alt !== e ? " (có chuỗi dài hơn cùng chỉ tiêu, trend tự dùng)" : ""}`, "dưới 4 năm có số"),
    T("contrast", nProv >= 3 || regionRows, ["rank", "compare"], `${nProv} tỉnh${regionRows ? " + số cấp vùng" : ""}`, "không có số theo tỉnh / vùng"),
    T("outliers", nProv >= MIN_OUTLIER_N, ["outlier"], `${nProv} tỉnh`, `dưới ${MIN_OUTLIER_N} nơi có số`),
    T("factors", !!totalDim && !!measure?.additive, ["composition"], `chiều "${totalDim?.name}" có "Tổng số" và số đo cộng được`, !totalDim ? "không có chiều nào chia phần với giá trị Tổng số" : `số đo không cộng được (${measure?.additiveReason})`),
    T("intersections", nProv >= 2 || sameUnit > 0, ["crossing"], "so được hai nơi theo thời gian, hoặc với chỉ tiêu khác cùng đơn vị", "chỉ có một chuỗi"),
    T("drill_down", nProv >= 3 && e.scheme !== "34", ["rank/outlier với level=province, within=<vùng>"], "cây tỉnh → vùng (danh mục 63)", e.scheme === "34" ? "chưa có bảng tỉnh 34 → vùng" : "không có số theo tỉnh"),
    T("zoom_out", regionRows || (!!measure?.additive && nProv >= 3 && e.scheme !== "34"), ["aggregate"], regionRows ? "dataset có số cấp vùng chính thức" : "cộng các tỉnh (số đo cộng được)", nProv < 3 ? "không có số theo tỉnh / vùng" : `không có số cấp vùng và ${measure?.additive ? "danh mục 34 chưa có cây vùng" : `số đo không cộng được (${measure?.additiveReason}) — gộp cần mẫu số`}`),
    T("relation", nProv >= 20, ["relation"], "đủ tỉnh để tương quan với chỉ tiêu khác cùng cấp", "chưa đủ tỉnh"),
  ];
}

