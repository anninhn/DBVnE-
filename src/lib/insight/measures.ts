/**
 * Đề xuất CHỈ TIÊU (cột đo) cho từng khái niệm trong câu hỏi — thay cho việc để model
 * đọc mô tả 20 dataset rồi tự chọn cả dataset.
 *
 * Vì sao: đo 2026-10-08, hỏi "thu nhập và mức sinh giữa các tỉnh", Discovery (model
 * chọn) lúc bỏ sót dataset mức sinh, lúc chọn "Chênh lệch thu nhập… giữa các nhóm" —
 * dataset CHỈ có thu nhập nhóm thấp nhất/cao nhất — dù tên cột nằm ngay trong ngữ cảnh.
 * Phóng viên không có cách nào biết kho còn lựa chọn tốt hơn, nên hệ thống phải tự so.
 *
 * Chia việc:
 *  - CODE: tìm dataset, MỞ từng file, đo dữ kiện của từng cột đo (cấp địa lý, số tỉnh,
 *    năm, nhóm con hay số chung, danh mục tỉnh) và xếp hạng theo LUẬT cấu trúc.
 *  - AI: chỉ nói cột nào ĐÚNG NGHĨA khái niệm (select). So chữ không làm được việc này:
 *    "tử vong trẻ sơ sinh" khớp chữ "đăng ký khai sinh" hơn "tỷ suất chết của trẻ em";
 *    "di cư" chỉ gồm từ 2 chữ cái nên bộ tách từ bỏ hết.
 */

import { searchDatasets } from "@/lib/retrieval";
import { loadDataset } from "./load";
import { sliceTable, SliceError, type DatasetProfile, type RawTable } from "./dataset";
import type { ProvinceScheme } from "./geo";

export type Level = "province" | "region" | "nation";

export interface MeasureOption {
  id: string;
  concept: string;
  slug: string;
  datasetTitle: string;
  measure: string;
  unit?: string;
  provinces: number;
  scheme?: ProvinceScheme;
  years: number[];
  /** Chỉ tiêu của một nhóm con thay vì số chung — null = số chung */
  subgroup: string | null;
  /** Lý do KHÔNG dùng được về mặt cấu trúc — null = dùng được */
  excluded: string | null;
  /** Hạng của dataset trong tìm kiếm (1 = đầu) */
  searchRank: number;
}

export interface ConceptCandidates {
  concept: string;
  query: string;
  options: MeasureOption[];
  degraded?: string;
}

export interface ConceptSuggestion {
  concept: string;
  recommended: MeasureOption | null;
  alternatives: MeasureOption[];
  /** Đúng nghĩa nhưng không dùng được / không nên dùng — để phóng viên thấy vì sao */
  rejected: MeasureOption[];
}

export interface SuggestResult {
  level: Level;
  concepts: ConceptSuggestion[];
  commonYears: number[] | null;
  notes: string[];
}

const SUBGROUP_PATTERNS: [RegExp, string][] = [
  [/nhóm (thu nhập )?(thấp|cao) nhất|nhóm [1-5]\b|ngũ phân vị/i, "chỉ một nhóm thu nhập, không phải mức chung"],
  [/so với nhóm|chênh lệch|\(lần\)/i, "tỷ lệ chênh lệch giữa các nhóm, không phải mức chung"],
  [/(^|\s)(nam|nữ)(\s|$|\))/i, "chỉ một giới"],
  [/thành thị|nông thôn/i, "chỉ thành thị hoặc nông thôn"],
];

function subgroupOf(measure: string): string | null {
  for (const [re, why] of SUBGROUP_PATTERNS) if (re.test(measure)) return why;
  return null;
}

const MIN_PROVINCES = 50;
const SEARCH_LIMIT = 12;
const MAX_OPTIONS = 30;

function factsFor(table: RawTable, profile: DatasetProfile, measure: string, level: Level) {
  try {
    const sl = sliceTable(table, profile, { slug: profile.slug, measure, level });
    const geos = new Set(sl.points.map((p) => p.geo));
    const years = [...new Set(sl.points.map((p) => p.year))].sort((a, b) => a - b);
    return { provinces: level === "province" ? geos.size : 0, years, scheme: sl.scheme, needsDims: [] as string[] };
  } catch (e) {
    if (e instanceof SliceError) {
      const dims = profile.dims.filter((d) => d.total > 1).map((d) => d.name);
      return { provinces: 0, years: [] as number[], scheme: undefined, needsDims: dims };
    }
    throw e;
  }
}

