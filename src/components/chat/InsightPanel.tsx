"use client";

/**
 * InsightPanel v2 — luồng chuẩn (bậc 1, THIET-KE-V6 mục 5). CHỈ hiện khi chạy local
 * (INSIGHT_LOCAL=1).
 *
 * Phân tích TỰ CHẠY NGAY với chỉ tiêu đề xuất — không bắt phóng viên duyệt trước.
 * Chỉ tiêu hiện thành chip: đổi chip → chạy lại phân tích (không gọi lại AI hiểu câu
 * hỏi / chọn chỉ tiêu). Số trong thẻ do code điền, chữ do AI viết rồi qua kiểm luật;
 * vi phạm thì dùng mẫu câu của code — không bao giờ chặn người hỏi.
 */

import { useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, ChevronDown, Copy, Loader2, Sparkles } from "lucide-react";

interface Chip {
  id: string;
  label: string;
  dataset: string;
  slug: string;
  unit: string | null;
  provinces: number;
  years: string;
  subgroup: string | null;
  provisional: number[];
}

interface ConceptChips {
  concept: string;
  current: Chip | null;
  options: Chip[];
  notRecommended: (Chip & { reason: string })[];
}

interface Badge {
  kind: "ok" | "warn" | "info";
  text: string;
}

interface CardData {
  id: string;
  family: string;
  title: string;
  text: string;
  writtenBy: "ai" | "mau";
  violations: string[];
  badges: Badge[];
  verify: string;
  caveat: string;
  sources: { slug: string; label: string }[];
  chart?: Record<string, unknown>;
  scheme: string | null;
  raw: unknown;
}

interface Scope {
  answered: string[];
  notYet: string[];
  missing: string[];
  notes: string[];
}

type StepKey = "understand" | "select" | "analyze";
type StepState = { status: "wait" | "run" | "ok" | "skip"; detail?: string; ms?: number };

const STEP_LABEL: Record<StepKey, string> = {
  understand: "Hiểu câu hỏi",
  select: "Chọn chỉ tiêu đúng nghĩa",
  analyze: "Phân tích & viết lời",
};

const LABELS: { value: "huu_ich" | "sai" | "da_biet"; text: string }[] = [
  { value: "huu_ich", text: "Hữu ích" },
  { value: "da_biet", text: "Đã biết" },
  { value: "sai", text: "Sai" },
];

function sec(ms?: number) {
  return ms === undefined ? "" : `${(ms / 1000).toFixed(1).replace(".", ",")} giây`;
}

const fresh = (): Record<StepKey, StepState> => ({
  understand: { status: "wait" },
  select: { status: "wait" },
  analyze: { status: "wait" },
});

