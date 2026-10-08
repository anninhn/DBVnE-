/**
 * Hiểu một dataset bảng và cắt "lát dữ liệu" — phần THUẦN (không I/O) của việc
 * đọc tại chỗ. I/O (metadata, R2, cache) nằm ở `load.ts`.
 *
 * Vai trò cột suy TẤT ĐỊNH theo nội dung — đây là chuẩn mà 480/480 file NSO trong
 * kho đang theo (đầu ra của data/scripts/nso_pxweb_to_tidy.py): mỗi cột là chiều
 * (chữ), thời gian, ghi chú, hoặc cột đo (toàn số). Không AI đoán.
 */

import { parseNumberWithSchema, type NumberSchema } from "@/lib/parse/number";
import { detectDecimalFormat } from "@/lib/parse/decimal-detect";
import type { DataDictionaryEntry } from "@/lib/types/dataset";
import {
  matchGeo,
  NAMES_ONLY_IN_63,
  PROVINCES_34,
  regionOf,
  type GeoMatch,
  type ProvinceScheme,
} from "./geo";

export interface RawTable {
  slug: string;
  title: string;
  source: string;
  yearRange: number[];
  dictionary: DataDictionaryEntry[];
  header: string[];
  rows: string[][];
}

export type ColumnRole = "geo" | "time" | "note" | "measure" | "dim";

export interface MeasureInfo {
  name: string;
  unit?: string;
  /** Cộng được qua tỉnh hay không — quyết định có gộp 63 → 34 bằng phép cộng được không */
  additive: boolean;
  additiveReason: string;
  min: number;
  max: number;
  schema: NumberSchema;
}

export interface DatasetProfile {
  slug: string;
  title: string;
  source: string;
  columns: { name: string; role: ColumnRole }[];
  geoColumn?: string;
  timeColumn?: string;
  /** Danh mục tỉnh: 63 (có tên tỉnh đã biến mất), 34, hoặc không xác định được */
  scheme?: ProvinceScheme | "unknown";
  geoLevels: { nation: boolean; regions: number; provinces: number };
  years: number[];
  provisionalYears: number[];
  dims: { name: string; values: string[]; total: number }[];
  measures: MeasureInfo[];
  warnings: string[];
}

const TIME_COLUMNS = new Set(["nam", "namhoc", "thang", "quy", "thoidiem", "kysosanh", "giaidoan"]);