/** Bước 1 (code): mọi cột đo của các dataset tìm được cho một khái niệm, kèm dữ kiện đo được. */
export async function listCandidates(concept: string, level: Level, idPrefix: string): Promise<ConceptCandidates> {
  const query = level === "province" ? `${concept} theo tỉnh` : concept;
  const found = await searchDatasets({ query, limit: SEARCH_LIMIT, caller: "insight:suggest" });
  const options: MeasureOption[] = [];
  for (const [i, hit] of found.results.entries()) {
    let loaded;
    try {
      loaded = await loadDataset(hit.slug);
    } catch {
      continue; // không phải CSV / quá lớn
    }
    const { table, profile } = loaded;
    for (const m of profile.measures) {
      const f = factsFor(table, profile, m.name, level);
      let excluded: string | null = null;
      if (f.needsDims.length) excluded = `phải chọn phân tổ (${f.needsDims.join(", ")})`;
      else if (level === "province" && f.provinces < MIN_PROVINCES)
        excluded = f.provinces ? `chỉ có ${f.provinces} tỉnh` : "không có số theo tỉnh";
      else if (!f.years.length) excluded = "không có năm nào có số";
      options.push({
        id: `${idPrefix}${String(options.length + 1).padStart(2, "0")}`,
        concept,
        slug: profile.slug,
        datasetTitle: profile.title,
        measure: m.name,
        unit: m.unit,
        provinces: f.provinces,
        scheme: f.scheme,
        years: f.years,
        subgroup: subgroupOf(m.name),
        excluded,
        searchRank: i + 1,
      });
      if (options.length >= MAX_OPTIONS) break;
    }
    if (options.length >= MAX_OPTIONS) break;
  }
  return { concept, query, options, ...(found.degraded ? { degraded: found.degraded } : {}) };
}

function overlap(a: number[], b: number[]): number[] {
  const s = new Set(a);
  return b.filter((y) => s.has(y));
}

/**
 * Bước 2 (code, sau khi AI chọn cột ĐÚNG NGHĨA): xếp hạng theo luật cấu trúc.
 *  1. dùng được (đúng cấp địa lý, đủ tỉnh, có năm)
 *  2. số chung trước nhóm con
 *  3. thứ tự AI đưa (mức đúng nghĩa)
 *  4. với ≥ 2 khái niệm: tổ hợp có năm chung (≥ 2 năm) và cùng danh mục tỉnh,
 *     ưu tiên nhiều năm chung, rồi mới nhất
 */
export function rankSelected(
  level: Level,
  candidates: ConceptCandidates[],
  chosenIds: Record<string, string[]>,
): SuggestResult {
  const notes: string[] = [];
  const per: ConceptSuggestion[] = candidates.map((c) => {
    const ids = chosenIds[c.concept] ?? [];
    const byId = new Map(c.options.map((o) => [o.id, o]));
    const relevant = ids.map((id) => byId.get(id)).filter((o): o is MeasureOption => !!o);
    const usable = relevant.filter((o) => !o.excluded);
    const ordered = [...usable.filter((o) => !o.subgroup), ...usable.filter((o) => o.subgroup)];
    const rejected = [...relevant.filter((o) => o.excluded), ...usable.filter((o) => o.subgroup && ordered[0] !== o)];
    return { concept: c.concept, recommended: ordered[0] ?? null, alternatives: ordered.slice(1, 4), rejected: rejected.slice(0, 4) };
  });

  if (per.length < 2 || per.some((p) => !p.recommended)) return { level, concepts: per, commonYears: null, notes };

  const pools = per.map((p) => [p.recommended!, ...p.alternatives.filter((a) => !a.subgroup)]);
  let best: { combo: MeasureOption[]; years: number[]; rankSum: number } | null = null;
  const walk = (i: number, combo: MeasureOption[], rankSum: number) => {
    if (i === pools.length) {
      const years = combo.slice(1).reduce((acc, o) => overlap(acc, o.years), combo[0].years);
      if (years.length < 2) return;
      if (new Set(combo.map((o) => o.scheme).filter(Boolean)).size > 1) return;
      const better =
        !best ||
        rankSum < best.rankSum ||
        (rankSum === best.rankSum && years.length > best.years.length) ||
        (rankSum === best.rankSum && years.length === best.years.length && years[years.length - 1] > best.years[best.years.length - 1]);
      if (better) best = { combo: [...combo], years, rankSum };
      return;
    }
    pools[i].forEach((o, k) => walk(i + 1, [...combo, o], rankSum + k));
  };
  walk(0, [], 0);

  if (!best) {
    notes.push("Không có tổ hợp chỉ tiêu nào có ít nhất 2 năm chung và cùng danh mục tỉnh.");
    return { level, concepts: per, commonYears: [], notes };
  }
  const b = best as { combo: MeasureOption[]; years: number[] };
  per.forEach((p, i) => {
    const pick = b.combo[i];
    if (pick !== p.recommended) {
      notes.push(`"${p.concept}": đề xuất "${pick.measure}" thay vì "${p.recommended!.measure}" để có năm chung với chỉ tiêu khác.`);
      p.alternatives = [p.recommended!, ...p.alternatives.filter((a) => a !== pick)].slice(0, 3);
      p.recommended = pick;
    }
  });
  return { level, concepts: per, commonYears: b.years, notes };
}

/** Bản tóm tắt gọn của một phương án để gửi AI (không gửi dữ liệu thô). */
export function compactOption(o: MeasureOption) {
  return {
    id: o.id,
    chi_tieu: o.measure,
    don_vi: o.unit ?? null,
    dataset: o.datasetTitle,
    so_tinh: o.provinces,
    nam: o.years.length ? `${o.years[0]}–${o.years[o.years.length - 1]} (${o.years.length} năm)` : "không có",
    nhom_con: o.subgroup,
    khong_dung_duoc: o.excluded,
  };
}
