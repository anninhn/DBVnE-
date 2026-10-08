"use client";

/**
 * InsightPanel — pilot harness insight trong AMA (CHỈ hiện khi chạy local với
 * INSIGHT_LOCAL=1). Hai bước:
 *
 *  1. ĐỀ XUẤT CHỈ TIÊU — harness tách khái niệm trong câu hỏi, code mở các dataset tìm
 *     được, đo dữ kiện từng cột (số tỉnh, năm, nhóm con…) và xếp hạng; AI chỉ nói cột
 *     nào đúng nghĩa. Phóng viên thấy đề xuất + phương án khác + lý do không dùng.
 *  2. PHÂN TÍCH — trên đúng các chỉ tiêu phóng viên xác nhận.
 *
 * Không dùng danh sách dataset của Discovery: đo 2026-10-08, Discovery lúc bỏ sót
 * dataset mức sinh, lúc chọn "Chênh lệch thu nhập giữa các nhóm" (không có mức chung).
 * Phóng viên không tự biết kho còn lựa chọn tốt hơn — hệ thống phải so.
 */

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Step {
  id: string;
  label: string;
  status: "run" | "ok" | "error";
  detail?: string;
}

interface CardRecord {
  ok: boolean;
  errors: string[];
  attempt: number;
  card: Record<string, unknown>;
}

interface MeasureOption {
  id: string;
  slug: string;
  datasetTitle: string;
  measure: string;
  unit?: string;
  provinces: number;
  years: number[];
  subgroup: string | null;
  excluded: string | null;
}

interface Suggestion {
  level: string;
  concepts: { concept: string; recommended: MeasureOption | null; alternatives: MeasureOption[]; rejected: MeasureOption[] }[];
  commonYears: number[] | null;
  notes: string[];
}

const DETECTOR_LABEL: Record<string, string> = {
  region_reversal: "So quan hệ giữa các vùng",
  trend_break: "Tìm kỷ lục, điểm gãy xu hướng",
};

function stepLabel(name: string, input: Record<string, unknown>): string {
  const slugOf = (v: unknown) => (v && typeof v === "object" ? String((v as { slug?: string }).slug ?? "") : "");
  switch (name) {
    case "find_measures":
      return `Tìm chỉ tiêu cho: ${((input.khai_niem as string[]) ?? []).join(", ")}`;
    case "select_measures":
      return "Chọn chỉ tiêu đúng nghĩa, xếp hạng theo cấu trúc dữ liệu";
    case "plan_analysis":
      return "Đối chiếu câu hỏi với chỉ tiêu đã chọn";
    case "describe_dataset":
      return `Đọc cấu trúc dataset: ${String(input.slug ?? "")}`;
    case "check_artifacts":
      return `Kiểm lỗi dữ liệu: ${slugOf(input.slice)}`;
    case "run_detector":
      return DETECTOR_LABEL[String(input.kind)] ?? `Chạy bộ dò ${String(input.kind)}`;
    case "submit_card":
      return "Nộp thẻ — rào chắn kiểm số";
    case "report_insufficient":
      return "Ghi nhận dữ liệu còn thiếu";
    default:
      return name;
  }
}

function yearsText(y: number[]): string {
  return y.length ? `${y[0]}–${y[y.length - 1]}` : "không có năm";
}

