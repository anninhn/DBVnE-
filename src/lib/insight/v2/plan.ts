/**
 * Nối hiểu câu hỏi + chọn chỉ tiêu → tham số phân tích + phạm vi trả lời. Dùng CHUNG
 * cho API (/api/insight/ask) và script chạy bộ câu hỏi — test đi đúng đường của app.
 */

import { longestNation, populationEntry, type Catalog, type CatalogEntry } from "./catalog";
import type { AnalysisPick, AnalyzeOpts, Finding } from "./analyze";
import { buildScope, familiesFor, type Scope } from "./scope";
import type { Understanding } from "./understand";

export interface Plan {
  picks: AnalysisPick[];
  missingConcepts: string[];
  opts: Omit<AnalyzeOpts, "sessionP" | "excludeProvisional">;
  measureNotes: string[];
}

/** `current`: khái niệm → chỉ tiêu đang dùng (null = kho không có) */
export function planAnalysis(cat: Catalog, u: Pick<Understanding, "intents" | "level" | "timeframe">, current: { concept: string; entry: CatalogEntry | null; others: CatalogEntry[] }[]): Plan {
  const picks = current.filter((c) => c.entry).map((c) => ({ entry: c.entry!, concept: c.concept }));
  const missingConcepts = current.filter((c) => !c.entry).map((c) => c.concept);
  const families = familiesFor(u.intents, picks.length, missingConcepts.length);
  const nationAlt = new Map<string, CatalogEntry>();
  for (const p of picks) {
    const alt = longestNation(cat, p.entry);
    if (alt !== p.entry) nationAlt.set(p.entry.id, alt);
  }
  // Cùng dataset, khác giá trị chiều (vd 3 thể suy dinh dưỡng) → nói đang dùng cái nào (vòng thử 1, q01)
  const siblings = (c: (typeof current)[number]) => [...new Set(c.others.filter((o) => o.slug === c.entry!.slug && o.id !== c.entry!.id).map((o) => o.label))];
  const measureNotes = current
    .filter((c) => c.entry && siblings(c).length)
    .map((c) => `"${c.concept}": đang dùng "${c.entry!.label}"; cùng dataset còn ${siblings(c).map((l) => `"${l}"`).join(", ")} — đổi ở chip.`);
  return {
    picks,
    missingConcepts,
    measureNotes,
    opts: {
      level: u.level,
      year: u.timeframe.year,
      window: u.timeframe.window,
      fromYear: u.timeframe.fromYear,
      families,
      population: populationEntry(cat),
      nationAlt,
    },
  };
}

export function scopeOf(u: Pick<Understanding, "intents" | "places" | "timeframe" | "scheme">, plan: Plan, findings: Finding[]): Scope {
  const fam = plan.opts.families!;
  return buildScope({
    intents: u.intents,
    places: u.places,
    timeframe: u.timeframe,
    scheme: u.scheme,
    missingConcepts: plan.missingConcepts,
    ran: {
      relation: findings.some((f) => f.family === "quan_he_theo_vung"),
      trend: findings.some((f) => f.family === "xu_huong" && !fam.trendIsContext),
      window: findings.some((f) => "nam_moc" in f.slots),
    },
    dataScheme: findings.find((f) => f.scheme)?.scheme ?? plan.picks[0]?.entry.scheme ?? null,
    measureNotes: plan.measureNotes,
    anyFinding: findings.length > 0,
  });
}
