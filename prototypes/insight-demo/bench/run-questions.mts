/**
 * Chạy bộ câu hỏi giả lập qua luồng chuẩn (bậc 1) và ghi TOÀN BỘ dấu vết để rà soát.
 *
 *   cd <repo>; set -a; source .env.local; set +a
 *   node --experimental-strip-types --import ./prototypes/insight-demo/bench/node-loader/register.mjs \
 *     prototypes/insight-demo/bench/run-questions.mts <tên-vòng> [q01,q02…]
 *
 * Ra: bench/runs/<tên-vòng>/trace.jsonl (mỗi câu một dòng) + meta.json (commit, thời điểm).
 * Gọi đúng các hàm mà /api/insight/ask gọi — không có đường đi riêng cho test.
 */
import { promises as fs } from "fs";
import { execSync } from "child_process";
import path from "path";
import { loadCatalog } from "@/lib/insight/v2/catalog";
import { understand } from "@/lib/insight/v2/understand";
import { selectMeasures } from "@/lib/insight/v2/select";
import { analyze } from "@/lib/insight/v2/analyze";
import { narrate } from "@/lib/insight/v2/narrate";
import { planAnalysis, scopeOf } from "@/lib/insight/v2/plan";

const BENCH = path.dirname(new URL(import.meta.url).pathname);
const runName = process.argv[2] ?? `run-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
const only = process.argv[3]?.split(",");
const outDir = path.join(BENCH, "runs", runName);
await fs.mkdir(outDir, { recursive: true });

const { questions } = JSON.parse(await fs.readFile(path.join(BENCH, "questions.json"), "utf8"));
const cat = (await loadCatalog())!;
if (!cat) throw new Error("Chưa có danh mục chỉ tiêu (data/insight/catalog.json)");

const git = (c: string) => execSync(`git ${c}`, { encoding: "utf8" }).trim();
await fs.writeFile(
  path.join(outDir, "meta.json"),
  JSON.stringify({ run: runName, startedAt: new Date().toISOString(), commit: git("rev-parse --short HEAD"), dirty: git("status --porcelain src/lib/insight") !== "", catalogBuiltAt: cat.builtAt, catalogEntries: cat.entries.length }, null, 2)
);
const traceFile = path.join(outDir, "trace.jsonl");
await fs.writeFile(traceFile, "");

const lbl = (e: { label: string; datasetTitle: string; slug: string } | null | undefined) => (e ? { label: e.label, dataset: e.datasetTitle, slug: e.slug } : null);

for (const q of questions.filter((x: { id: string }) => !only || only.includes(x.id))) {
  const t0 = Date.now();
  const tr: Record<string, unknown> = { id: q.id, question: q.question, at: new Date().toISOString() };
  try {
    const u = await understand(q.question);
    tr.understand = { concepts: u.concepts, level: u.level, scheme: u.scheme, route: u.route, askBack: u.askBack ?? null, agreement: u.agreement, intents: u.intents, places: u.places, timeframe: u.timeframe, raw: u.raw, ms: u.ms };
    if (u.route === "chuan") {
      const sel = await selectMeasures(cat, u.concepts, u.level);
      tr.select = {
        ms: sel.ms,
        commonYears: sel.commonYears,
        notes: sel.notes,
        degraded: sel.degraded ?? null,
        picks: sel.picks.map((p) => ({
          concept: p.concept,
          recommended: lbl(p.recommended),
          alternatives: p.alternatives.map(lbl),
          notRecommended: p.notRecommended.map((n) => ({ ...lbl(n.entry), reason: n.reason })),
          candidates: p.candidates.map((e) => e.label + " | " + e.datasetTitle),
        })),
      };
      const plan = planAnalysis(
        cat,
        u,
        sel.picks.map((p) => ({ concept: p.concept, entry: p.recommended, others: [...p.alternatives, ...p.candidates.slice(0, 6)] }))
      );
      tr.plan = { families: plan.opts.families, window: plan.opts.window ?? null, fromYear: plan.opts.fromYear ?? null, year: plan.opts.year ?? null, missing: plan.missingConcepts, nationAlt: [...plan.opts.nationAlt!.values()].map((e) => e.datasetTitle) };
      if (!plan.picks.length) {
        tr.scope = scopeOf(u, plan, []);
        tr.outcome = "no_measure";
      } else {
        const a = await analyze(plan.picks, { ...plan.opts, sessionP: [] });
        const n = await narrate(q.question, a.findings, u.level === "province");
        tr.analyze = { ms: a.ms, ran: a.ranAnalyses, tests: a.testsInSession };
        tr.narrate = { ms: n.ms };
        tr.scope = scopeOf(u, plan, a.findings);
        tr.cards = a.findings.map((f) => {
          const c = n.cards.find((x) => x.findingId === f.id)!;
          return { family: f.familyLabel, score: f.score, title: c.title, text: c.text, writtenBy: c.writtenBy, violations: c.violations, badges: f.badges.map((b) => b.text), caveat: f.caveat, points: f.points, slots: f.slots, sources: f.sources, chart: f.chart, raw: f.raw };
        });
        tr.outcome = a.findings.length ? "cards" : "no_finding";
      }
    } else {
      tr.outcome = "ask_back";
    }
  } catch (err) {
    tr.outcome = "error";
    tr.error = (err as Error).message;
  }
  tr.totalMs = Date.now() - t0;
  await fs.appendFile(traceFile, JSON.stringify(tr) + "\n");
  const cards = (tr.cards as { family: string; title: string }[] | undefined) ?? [];
  console.log(`${q.id} ${tr.outcome} ${(Number(tr.totalMs) / 1000).toFixed(1)}s | ${((tr.understand as { concepts?: string[] })?.concepts ?? []).join(", ")} | ${cards.map((c) => `[${c.family}] ${c.title}`).join(" // ")}`);
}
console.log(`\n→ ${traceFile}`);