export default function InsightPanel({ question }: { question: string }) {
  const [q, setQ] = useState(question);
  const [phase, setPhase] = useState<"idle" | "suggesting" | "suggested" | "analyzing" | "done">("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [picked, setPicked] = useState<Record<string, MeasureOption | null>>({});
  const [answer, setAnswer] = useState("");
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const running = phase === "suggesting" || phase === "analyzing";

  async function stream(body: Record<string, unknown>) {
    setSteps([]);
    setAnswer("");
    setError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    const res = await fetch("/api/insight/run", {
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
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) handle(JSON.parse(line));
      }
    }
  }

  async function suggest() {
    setPhase("suggesting");
    setSuggestion(null);
    setCards([]);
    try {
      await stream({ mode: "suggest", question: q });
      setPhase("suggested");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
      setPhase("idle");
    }
  }

  async function analyze() {
    const picks = Object.entries(picked)
      .filter(([, o]) => o)
      .map(([ten, o]) => ({ ten, slug: o!.slug, measure: o!.measure }));
    setPhase("analyzing");
    setCards([]);
    try {
      await stream({ mode: "analyze", sessionId, question: q, picks });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    }
    setPhase("done");
  }

  function handle(ev: Record<string, unknown>) {
    switch (ev.type) {
      case "session":
        setSessionId(String(ev.sessionId));
        break;
      case "tool_call":
        setSteps((s) => [
          ...s,
          { id: String(ev.id), label: stepLabel(String(ev.name), (ev.input ?? {}) as Record<string, unknown>), status: "run" },
        ]);
        break;
      case "tool_result":
        setSteps((s) =>
          s.map((st) =>
            st.id === ev.id
              ? {
                  ...st,
                  status: ev.ok ? "ok" : "error",
                  detail: !ev.ok || st.label.startsWith("Đối chiếu") ? String(ev.text ?? "") : undefined,
                }
              : st
          )
        );
        break;
      case "text":
        setAnswer((a) => (a ? `${a}\n\n${String(ev.text)}` : String(ev.text)));
        break;
      case "suggestion": {
        const sg = ev.suggestion as Suggestion | null;
        setSuggestion(sg);
        const init: Record<string, MeasureOption | null> = {};
        for (const c of sg?.concepts ?? []) init[c.concept] = c.recommended;
        setPicked(init);
        break;
      }
      case "cards":
        setCards((ev.cards as CardRecord[]) ?? []);
        break;
      case "error":
        setError(String(ev.message));
        break;
    }
  }

  const canAnalyze = suggestion && Object.values(picked).some(Boolean);

  return (
    <div className="border border-dashed border-hf-border rounded-md p-3 space-y-3 bg-hf-bg-subtle">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-hf-text">
        <Sparkles className="w-3.5 h-3.5" aria-hidden />
        Phân tích insight
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-hf-yellow text-hf-text">pilot</span>
        {running && <Loader2 className="w-3.5 h-3.5 animate-spin text-hf-text-muted" />}
        {running && (
          <button type="button" onClick={() => abortRef.current?.abort()} className="ml-auto text-hf-text-muted hover:text-hf-text">
            Dừng
          </button>
        )}
      </div>

      {(phase === "idle" || phase === "suggested" || phase === "done") && (
        <div className="space-y-2">
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            rows={2}
            className="w-full text-sm border border-hf-border rounded px-2 py-1.5 bg-white"
            aria-label="Câu hỏi phân tích"
          />
          <button
            type="button"
            onClick={suggest}
            disabled={!q.trim()}
            className="text-sm font-medium px-3 py-1.5 rounded border border-hf-text text-hf-text disabled:opacity-40"
          >
            {phase === "idle" ? "Bước 1 · Đề xuất chỉ tiêu →" : "Đề xuất lại"}
          </button>
        </div>
      )}

      {steps.length > 0 && (
        <ul className="space-y-1 text-sm">
          {steps.map((st) => (
            <li key={st.id}>
              <div className="flex items-center gap-2">
                {st.status === "run" && <Loader2 className="w-3.5 h-3.5 animate-spin text-hf-text-muted" />}
                {st.status === "ok" && <CheckCircle2 className="w-3.5 h-3.5 text-green-700" />}
                {st.status === "error" && <XCircle className="w-3.5 h-3.5 text-red-600" />}
                <span className={st.status === "error" ? "text-red-700" : "text-hf-text"}>{st.label}</span>
              </div>
              {st.detail && <p className="pl-5.5 ml-1 text-xs text-hf-text-muted whitespace-pre-wrap">{st.detail}</p>}
            </li>
          ))}
        </ul>
      )}

      {suggestion && phase !== "suggesting" && (
        <div className="space-y-2.5">
          <p className="text-xs text-hf-text-muted">
            Mọi dữ kiện dưới đây (số tỉnh, năm, nhóm con) do hệ thống đo từ chính file dữ liệu. Chọn chỉ tiêu cho từng khái niệm:
          </p>
          {suggestion.concepts.map((c) => (
            <fieldset key={c.concept} className="border border-hf-border rounded bg-white p-2.5 space-y-1">
              <legend className="px-1 text-sm font-semibold text-hf-text">{c.concept}</legend>
              {!c.recommended && (
                <p className="text-sm text-amber-800">
                  Chưa tìm thấy chỉ tiêu dùng được cho khái niệm này trong các dataset tìm được (không phải toàn bộ kho).
                </p>
              )}
              {[c.recommended, ...c.alternatives].filter((o): o is MeasureOption => !!o).map((o, i) => (
                <label key={o.id} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name={`pick-${c.concept}`}
                    className="mt-1"
                    checked={picked[c.concept]?.id === o.id}
                    disabled={phase === "analyzing"}
                    onChange={() => setPicked((p) => ({ ...p, [c.concept]: o }))}
                  />
                  <span>
                    <span className="font-medium">{o.measure}</span>
                    {i === 0 && <span className="ml-1.5 text-[10px] font-bold px-1 py-0.5 rounded bg-green-100 text-green-800">ĐỀ XUẤT</span>}
                    <span className="block text-xs text-hf-text-muted">
                      {o.datasetTitle} · {o.provinces} tỉnh · {yearsText(o.years)}
                      {o.unit ? ` · ${o.unit}` : ""}
                      {o.subgroup ? ` · ⚠ ${o.subgroup}` : ""}
                    </span>
                  </span>
                </label>
              ))}
              {c.rejected.length > 0 && (
                <ul className="pt-1 text-xs text-hf-text-faint space-y-0.5">
                  {c.rejected.map((r) => (
                    <li key={r.id}>
                      Không dùng: {r.measure} ({r.datasetTitle}) — {r.excluded ?? r.subgroup}
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          ))}
          {suggestion.commonYears && (
            <p className="text-xs text-hf-text-muted">
              Năm dùng chung của các chỉ tiêu đề xuất: {suggestion.commonYears.length ? suggestion.commonYears.join(", ") : "không có"}
            </p>
          )}
          {suggestion.notes.map((n, i) => (
            <p key={i} className="text-xs text-amber-800">
              {n}
            </p>
          ))}
          {phase === "suggested" && (
            <button
              type="button"
              onClick={analyze}
              disabled={!canAnalyze}
              className="text-sm font-medium px-3 py-1.5 rounded bg-hf-text text-white disabled:opacity-40"
            >
              Bước 2 · Phân tích với các chỉ tiêu đã chọn →
            </button>
          )}
        </div>
      )}

      {cards.map((c, i) => (
        <CardView key={i} record={c} />
      ))}

      {answer && !running && (
        <div className="prose prose-sm max-w-none text-hf-text border-t border-hf-border pt-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="whitespace-pre-wrap">{error}</p>
        </div>
      )}
    </div>
  );
}

function CardView({ record }: { record: CardRecord }) {
  const c = record.card;
  if (c.kind === "insufficient") {
    return (
      <div className="border border-blue-200 bg-blue-50/40 rounded-md p-3 text-sm space-y-1">
        <div className="text-xs font-semibold text-blue-800">◇ Cần dữ liệu gì</div>
        <p className="font-semibold text-hf-text">{String(c.de_tai ?? "")}</p>
        <ul className="list-disc pl-5 text-hf-text-muted">
          {((c.thieu as string[]) ?? []).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
        {typeof c.gan_dung === "string" && <p className="text-hf-text-muted">Gần đúng: {c.gan_dung}</p>}
        {typeof c.pham_vi === "string" && <p className="text-xs text-hf-text-faint">{c.pham_vi}</p>}
      </div>
    );
  }
  if (!record.ok) {
    return (
      <div className="border border-red-200 bg-red-50/40 rounded-md p-3 text-sm space-y-1">
        <div className="text-xs font-semibold text-red-700">✗ Thẻ bị rào chắn trả lại (lần {record.attempt})</div>
        <p className="text-hf-text">{String(c.tieu_de ?? "")}</p>
        <ul className="list-disc pl-5 text-xs text-red-700">
          {record.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    );
  }
  const nums = (c.so_lieu as { nhan: string; gia_tri: string; result_id: string }[]) ?? [];
  return (
    <div className="border border-green-300 bg-white rounded-md p-3 text-sm space-y-2">
      <div className="text-xs font-semibold text-green-800">✓ Thẻ góc bài · {String(c.dang_pattern ?? "")}</div>
      <p className="font-semibold text-[15px] leading-snug text-hf-text">{String(c.tieu_de ?? "")}</p>
      <p className="text-hf-text-muted">{String(c.vi_sao_dang_viet ?? "")}</p>
      <table className="text-sm">
        <tbody>
          {nums.map((n, i) => (
            <tr key={i}>
              <td className="pr-4 text-hf-text-muted">{n.nhan}</td>
              <td className="pr-4 font-semibold tabular-nums">{n.gia_tri}</td>
              <td className="font-mono text-[11px] text-hf-text-faint">{n.result_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="text-sm space-y-1">
        <dt className="text-[11px] uppercase tracking-wide text-hf-text-faint">Nguồn</dt>
        <dd>
          {((c.nguon as string[]) ?? []).map((s) => (
            <a key={s} href={`/datasets/${s}`} target="_blank" rel="noopener noreferrer" className="mr-2 font-mono text-xs underline">
              {s}
            </a>
          ))}
        </dd>
        <dt className="text-[11px] uppercase tracking-wide text-hf-text-faint">Lưu ý</dt>
        <dd className="text-hf-text-muted">{String(c.luu_y ?? "")}</dd>
        <dt className="text-[11px] uppercase tracking-wide text-hf-text-faint">Cần kiểm thêm</dt>
        <dd className="text-hf-text-muted">{String(c.can_kiem_them ?? "")}</dd>
      </dl>
    </div>
  );
}
