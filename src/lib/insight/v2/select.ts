/**
 * AI 2 · Chọn chỉ tiêu ĐÚNG NGHĨA. Code tìm ứng viên trong danh mục; AI chỉ nói
 * ứng viên nào đúng nghĩa (tối đa 3 / khái niệm — bậc 0: token đầu ra là đòn bẩy tốc
 * độ chính, model từng liệt kê ~30 id); code xếp hạng theo luật cấu trúc.
 */

import { callModel } from "./llm";
import { searchMeasures, type Catalog, type CatalogEntry } from "./catalog";

export interface ConceptPick {
  concept: string;
  recommended: CatalogEntry | null;
  alternatives: CatalogEntry[];
  /** Ứng viên đúng nghĩa nhưng không nên dùng (nhóm con) — để phóng viên thấy vì sao */
  notRecommended: { entry: CatalogEntry; reason: string }[];
  candidates: CatalogEntry[];
}

export interface Selection {
  picks: ConceptPick[];
  commonYears: number[] | null;
  notes: string[];
  ms: number;
  degraded?: string;
}

const SYSTEM = "Bạn chọn chỉ tiêu thống kê đúng nghĩa cho phóng viên. Chỉ trả JSON hợp lệ.";
const MAX_CANDIDATES = 10;

function yearsText(y: number[]) {
  return y.length ? `${y[0]}-${y[y.length - 1]}` : "";
}

function provinceYears(e: CatalogEntry, level: "province" | "nation") {
  return (level === "province" ? e.province?.years : e.nation?.years) ?? [];
}

export async function selectMeasures(
  cat: Catalog,
  concepts: string[],
  level: "province" | "nation"
): Promise<Selection> {
  const t0 = Date.now();
  let degraded: string | undefined;
  const cands: Record<string, CatalogEntry[]> = {};
  for (const c of concepts) {
    const r = await searchMeasures(cat, c, level, MAX_CANDIDATES);
    cands[c] = r.entries;
    degraded ??= r.degraded;
  }

  // Id ngắn theo khái niệm để model trả gọn: a1, a2… / b1…
  const idMap = new Map<string, CatalogEntry>();
  const listing = concepts.map((c, ci) => ({
    khai_niem: c,
    ung_vien: cands[c].map((e, i) => {
      const id = `${String.fromCharCode(97 + ci)}${i + 1}`;
      idMap.set(id, e);
      return `${id}: ${e.label} | ${e.datasetTitle} | ${yearsText(provinceYears(e, level))}`;
    }),
  }));

  const prompt = `Với mỗi khái niệm, chọn TỐI ĐA 3 ứng viên ĐÚNG NGHĨA nhất (đúng nhất trước). Chỉ xét NGHĨA — bỏ ứng viên chỉ trùng chữ (vd "đăng ký khai sinh" không phải "tử vong trẻ sơ sinh"; "chỉ số giá sinh hoạt" không phải "mức sinh"). Không có ứng viên nào đúng nghĩa thì để mảng rỗng.
Trả: {"chon": {"<khái niệm>": ["a1", ...]}}
${JSON.stringify(listing)}`;
  const res = await callModel<{ chon?: Record<string, string[]> }>(SYSTEM, prompt);

  const picks: ConceptPick[] = concepts.map((c) => {
    const ids = (res.data?.chon?.[c] ?? []).slice(0, 3);
    const chosen = ids.map((id) => idMap.get(id)).filter((e): e is CatalogEntry => !!e && cands[c].includes(e));
    // Luật: số chung trước nhóm con
    const general = chosen.filter((e) => !e.subgroup);
    const sub = chosen.filter((e) => e.subgroup);
    const ordered = general.length ? general : sub;
    return {
      concept: c,
      recommended: ordered[0] ?? null,
      alternatives: ordered.slice(1),
      notRecommended: general.length ? sub.map((e) => ({ entry: e, reason: e.subgroup! })) : [],
      candidates: cands[c],
    };
  });

  // Khái niệm đồng nghĩa ("mức sinh" / "tỷ suất sinh") trỏ vào CÙNG chỉ tiêu → gộp làm một.
  // So theo chỉ tiêu được chọn chắc hơn so chữ (đo 2026-10-09: so chữ bỏ lọt cặp này).
  for (let i = picks.length - 1; i > 0; i--) {
    const dup = picks.slice(0, i).find((p) => p.recommended && p.recommended.id === picks[i].recommended?.id);
    if (dup) picks.splice(i, 1);
  }

  // Nhiều khái niệm → chọn tổ hợp có ≥ 2 năm chung, cùng danh mục tỉnh (ưu tiên thứ tự AI, rồi nhiều năm chung)
  const notes: string[] = [];
  let commonYears: number[] | null = null;
  if (picks.length >= 2 && picks.every((p) => p.recommended)) {
    const pools = picks.map((p) => [p.recommended!, ...p.alternatives]);
    let best: { combo: CatalogEntry[]; years: number[]; rank: number } | null = null;
    const walk = (i: number, combo: CatalogEntry[], rank: number) => {
      if (i === pools.length) {
        const years = combo.slice(1).reduce(
          (acc, e) => acc.filter((y) => provinceYears(e, level).includes(y)),
          provinceYears(combo[0], level)
        );
        if (years.length < 2) return;
        if (new Set(combo.map((e) => e.scheme).filter(Boolean)).size > 1) return;
        // Mọi phương án ở đây đều đã được AI xác nhận ĐÚNG NGHĨA → ưu tiên năm chung MỚI NHẤT (báo
        // chí cần số gần đây), rồi mới đến thứ tự AI, rồi số năm chung.
        // Đo 2026-10-09: không có luật này, "thu nhập bình quân đầu người" (đến 2018) thắng
        // "thu nhập một lao động" (đến 2024) chỉ vì AI xếp trước.
        const lastYear = years[years.length - 1];
        const bestLast = best ? best.years[best.years.length - 1] : -1;
        if (
          !best ||
          lastYear > bestLast ||
          (lastYear === bestLast && (rank < best.rank || (rank === best.rank && years.length > best.years.length)))
        )
          best = { combo, years, rank };
        return;
      }
      pools[i].forEach((e, k) => walk(i + 1, [...combo, e], rank + k));
    };
    walk(0, [], 0);
    if (best) {
      const b = best as { combo: CatalogEntry[]; years: number[] };
      commonYears = b.years;
      picks.forEach((p, i) => {
        if (b.combo[i] !== p.recommended) {
          notes.push(`"${p.concept}": đề xuất "${b.combo[i].label}" để có năm chung với chỉ tiêu khác.`);
          p.alternatives = [p.recommended!, ...p.alternatives.filter((e) => e !== b.combo[i])];
          p.recommended = b.combo[i];
        }
      });
    } else {
      commonYears = [];
      notes.push("Các chỉ tiêu đề xuất không có năm chung nào — chưa so được với nhau.");
    }
  }
  return { picks, commonYears, notes, ms: Date.now() - t0, ...(degraded ? { degraded } : {}) };
}
