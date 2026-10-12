import { NextRequest, NextResponse } from "next/server";

import { requireUserOr401 } from "@/lib/auth";
import { insightEnabled } from "@/lib/insight/local";
import { createSession, loadSession, withSession } from "@/lib/insight/session";
import { buildCatalog, loadCatalog, type CatalogEntry } from "@/lib/insight/v2/catalog";
import { understand } from "@/lib/insight/v2/understand";
import { selectMeasures } from "@/lib/insight/v2/select";
import { analyze } from "@/lib/insight/v2/analyze";
import { narrate } from "@/lib/insight/v2/narrate";
import { cleanUnit } from "@/lib/insight/v2/rules";
import { planAnalysis, scopeOf } from "@/lib/insight/v2/plan";
import type { Intent } from "@/lib/insight/v2/scope";

/**
 * Luồng chuẩn (bậc 1, THIET-KE-V6 mục 5) — code điều khiển, AI ở 3 điểm.
 *
 *   POST { question }                                   → hỏi mới
 *   POST { sessionId, pick: { concept, entryId } }      → đổi chỉ tiêu, chạy lại (không gọi AI 1–2)
 *   POST { sessionId, op: { excludeProvisional?, year? } } → thao tác hỏi tiếp
 *   POST { sessionId, label: { cardId, title, value } } → gắn nhãn thẻ (trả JSON, không chạy lại)
 *   → stream NDJSON: understood · measures · analysis · cards · timing
 *
 * Phân tích TỰ CHẠY NGAY với chỉ tiêu đề xuất; phóng viên đổi chip → chạy lại.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ev = Record<string, unknown> & { type: string };

function chip(e: CatalogEntry, level: "province" | "nation") {
  const years = (level === "province" ? e.province?.years : e.nation?.years) ?? [];
  return {
    id: e.id,
    label: e.label,
    dataset: e.datasetTitle,
    slug: e.slug,
    unit: cleanUnit(e.unit),
    provinces: e.province?.n ?? 0,
    years: years.length ? `${years[0]}–${years[years.length - 1]}` : "",
    subgroup: e.subgroup,
    provisional: e.provisional,
  };
}

export async function POST(req: NextRequest) {
  if (!insightEnabled()) return new NextResponse(null, { status: 404 });
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;
  const username = authCheck.user.username;

  const body = (await req.json().catch(() => null)) as {
    question?: string;
    sessionId?: string;
    pick?: { concept: string; entryId: string };
    op?: { excludeProvisional?: boolean; year?: number };
    label?: { cardId: string; title: string; value: "huu_ich" | "sai" | "da_biet" };
  } | null;
  if (!body?.question?.trim() && !body?.sessionId) return NextResponse.json({ error: "Thiếu câu hỏi" }, { status: 400 });

  if (body.sessionId && body.label) {
    const { cardId, title, value } = body.label;
    if (!["huu_ich", "sai", "da_biet"].includes(value)) return NextResponse.json({ error: "Nhãn không hợp lệ" }, { status: 400 });
    const s = await loadSession(body.sessionId);
    if (!s?.v2 || s.user !== username) return NextResponse.json({ error: "Phiên không tồn tại" }, { status: 404 });
    await withSession(body.sessionId, async (x) => {
      x.v2!.labels = [...(x.v2!.labels ?? []).filter((l) => l.cardId !== cardId), { at: new Date().toISOString(), cardId, title, value }];
    });
    return NextResponse.json({ ok: true });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: Ev) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      const t0 = Date.now();
      const ms: Record<string, number> = {};
      try {
        const cat = (await loadCatalog()) ?? (await buildCatalog());
        const byId = new Map(cat.entries.map((e) => [e.id, e]));

        let sessionId = body.sessionId;
        let v2: NonNullable<Awaited<ReturnType<typeof loadSession>>>["v2"];

        if (!sessionId) {
          // ── Hỏi mới: AI 1 + AI 2 ──
          const question = body.question!.trim();
          const s = await createSession(username, []);
          sessionId = s.id;
          send({ type: "session", sessionId });

          const u = await understand(question);
          ms.understand = u.ms;
          send({ type: "understood", concepts: u.concepts, level: u.level, scheme: u.scheme, agreement: u.agreement, intents: u.intents, places: u.places, timeframe: u.timeframe, raw: u.raw });
          if (u.route === "hoi_lai") {
            send({ type: "ask_back", text: u.askBack });
            send({ type: "timing", ms: { ...ms, total: Date.now() - t0 } });
            controller.close();
            return;
          }

          const sel = await selectMeasures(cat, u.concepts, u.level);
          ms.select = sel.ms;
          v2 = {
            question,
            concepts: u.concepts,
            level: u.level,
            scheme: u.scheme,
            intents: u.intents,
            places: u.places,
            timeframe: u.timeframe,
            picks: sel.picks.map((p) => ({
              concept: p.concept,
              current: p.recommended?.id ?? null,
              options: [...new Set([...(p.recommended ? [p.recommended.id] : []), ...p.alternatives.map((e) => e.id), ...p.candidates.slice(0, 6).map((e) => e.id)])],
            })),
            pvals: [],
            runs: [],
          };
          send({
            type: "measures",
            commonYears: sel.commonYears,
            notes: sel.notes,
            degraded: sel.degraded ?? null,
            concepts: sel.picks.map((p) => ({
              concept: p.concept,
              current: p.recommended ? chip(p.recommended, u.level) : null,
              options: v2!.picks.find((x) => x.concept === p.concept)!.options.map((id) => chip(byId.get(id)!, u.level)),
              notRecommended: p.notRecommended.map((n) => ({ ...chip(n.entry, u.level), reason: n.reason })),
            })),
          });
        } else {
          // ── Đổi chip / hỏi tiếp: không gọi AI 1–2 ──
          const s = await loadSession(sessionId);
          if (!s?.v2 || s.user !== username) throw new Error("Phiên không tồn tại");
          v2 = s.v2;
          if (body.pick) {
            const p = v2.picks.find((x) => x.concept === body.pick!.concept);
            if (p && byId.has(body.pick.entryId)) p.current = body.pick.entryId;
          }
          send({ type: "session", sessionId });
        }

        // ── Phân tích (code) — họ nào chạy do ý định câu hỏi quyết ──
        const uLite = {
          intents: (v2!.intents ?? ["mo"]) as Intent[],
          places: v2!.places ?? [],
          timeframe: v2!.timeframe ?? {},
          level: v2!.level,
          scheme: v2!.scheme,
        };
        const plan = planAnalysis(
          cat,
          uLite,
          v2!.picks.map((p) => ({
            concept: p.concept,
            entry: p.current ? byId.get(p.current) ?? null : null,
            others: p.options.map((id) => byId.get(id)).filter((e): e is CatalogEntry => !!e),
          }))
        );
        const picks = plan.picks;
        if (!picks.length) {
          send({ type: "scope", scope: scopeOf(uLite, plan, []) });
          send({ type: "no_measure", text: "Chưa tìm thấy chỉ tiêu dùng được cho câu hỏi này trong các dataset tìm được (không phải toàn bộ kho)." });
        } else {
          const a = await analyze(picks, { ...plan.opts, sessionP: v2!.pvals, excludeProvisional: body.op?.excludeProvisional, year: body.op?.year ?? plan.opts.year });
          ms.analyze = a.ms;
          v2!.pvals.push(...a.newP);
          // Năm chung của các chỉ tiêu ĐANG dùng — cho chip "đổi năm" ở bước hỏi tiếp
          const yearsOf = (e: CatalogEntry) => (v2!.level === "province" ? e.province?.years : e.nation?.years) ?? [];
          const years = picks.slice(1).reduce((acc, p) => acc.filter((y) => yearsOf(p.entry).includes(y)), yearsOf(picks[0].entry));
          const provisional = [...new Set(picks.flatMap((p) => p.entry.provisional))];
          send({ type: "analysis", ran: a.ranAnalyses, findings: a.findings.length, testsInSession: a.testsInSession, years, provisional, op: body.op ?? null });
          send({ type: "scope", scope: scopeOf(uLite, plan, a.findings) });

          // ── AI 3: viết lời ──
          const n = await narrate(v2!.question, a.findings, v2!.level === "province");
          ms.narrate = n.ms;
          send({
            type: "cards",
            cards: a.findings.map((f) => {
              const c = n.cards.find((x) => x.findingId === f.id)!;
              return {
                id: f.id,
                family: f.familyLabel,
                title: c.title,
                text: c.text,
                writtenBy: c.writtenBy,
                violations: c.violations,
                badges: f.badges,
                verify: f.verify,
                caveat: f.caveat,
                sources: f.sources,
                chart: f.chart,
                scheme: f.scheme,
                raw: f.raw,
              };
            }),
          });
          v2!.runs.push({ at: new Date().toISOString(), picks: v2!.picks.map((p) => p.current), findings: a.findings.length, ms });
        }
        await withSession(sessionId!, async (s) => {
          s.v2 = v2;
        });
        send({ type: "timing", ms: { ...ms, total: Date.now() - t0 } });
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