function colKey(name: string): string {
  return name
    .replace(/[ĐđÐð]/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

const MISSING = new Set(["", "..", "...", "-", "–", "x", "X"]);

function isMissing(v: string | undefined): boolean {
  return v === undefined || MISSING.has(v.trim());
}

/** Năm đầu tiên trong ô thời gian: "2024", "Sơ bộ 2024", "2024-2025" (năm học → năm bắt đầu). */
export function parseYear(raw: string): number | null {
  const m = raw.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

function isProvisional(raw: string, note?: string): boolean {
  return /sơ bộ|ước tính|\(\*\)/i.test(raw) || /sơ bộ|ước/i.test(note ?? "");
}

/** Đơn vị: lấy từ dictionary, không có thì từ ngoặc cuối tên cột "Dân số (Nghìn người)". */
function unitOf(name: string, dict?: DataDictionaryEntry): string | undefined {
  if (dict?.unit) return dict.unit;
  const m = name.match(/\(([^()]+)\)\s*$/);
  return m ? m[1] : undefined;
}

/**
 * Chỉ tiêu cộng được qua tỉnh? Không chắc → coi là KHÔNG (an toàn: harness chỉ cảnh
 * báo thay vì cộng sai một tỷ lệ).
 */
function additiveOf(name: string, unit?: string): { additive: boolean; reason: string } {
  const k = colKey(`${name} ${unit ?? ""}`);
  const nonAdditive = [
    "tyle", "tysuat", "tyso", "binhquan", "chiso", "matdo", "toc", "hesogini", "gini",
    "phantram", "trungbinh", "nangsuat", "thunhap", "tuoitho", "diem",
  ];
  for (const w of nonAdditive) {
    if (k.includes(w)) return { additive: false, reason: `tên/đơn vị chứa "${w}"` };
  }
  if (/%/.test(`${name} ${unit ?? ""}`)) return { additive: false, reason: "đơn vị %" };
  // "so…" chỉ tính khi đứng đầu tên ("Số bác sĩ", "Số doanh nghiệp")
  if (k.startsWith("so")) return { additive: true, reason: 'tên bắt đầu bằng "Số"' };
  const additive = ["tong", "sanluong", "dientich", "danso", "giatri", "vondautu", "doanhthu"];
  for (const w of additive) {
    if (k.includes(w)) return { additive: true, reason: `tên chứa "${w}"` };
  }
  return { additive: false, reason: "không chắc — mặc định không cộng" };
}

function numberSchemaFor(name: string, dict: DataDictionaryEntry | undefined, samples: string[]): NumberSchema {
  if (dict?.decimal_char) return { decimal_char: dict.decimal_char, group_char: dict.group_char };
  const det = detectDecimalFormat(samples.slice(0, 200));
  if (det.schema) return det.schema;
  // Mặc định của kho: số kiểu Việt "1.234,5" (480/480 file NSO)
  return { decimal_char: ",", group_char: "." };
}

/** Hiểu cấu trúc một bảng. Không ném lỗi — mọi bất thường vào `warnings`. */
export function profileTable(t: RawTable): DatasetProfile {
  const warnings: string[] = [];
  const dictBy = new Map(t.dictionary.map((d) => [d.column_name, d]));
  const columns: { name: string; role: ColumnRole }[] = [];
  const measures: MeasureInfo[] = [];
  let geoColumn: string | undefined;
  let timeColumn: string | undefined;

  t.header.forEach((name, ci) => {
    const vals = t.rows.map((r) => r[ci]).filter((v) => !isMissing(v));
    const key = colKey(name);
    if (key === "ghichu") {
      columns.push({ name, role: "note" });
      return;
    }
    if (TIME_COLUMNS.has(key) && !timeColumn) {
      timeColumn = name;
      columns.push({ name, role: "time" });
      return;
    }
    if (vals.length === 0) {
      columns.push({ name, role: "dim" });
      return;
    }
    // Địa lý: đa số giá trị nhận ra được và có ít nhất 5 tỉnh/vùng khác nhau.
    if (!geoColumn) {
      const distinct = [...new Set(vals)];
      const matched = distinct.filter((v) => matchGeo(v));
      if (matched.length >= 5 && matched.length / distinct.length >= 0.6) {
        geoColumn = name;
        columns.push({ name, role: "geo" });
        return;
      }
    }
    const schema = numberSchemaFor(name, dictBy.get(name), vals);
    const nums = vals.map((v) => parseNumberWithSchema(v, schema));
    const ok = nums.filter((n): n is number => n !== null);
    if (ok.length / vals.length >= 0.95) {
      const unit = unitOf(name, dictBy.get(name));
      const add = additiveOf(name, unit);
      measures.push({
        name,
        unit,
        additive: add.additive,
        additiveReason: add.reason,
        min: Math.min(...ok),
        max: Math.max(...ok),
        schema,
      });
      if (ok.length < vals.length) {
        warnings.push(`Cột "${name}": ${vals.length - ok.length} ô không đọc được thành số, bị bỏ qua.`);
      }
      columns.push({ name, role: "measure" });
      return;
    }
    columns.push({ name, role: "dim" });
  });

  const gi = geoColumn ? t.header.indexOf(geoColumn) : -1;
  const ti = timeColumn ? t.header.indexOf(timeColumn) : -1;
  const ni = t.header.findIndex((h) => colKey(h) === "ghichu");

  // Địa lý
  const geoLevels = { nation: false, regions: 0, provinces: 0 };
  let scheme: DatasetProfile["scheme"];
  if (gi >= 0) {
    const regions = new Set<string>();
    const provinces = new Set<string>();
    const unknown = new Set<string>();
    let historic = false;
    for (const r of t.rows) {
      const v = r[gi];
      if (isMissing(v)) continue;
      const m = matchGeo(v);
      if (!m) unknown.add(v);
      else if (m.level === "nation") geoLevels.nation = true;
      else if (m.level === "region") regions.add(m.code);
      else if (m.level === "province") provinces.add(m.code);
      else if (m.level === "historic") historic = true;
    }
    geoLevels.regions = regions.size;
    geoLevels.provinces = provinces.size;
    const only63 = [...provinces].filter((c) => NAMES_ONLY_IN_63.has(c));
    if (only63.length > 0) scheme = "63";
    else if (provinces.size >= 30) scheme = "34";
    else scheme = "unknown";
    if (unknown.size) {
      warnings.push(
        `Cột địa lý có ${unknown.size} giá trị không thuộc tỉnh/vùng nào, bị loại khỏi phân tích: ${[...unknown].slice(0, 5).map((u) => `"${u}"`).join(", ")}${unknown.size > 5 ? "…" : ""}`
      );
    }
    if (historic) warnings.push(`Có dòng "Hà Tây" (tỉnh nhập vào Hà Nội từ 2008), bị loại khỏi phân tích.`);
    if (scheme === "63") warnings.push("Dữ liệu theo danh mục 63 tỉnh cũ (trước sáp nhập 2025).");
  }

  // Thời gian
  const years = new Set<number>();
  const provisional = new Set<number>();
  if (ti >= 0) {
    for (const r of t.rows) {
      const y = parseYear(r[ti] ?? "");
      if (y === null) continue;
      years.add(y);
      if (isProvisional(r[ti] ?? "", ni >= 0 ? r[ni] : undefined)) provisional.add(y);
    }
  } else if (t.yearRange.length) {
    t.yearRange.forEach((y) => years.add(y));
    warnings.push("Không có cột thời gian — năm lấy từ metadata (bảng chụp một thời điểm).");
  }
  const yearList = [...years].sort((a, b) => a - b);
  if (yearList.length >= 2) {
    const missing: number[] = [];
    for (let y = yearList[0]; y <= yearList[yearList.length - 1]; y++) if (!years.has(y)) missing.push(y);
    const steps = new Set(yearList.slice(1).map((y, i) => y - yearList[i]));
    if (missing.length && steps.size === 1 && !steps.has(1)) {
      warnings.push(`Chuỗi ${[...steps][0]} năm một lần (${yearList.join(", ")}) — không có số các năm giữa.`);
    } else if (missing.length && missing.length <= 10) warnings.push(`Thiếu năm: ${missing.join(", ")}.`);
    else if (missing.length > 10) warnings.push(`Chuỗi thưa: thiếu ${missing.length} năm trong khoảng ${yearList[0]}–${yearList[yearList.length - 1]}.`);
  }
  if (provisional.size) warnings.push(`Số sơ bộ ở năm: ${[...provisional].sort().join(", ")}.`);

  // Chiều
  const dims = columns
    .filter((c) => c.role === "dim")
    .map((c) => {
      const i = t.header.indexOf(c.name);
      const values = [...new Set(t.rows.map((r) => r[i]).filter((v) => !isMissing(v)))];
      return { name: c.name, values: values.slice(0, 40), total: values.length };
    });

  for (const m of measures) {
    if (/giá hiện hành/i.test(`${m.name} ${t.title}`)) {
      warnings.push(`"${m.name}" theo giá hiện hành (chưa khử lạm phát) — chỉ so sánh giữa các tỉnh trong cùng năm.`);
    }
  }
  if (measures.length === 0) warnings.push("Không có cột số nào — dataset này chưa phân tích được.");

  return {
    slug: t.slug,
    title: t.title,
    source: t.source,
    columns,
    geoColumn,
    timeColumn,
    scheme,
    geoLevels,
    years: yearList,
    provisionalYears: [...provisional].sort(),
    dims,
    measures,
    warnings,
  };
}

// ── Lát dữ liệu ──────────────────────────────────────────────────────────────

export interface SliceSpec {
  slug: string;
  /** Tên cột đo */
  measure: string;
  /** Lọc theo giá trị chiều: { "Cấp quản lý": "Sở Y tế quản lý" } */
  dims?: Record<string, string>;
  /** Cấp địa lý lấy ra. Mặc định: province nếu có tỉnh, không thì nation */
  level?: "province" | "region" | "nation";
  /** Danh mục tỉnh muốn dùng. Mặc định: danh mục gốc của dữ liệu */
  scheme?: ProvinceScheme;
  /** Chỉ lấy dữ liệu của một tỉnh/vùng (mã) */
  geo?: string;
}

export interface SlicePoint {
  geo: string; // mã tỉnh/vùng, hoặc "nation"
  region?: string;
  year: number;
  value: number;
  provisional?: boolean;
}

export interface Slice {
  spec: SliceSpec;
  label: string;
  unit?: string;
  scheme?: ProvinceScheme;
  points: SlicePoint[];
  notes: string[];
}

export class SliceError extends Error {}

const TOTAL_VALUES = /^(tổng số|tổng|chung|toàn bộ|cả nước)$/i;

/** Cắt một lát dữ liệu theo spec. Ném `SliceError` với lời giải thích cụ thể khi spec chưa đủ. */
export function sliceTable(t: RawTable, p: DatasetProfile, spec: SliceSpec): Slice {
  const notes: string[] = [];
  const mi = t.header.indexOf(spec.measure);
  const measure = p.measures.find((m) => m.name === spec.measure);
  if (mi < 0 || !measure) {
    throw new SliceError(
      `Không có cột đo "${spec.measure}" trong ${p.slug}. Các cột đo: ${p.measures.map((m) => `"${m.name}"`).join(", ")}.`
    );
  }

  // Mỗi chiều phải được chốt về một giá trị — không thì cộng lẫn các phân tổ.
  const dimFilter: { idx: number; value: string }[] = [];
  for (const d of p.dims) {
    const chosen = spec.dims?.[d.name];
    if (chosen !== undefined) {
      if (!d.values.includes(chosen) && d.total <= d.values.length) {
        throw new SliceError(`Chiều "${d.name}" không có giá trị "${chosen}". Có: ${d.values.map((v) => `"${v}"`).join(", ")}.`);
      }
      dimFilter.push({ idx: t.header.indexOf(d.name), value: chosen });
    } else if (d.total > 1) {
      const total = d.values.find((v) => TOTAL_VALUES.test(v.trim()));
      if (total) {
        dimFilter.push({ idx: t.header.indexOf(d.name), value: total });
        notes.push(`Chiều "${d.name}" mặc định lấy "${total}".`);
      } else {
        throw new SliceError(
          `Chiều "${d.name}" có ${d.total} giá trị, phải chọn một qua dims: ${d.values.slice(0, 15).map((v) => `"${v}"`).join(", ")}${d.total > 15 ? "…" : ""}.`
        );
      }
    }
  }

  const gi = p.geoColumn ? t.header.indexOf(p.geoColumn) : -1;
  const ti = p.timeColumn ? t.header.indexOf(p.timeColumn) : -1;
  const ni = t.header.findIndex((h) => colKey(h) === "ghichu");
  const level = spec.level ?? (p.geoLevels.provinces > 0 ? "province" : "nation");
  const fallbackYear = p.years.length === 1 ? p.years[0] : null;

  const raw: SlicePoint[] = [];
  for (const r of t.rows) {
    if (dimFilter.some((f) => r[f.idx] !== f.value)) continue;
    const v = parseNumberWithSchema(r[mi] ?? "", measure.schema);
    if (v === null) continue;
    const year = ti >= 0 ? parseYear(r[ti] ?? "") : fallbackYear;
    if (year === null) continue;
    let m: GeoMatch | null = { level: "nation" };
    if (gi >= 0) m = matchGeo(r[gi] ?? "");
    if (!m) continue;
    if (m.level !== level) continue;
    const geo = m.level === "nation" ? "nation" : (m as { code: string }).code;
    raw.push({
      geo,
      region: m.level === "province" ? regionOf(geo) : undefined,
      year,
      value: v,
      provisional: ti >= 0 && isProvisional(r[ti] ?? "", ni >= 0 ? r[ni] : undefined),
    });
  }

  // Trùng (tỉnh, năm) sau khi lọc = còn chiều chưa chốt → báo, không cộng bừa.
  const seen = new Set<string>();
  for (const pt of raw) {
    const k = `${pt.geo}|${pt.year}`;
    if (seen.has(k)) throw new SliceError(`Lát dữ liệu còn trùng (${pt.geo}, ${pt.year}) — cần chốt thêm chiều qua dims.`);
    seen.add(k);
  }

  let points = raw;
  let scheme: ProvinceScheme | undefined = p.scheme === "63" || p.scheme === "34" ? p.scheme : undefined;

  if (level === "province" && spec.scheme === "34" && p.scheme === "63") {
    if (!measure.additive) {
      throw new SliceError(
        `"${measure.name}" không cộng được (${measure.additiveReason}) nên không gộp thẳng lên 34 tỉnh. Dùng danh mục 63 tỉnh, hoặc trình bày theo tỉnh cũ và nêu tỉnh mới gồm những tỉnh nào.`
      );
    }
    const by = new Map<string, Map<number, number>>();
    for (const pt of raw) {
      if (!by.has(pt.geo)) by.set(pt.geo, new Map());
      by.get(pt.geo)!.set(pt.year, pt.value);
    }
    const years = [...new Set(raw.map((x) => x.year))];
    points = [];
    for (const np of PROVINCES_34) {
      for (const y of years) {
        const vals = np.members.map((c) => by.get(c)?.get(y));
        if (vals.some((v) => v === undefined)) continue; // thiếu một tỉnh cũ → không cộng
        points.push({ geo: np.code, year: y, value: (vals as number[]).reduce((a, b) => a + b, 0) });
      }
    }
    scheme = "34";
    notes.push("Gộp 63 → 34 tỉnh bằng phép cộng các tỉnh cũ (Nghị quyết 202/2025/QH15).");
  } else if (spec.scheme && p.scheme && spec.scheme !== p.scheme) {
    throw new SliceError(`Dữ liệu theo danh mục ${p.scheme} tỉnh, không chuyển sang ${spec.scheme} được.`);
  }

  if (spec.geo) {
    points = points.filter((x) => x.geo === spec.geo);
    if (!points.length) throw new SliceError(`Không có dữ liệu cho "${spec.geo}" ở cấp ${level}.`);
  }

  const dimLabel = Object.entries(spec.dims ?? {}).map(([k, v]) => `${k}: ${v}`).join("; ");
  return {
    spec,
    label: `${measure.name}${dimLabel ? ` (${dimLabel})` : ""} — ${p.title}`,
    unit: measure.unit,
    scheme,
    points,
    notes,
  };
}