export default function InsightPanel({ question }: { question: string }) {
  const [q, setQ] = useState(question);
  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [steps, setSteps] = useState(fresh);
  const [concepts, setConcepts] = useState<ConceptChips[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [cards, setCards] = useState<CardData[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [provisional, setProvisional] = useState<number[]>([]);
  const [op, setOp] = useState<{ excludeProvisional?: boolean; year?: number }>({});
  const [askBack, setAskBack] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const patch = (k: StepKey, s: StepState) => setSteps((p) => ({ ...p, [k]: s }));

  async function run(body: Record<string, unknown>, rerun: boolean) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setError(null);
    setNotice(null);
    setAskBack(null);
    setCards([]);
    setScope(null);
    setTotal(null);
    if (rerun) {
      setSteps((p) => ({ ...p, analyze: { status: "run" } }));
    } else {
      setSteps({ ...fresh(), understand: { status: "run" } });
      setConcepts([]);
      setNotes([]);
      setOp({});
    }
    try {
      const res = await fetch("/api/insight/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const msg = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(msg.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const t0 = Date.now();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as Record<string, unknown> & { type: string };
          switch (ev.type) {
            case "session":
              setSessionId(ev.sessionId as string);
              break;
            case "understood": {
              const c = ev.concepts as string[];
              patch("understand", {
                status: "ok",
                detail: `${c.join(" · ")} — ${ev.level === "province" ? "so giữa các tỉnh" : "cả nước"}${ev.agreement === "lech" ? " (hai lần đọc lệch nhau, đã gộp)" : ""}`,
                ms: Date.now() - t0,
              });
              patch("select", { status: "run" });
              break;
            }
            case "ask_back":
              setAskBack(ev.text as string);
              patch("select", { status: "skip" });
              patch("analyze", { status: "skip" });
              break;
            case "measures": {
              const cs = ev.concepts as ConceptChips[];
              setConcepts(cs);
              setNotes([...(ev.notes as string[]), ...(ev.degraded ? [ev.degraded as string] : [])]);
              patch("select", { status: "ok", detail: cs.map((c) => c.current?.label ?? `${c.concept}: chưa có`).join(" × "), ms: Date.now() - t0 });
              patch("analyze", { status: "run" });
              break;
            }
            case "scope":
              setScope(ev.scope as Scope);
              break;
            case "no_measure":
              setNotice(ev.text as string);
              patch("analyze", { status: "skip" });
              break;
            case "analysis":
              setYears(ev.years as number[]);
              setProvisional(ev.provisional as number[]);
              patch("analyze", { status: "run", detail: `${ev.findings} phát hiện · ${ev.testsInSession} phép thử trong phiên — đang viết lời` });
              break;
            case "cards": {
              const cs = ev.cards as CardData[];
              setCards(cs);
              patch("analyze", {
                status: "ok",
                detail: cs.length ? `${cs.length} thẻ` : "Không có phát hiện nào đủ chắc",
                ms: Date.now() - t0,
              });
              break;
            }
            case "timing":
              setTotal((ev.ms as Record<string, number>).total);
              break;
            case "error":
              throw new Error(ev.message as string);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const start = () => q.trim() && run({ question: q.trim() }, false);
  const repick = (concept: string, entryId: string) => {
    if (!sessionId) return;
    setConcepts((cs) => cs.map((c) => (c.concept === concept ? { ...c, current: c.options.find((o) => o.id === entryId) ?? c.current } : c)));
    run({ sessionId, pick: { concept, entryId }, op }, true);
  };
  const applyOp = (next: typeof op) => {
    if (!sessionId) return;
    setOp(next);
    run({ sessionId, op: next }, true);
  };

  const hasProvisional = years.some((y) => provisional.includes(y));

  return (
    <div className="border border-violet-200 bg-violet-50/30 rounded-md p-3 space-y-3 text-sm">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-800">
        <Sparkles className="w-3.5 h-3.5" />
        Tìm insight từ số liệu · thử nghiệm, chạy local
      </div>

      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !running && start()}
          className="flex-1 border border-hf-border rounded px-2 py-1.5 bg-white"
          placeholder="Câu hỏi về số liệu, vd: Thu nhập và mức sinh liên quan thế nào giữa các tỉnh?"
        />
        <button
          type="button"
          onClick={start}
          disabled={running || !q.trim()}
          className="px-3 py-1.5 rounded bg-hf-text text-white font-medium disabled:opacity-40"
        >
          Phân tích
        </button>
      </div>

      {steps.understand.status !== "wait" && (
        <ol className="space-y-1">
          {(Object.keys(STEP_LABEL) as StepKey[]).map((k) => {
            const s = steps[k];
            return (
              <li key={k} className="flex items-start gap-2">
                {s.status === "run" ? (
                  <Loader2 className="w-3.5 h-3.5 mt-0.5 animate-spin text-violet-700 shrink-0" />
                ) : s.status === "ok" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-green-700 shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 mt-0.5 rounded-full border border-hf-border shrink-0" />
                )}
                <span className={s.status === "wait" || s.status === "skip" ? "text-hf-text-faint" : "text-hf-text"}>
                  <span className="font-medium">{STEP_LABEL[k]}</span>
                  {s.detail && <span className="text-hf-text-muted"> — {s.detail}</span>}
                  {s.ms !== undefined && <span className="text-hf-text-faint"> · {sec(s.ms)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {askBack && <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">{askBack}</p>}

      {concepts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-hf-text-muted">Chỉ tiêu đang dùng — bấm để đổi, phân tích tự chạy lại:</p>
          <div className="flex flex-wrap gap-2">
            {concepts.map((c) => (
              <MeasureChip key={c.concept} c={c} disabled={running} onPick={(id) => repick(c.concept, id)} />
            ))}
          </div>
          {notes.map((n, i) => (
            <p key={i} className="text-xs text-amber-800">
              {n}
            </p>
          ))}
        </div>
      )}

      {scope && <ScopeBox scope={scope} />}

      {notice && !scope?.missing.length && <p className="text-amber-800">{notice}</p>}

      {cards.map((c) => (
        <InsightCard key={`${c.id}-${c.title}`} card={c} sessionId={sessionId} />
      ))}

      {cards.length > 0 && !running && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-hf-text-muted mr-1">Hỏi tiếp:</span>
          {hasProvisional && (
            <button
              type="button"
              onClick={() => applyOp({ ...op, excludeProvisional: !op.excludeProvisional })}
              className={`text-xs px-2 py-1 rounded-full border ${op.excludeProvisional ? "border-violet-500 bg-violet-100 text-violet-900" : "border-hf-border bg-white"}`}
            >
              {op.excludeProvisional ? "✓ Đã bỏ năm sơ bộ" : "Bỏ năm sơ bộ"}
            </button>
          )}
          {years.length > 1 && (
            <select
              value={op.year ?? ""}
              onChange={(e) => applyOp({ ...op, year: e.target.value ? Number(e.target.value) : undefined })}
              className="text-xs px-2 py-1 rounded-full border border-hf-border bg-white"
            >
              <option value="">Năm: mới nhất</option>
              {years
                .slice()
                .reverse()
                .map((y) => (
                  <option key={y} value={y}>
                    Năm {y}
                    {provisional.includes(y) ? " (sơ bộ)" : ""}
                  </option>
                ))}
            </select>
          )}
        </div>
      )}

      {total !== null && <p className="text-[11px] text-hf-text-faint">Tổng thời gian: {sec(total)}</p>}

      {error && (
        <div className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="whitespace-pre-wrap">{error}</p>
        </div>
      )}
    </div>
  );
}

/** Phạm vi trả lời — code viết: phần nào trả lời được, phần nào chưa, khái niệm nào kho không có */
function ScopeBox({ scope }: { scope: Scope }) {
  const rows: { items: string[]; label: string; cls: string }[] = [
    { items: scope.answered, label: "Trả lời được", cls: "text-green-800" },
    { items: scope.notYet, label: "Chưa làm được", cls: "text-amber-900" },
    { items: scope.missing, label: "Kho không có", cls: "text-red-800" },
    { items: scope.notes, label: "Lưu ý", cls: "text-hf-text-muted" },
  ];
  return (
    <div className="border border-hf-border bg-white rounded-md px-3 py-2 space-y-1 text-xs">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-hf-text-faint">Phạm vi trả lời</div>
      {rows
        .filter((r) => r.items.length)
        .map((r) => (
          <div key={r.label} className="flex gap-2">
            <span className={`shrink-0 w-24 font-medium ${r.cls}`}>{r.label}</span>
            <ul className="space-y-0.5 text-hf-text">
              {r.items.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}

function MeasureChip({ c, disabled, onPick }: { c: ConceptChips; disabled: boolean; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!c.current) {
    return <span className="text-xs px-2.5 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-900">{c.concept}: chưa có chỉ tiêu dùng được</span>;
  }
  const cur = c.current;
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-left text-xs px-2.5 py-1 rounded-full border border-violet-300 bg-white hover:bg-violet-50 disabled:opacity-50"
        title={`${cur.dataset} · ${cur.provinces} tỉnh · ${cur.years}`}
      >
        <span className="text-hf-text-faint">{c.concept}:</span>
        <span className="font-medium max-w-[260px] truncate">{cur.label}</span>
        <span className="text-hf-text-faint">· {cur.years}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-[420px] max-h-80 overflow-auto bg-white border border-hf-border rounded shadow-lg p-1">
          {c.options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setOpen(false);
                if (o.id !== cur.id) onPick(o.id);
              }}
              className={`block w-full text-left px-2 py-1.5 rounded hover:bg-violet-50 ${o.id === cur.id ? "bg-violet-50" : ""}`}
            >
              <span className="flex items-center gap-1 font-medium text-hf-text">
                {o.id === cur.id && <Check className="w-3 h-3 text-violet-700" />}
                {o.label}
              </span>
              <span className="block text-[11px] text-hf-text-muted">
                {o.dataset} · {o.provinces ? `${o.provinces} tỉnh · ` : ""}
                {o.years}
                {o.unit ? ` · ${o.unit}` : ""}
                {o.subgroup ? ` · ⚠ nhóm con: ${o.subgroup}` : ""}
              </span>
            </button>
          ))}
          {c.notRecommended.length > 0 && (
            <div className="border-t border-hf-border mt-1 pt-1 px-2 text-[11px] text-hf-text-faint">
              Không đề xuất: {c.notRecommended.map((n) => `${n.label} (${n.reason})`).join("; ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const BADGE_CLS: Record<Badge["kind"], string> = {
  ok: "bg-green-50 text-green-800 border-green-200",
  warn: "bg-amber-50 text-amber-900 border-amber-200",
  info: "bg-slate-50 text-slate-700 border-slate-200",
};

function InsightCard({ card, sessionId }: { card: CardData; sessionId: string | null }) {
  const [copied, setCopied] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  const copy = async () => {
    const src = card.sources.map((s) => `${s.label} — ${window.location.origin}/datasets/${s.slug}`).join("\n");
    await navigator.clipboard.writeText(`${card.title}\n\n${card.text}\n\nLưu ý: ${card.caveat}\nNguồn:\n${src}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const mark = async (value: string) => {
    if (!sessionId) return;
    setLabel(value);
    await fetch("/api/insight/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, label: { cardId: card.id, title: card.title, value } }),
    }).catch(() => setLabel(null));
  };

  return (
    <article className="border border-hf-border bg-white rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-800">{card.family}</span>
        {card.writtenBy === "mau" && (
          <span className="text-[10px] text-hf-text-faint" title={card.violations.join("; ")}>
            lời văn theo mẫu
          </span>
        )}
      </div>
      <h4 className="font-semibold text-[15px] leading-snug text-hf-text">{card.title}</h4>
      <p className="text-hf-text leading-relaxed">{card.text}</p>

      {card.chart?.type === "region_r" && <RegionChart chart={card.chart} />}
      {card.chart?.type === "line" && <LineChart chart={card.chart} />}

      <div className="flex flex-wrap gap-1">
        {card.badges.map((b, i) => (
          <span key={i} className={`text-[11px] px-1.5 py-0.5 rounded border ${BADGE_CLS[b.kind]}`}>
            {b.text}
          </span>
        ))}
      </div>

      <dl className="text-xs space-y-0.5">
        <div>
          <dt className="inline text-hf-text-faint">Lưu ý: </dt>
          <dd className="inline text-hf-text-muted">{card.caveat}</dd>
        </div>
        <div>
          <dt className="inline text-hf-text-faint">Cần kiểm thêm: </dt>
          <dd className="inline text-hf-text-muted">{card.verify}</dd>
        </div>
        <div>
          <dt className="inline text-hf-text-faint">Nguồn: </dt>
          <dd className="inline">
            {card.sources.map((s, i) => (
              <a key={s.slug + i} href={`/datasets/${s.slug}`} target="_blank" rel="noopener noreferrer" className="underline mr-2 text-hf-text-muted">
                {s.label}
              </a>
            ))}
          </dd>
        </div>
      </dl>

      <details className="text-xs">
        <summary className="cursor-pointer text-hf-text-muted">Xem cách tính</summary>
        <pre className="mt-1 max-h-60 overflow-auto bg-slate-50 border border-slate-200 rounded p-2 text-[10.5px] leading-snug">
          {JSON.stringify(card.raw, null, 2)}
        </pre>
      </details>

      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-hf-border">
        <button type="button" onClick={copy} className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-hf-border hover:bg-slate-50">
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Đã chép" : "Chép kèm nguồn"}
        </button>
        <span className="flex-1" />
        {LABELS.map((l) => (
          <button
            key={l.value}
            type="button"
            disabled={!sessionId}
            onClick={() => mark(l.value)}
            className={`text-xs px-2 py-1 rounded border ${label === l.value ? "border-violet-500 bg-violet-100 text-violet-900" : "border-hf-border hover:bg-slate-50"}`}
          >
            {l.text}
          </button>
        ))}
      </div>
    </article>
  );
}

const fmt = (n: number, d = 2) => n.toLocaleString("vi-VN", { maximumFractionDigits: d }).replace("-", "−");

/** Thanh hệ số tương quan theo vùng, trục −1…1; vùng dưới ngưỡng số tỉnh tô nhạt. */
function RegionChart({ chart }: { chart: Record<string, unknown> }) {
  const bars = chart.bars as { name: string; r: number | null; n: number; enough: boolean }[];
  const national = chart.national as number;
  const W = 160;
  const x = (r: number) => ((r + 1) / 2) * W;
  return (
    <div className="space-y-0.5 text-[11px]">
      <div className="text-hf-text-faint">Hệ số tương quan theo vùng, năm {String(chart.year)} (vạch đứt: cả nước {fmt(national)})</div>
      {bars.map((b) => (
        <div key={b.name} className="flex items-center gap-2">
          <span className="w-44 truncate text-hf-text-muted">{b.name}</span>
          <svg width={W} height={12} className="shrink-0">
            <line x1={x(0)} x2={x(0)} y1={0} y2={12} stroke="#cbd5e1" />
            <line x1={x(national)} x2={x(national)} y1={0} y2={12} stroke="#7c3aed" strokeDasharray="2 2" />
            {b.r !== null && (
              <rect
                x={Math.min(x(0), x(b.r))}
                width={Math.abs(x(b.r) - x(0))}
                y={2}
                height={8}
                fill={b.r < 0 ? "#2563eb" : "#dc2626"}
                opacity={b.enough ? 0.85 : 0.3}
              />
            )}
          </svg>
          <span className="tabular-nums w-10 text-right">{b.r === null ? "—" : fmt(b.r)}</span>
          <span className="text-hf-text-faint">{b.n} tỉnh</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ chart }: { chart: Record<string, unknown> }) {
  const pts = (chart.points as [number, number][]).slice().sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return null;
  const W = 360;
  const H = 90;
  const P = 4;
  const ys = pts.map((p) => p[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const x = (yr: number) => P + ((yr - pts[0][0]) / (pts[pts.length - 1][0] - pts[0][0])) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const breakYear = chart.breakYear as number | null;
  return (
    <div className="text-[11px]">
      <svg width={W} height={H} className="block">
        {breakYear && <line x1={x(breakYear)} x2={x(breakYear)} y1={0} y2={H} stroke="#f59e0b" strokeDasharray="3 3" />}
        <polyline fill="none" stroke="#7c3aed" strokeWidth={1.5} points={pts.map((p) => `${x(p[0])},${y(p[1])}`).join(" ")} />
        {pts.map((p) => (
          <circle key={p[0]} cx={x(p[0])} cy={y(p[1])} r={2} fill="#7c3aed" />
        ))}
      </svg>
      <div className="flex justify-between text-hf-text-faint" style={{ width: W }}>
        <span>
          {pts[0][0]}: {fmt(pts[0][1])}
        </span>
        {breakYear && <span className="text-amber-700">đổi xu hướng: {breakYear}</span>}
        <span>
          {pts[pts.length - 1][0]}: {fmt(pts[pts.length - 1][1])}
          {chart.unit ? ` ${String(chart.unit)}` : ""}
        </span>
      </div>
    </div>
  );
}
