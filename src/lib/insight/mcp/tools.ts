/**
 * Bộ tool MCP cho Claude Code (THIET-KE-V8 mục 3b). Tool là CODE THUẦN — không gọi AI bên
 * trong, nên token chỉ tính vào tài khoản Claude của người dùng.
 *
 * Tên tool + mô tả tiếng Anh (tên tool MCP chỉ nhận ASCII); dữ liệu trả về giữ tiếng Việt.
 * Mỗi kết quả có `result_id`, được giữ trong tiến trình (một phiên Claude Code = một tiến trình
 * server) để `check_answer` đối chiếu, và ghi log ra data/insight/mcp-log/ để làm eval.
 */

import { promises as fs } from "fs";
import path from "path";
import { loadDataset } from "../load";
import { INSIGHT_DATA_DIR } from "../session";
import { loadCatalog, searchMeasures, type Catalog, type CatalogEntry } from "../v2/catalog";
import { detectPlaces, detectTimeframe } from "../v2/scope";
import { schemeFromQuestion } from "../v2/rules";
import { checkAnswer } from "./check";
import { entryOf, OPS, OpError, provenance, runOp, storyTypes, type Op, type OpArgs } from "./ops";
import { MemoryStore, R2Store, type ResultStore, type StoredResult } from "./results-store";

const LOG_DIR = path.join(INSIGHT_DATA_DIR, "mcp-log");

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const ids = { type: "array", items: { type: "string" }, description: "Measure ids from find_measures (e.g. m00123)" };
const places = { type: "array", items: { type: "string" }, description: "Place names in Vietnamese as written (province or region), e.g. ['Hà Tĩnh', 'Đồng bằng sông Cửu Long']" };

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "find_measures",
    description:
      "Search the newsroom data catalog for measures matching ONE concept (Vietnamese words as the reporter uses them, e.g. 'thu nhập bình quân'). Call once per concept. Returns candidate measures with id, label, dataset, publisher, unit, and which years have data at province / national level. Pick by MEANING, not by shared words.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        level: { type: "string", enum: ["province", "nation"], description: "Only return measures usable at this level. Omit for both." },
        limit: { type: "number", description: "Default 8" },
      },
      required: ["query"],
    },
  },
  {
    name: "describe_measure",
    description:
      "Describe one measure before analysing it: publisher, unit, years with data, province scheme (63 or 34), whether values can be summed, sibling measures in the same dataset, and which data-story types are possible (change_over_time, contrast, outliers, factors, intersections, drill_down, zoom_out, relation) with the reason when not possible.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "scan",
    description:
      "Run EVERY applicable analysis for 1–2 measures and return all results, so no story type is skipped by guesswork. Use for open questions ('có gì đáng viết'). Each sub-result has its own result_id. Analyses that cannot run are listed with the reason.",
    inputSchema: { type: "object", properties: { ids, places }, required: ["ids"] },
  },
  {
    name: "compute",
    description: [
      "Run exactly one operation. Every number you write in the answer must come from a tool result.",
      "Most results include `bieu_do`: a Vega-Lite v5 spec built by code from the same numbers. To show a chart, render that spec unchanged (e.g. an HTML artifact using vega-embed from cdn.jsdelivr.net). Never redraw a chart from hand-copied numbers.",
      "ops: series (values by year for one place, default national) · change (from_year → to_year, one or more places) · trend (national segments up/down, record, reversal; window = 'N năm qua') · rank (level province|region, optional within=<region> for drill down; adds per-capita ranking for absolute counts) · compare (2+ places at one year) · outlier (robust z, median + MAD) · composition (parts of a dimension vs its total; checks parts sum to total) · crossing (2 ids with same unit, or 1 id + 2 places) · aggregate (zoom out province → region; only when summable or official regional figures exist) · relation (2 ids across provinces, by region, BH-corrected).",
    ].join("\n"),
    inputSchema: {
      type: "object",
      properties: {
        op: { type: "string", enum: [...OPS] },
        ids,
        places,
        level: { type: "string", enum: ["nation", "region", "province"] },
        within: { type: "string", description: "Region name to drill down into (province level only)" },
        year: { type: "number" },
        from_year: { type: "number" },
        to_year: { type: "number" },
        window: { type: "number", description: "For trend: change over the last N years" },
        dim: { type: "string", description: "For composition: dimension name (default: first with a total)" },
      },
      required: ["op", "ids"],
    },
  },
  {
    name: "answer_scope",
    description:
      "Compare the reporter's question with the data for the chosen measures: places mentioned vs places with data, time frame asked vs years available, 63 vs 34 province scheme. Call before answering; tell the reporter plainly which parts cannot be answered and why — never drop a part silently.",
    inputSchema: { type: "object", properties: { question: { type: "string" }, ids }, required: ["question", "ids"] },
  },
  {
    name: "check_answer",
    description:
      "Check a draft answer before sending it: every number must appear in a tool result (Vietnamese number format 1.234,5), no causal or editorial words in sentences with figures, superlatives only after rank/outlier/record results, up/down wording must match the real direction, and a source line is required. Fix every error and check again. The same check runs automatically when you finish.",
    inputSchema: {
      type: "object",
      properties: {
        answer: { type: "string" },
        question: { type: "string", description: "The reporter's question (numbers in it are allowed)" },
        result_ids: { type: "array", items: { type: "string" }, description: "Results the answer relies on. Omit = all results in this session." },
      },
      required: ["answer"],
    },
  },
];

// ── Trạng thái tiến trình ────────────────────────────────────────────────────

/** Local: một tiến trình = một phiên, giữ trong bộ nhớ. Production: lưu R2 theo người dùng (stateless). */
const memory = new MemoryStore();
/** p-value các phép thử trong phiên (BH). Production stateless → chỉ tính trong một lần gọi. */
const sessionP: number[] = [];
let catalog: Catalog | null = null;

export interface CallContext {
  /** Email người dùng đã xác thực (production). Không có → chạy local, giữ trong bộ nhớ. */
  user?: string;
}
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;

async function cat(): Promise<Catalog> {
  if (!catalog) catalog = await loadCatalog();
  if (!catalog) throw new OpError("Chưa có danh mục chỉ tiêu (data/insight/catalog.json hoặc R2 _index/measures.json).");
  return catalog;
}

async function store(rs: ResultStore, op: string, args: unknown, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = await rs.put({ op, args, data });
  return { result_id: id, op, ...data };
}

async function log(entry: Record<string, unknown>) {
  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.appendFile(path.join(LOG_DIR, `${runId}.jsonl`), JSON.stringify({ t: new Date().toISOString(), ...entry }) + "\n");
}

function compactEntry(e: CatalogEntry) {
  const span = (ys?: number[]) => (ys?.length ? `${ys[0]}–${ys[ys.length - 1]} (${ys.length} năm)` : null);
  return {
    id: e.id,
    chi_tieu: e.label,
    don_vi: e.unit ?? null,
    dataset: e.datasetTitle,
    noi_phat_hanh: e.source,
    theo_tinh: e.province ? `${e.province.n} tỉnh, ${span(e.province.years)}` : null,
    ca_nuoc: span(e.nation?.years),
    danh_muc_tinh: e.scheme === "63" ? "63 tỉnh cũ, trước sáp nhập năm 2025 (Nghị quyết 202/2025/QH15)" : e.scheme,
    ...(e.subgroup ? { nhom_con: e.subgroup } : {}),
    ...(e.provisional.length ? { nam_so_bo: e.provisional } : {}),
  };
}

// ── Các tool ─────────────────────────────────────────────────────────────────

async function findMeasures(a: { query: string; level?: "province" | "nation"; limit?: number }) {
  const c = await cat();
  const limit = a.limit ?? 8;
  const levels: ("province" | "nation")[] = a.level ? [a.level] : ["nation", "province"];
  const seen = new Map<string, CatalogEntry>();
  const notes: string[] = [];
  for (const lv of levels) {
    const r = await searchMeasures(c, a.query, lv, limit);
    if (r.degraded) notes.push(r.degraded);
    for (const e of r.entries) if (!seen.has(e.id)) seen.set(e.id, e);
  }
  return {
    ung_vien: [...seen.values()].slice(0, limit * levels.length).map(compactEntry),
    ...(notes.length ? { ghi_chu: [...new Set(notes)] } : {}),
    huong_dan: "Chọn theo NGHĨA. Không có chỉ tiêu đúng nghĩa thì nói kho chưa có — không thay bằng chỉ tiêu gần chữ.",
  };
}

async function describeMeasure(a: { id: string }) {
  const c = await cat();
  const e = entryOf(c, a.id);
  const { profile } = await loadDataset(e.slug);
  const m = profile.measures.find((x) => x.name === e.measure);
  const siblings = c.entries.filter((x) => x.slug === e.slug && x.id !== e.id).slice(0, 15).map((x) => ({ id: x.id, chi_tieu: x.label }));
  return {
    ...compactEntry(e),
    nguon: provenance(e),
    cong_duoc: m ? { co: m.additive, ly_do: m.additiveReason } : null,
    cac_chieu: profile.dims.map((d) => ({ ten: d.name, gia_tri: d.values.slice(0, 12), so_gia_tri: d.total })),
    chi_tieu_cung_dataset: siblings,
    loai_chuyen: await storyTypes(c, e),
    canh_bao_dataset: profile.warnings,
  };
}

async function scan(a: { ids: string[]; places?: string[] }, rs: ResultStore) {
  const c = await cat();
  const es = a.ids.slice(0, 2).map((id) => entryOf(c, id));
  const plan: { op: Op; args: OpArgs; why: string }[] = [];
  for (const e of es) {
    const types = await storyTypes(c, e);
    const ok = (t: string) => types.find((x) => x.loai === t)?.ke_duoc;
    if (e.nation && (e.nation.years.length ?? 0) >= 4) plan.push({ op: "trend", args: { ids: [e.id] }, why: "change_over_time" });
    if (ok("contrast") && e.province) plan.push({ op: "rank", args: { ids: [e.id], level: "province" }, why: "contrast" });
    if (ok("outliers")) plan.push({ op: "outlier", args: { ids: [e.id], level: "province" }, why: "outliers" });
    if (ok("factors")) plan.push({ op: "composition", args: { ids: [e.id] }, why: "factors" });
    if (ok("zoom_out")) plan.push({ op: "aggregate", args: { ids: [e.id] }, why: "zoom_out" });
    if (a.places?.length) plan.push({ op: "change", args: { ids: [e.id], places: a.places }, why: "change_over_time (nơi được hỏi)" });
    if ((a.places?.length ?? 0) >= 2) plan.push({ op: "compare", args: { ids: [e.id], places: a.places }, why: "contrast (nơi được hỏi)" });
  }
  if (es.length === 2) {
    plan.push({ op: "relation", args: { ids: a.ids.slice(0, 2) }, why: "relation" });
    if ((es[0].unit ?? "") === (es[1].unit ?? "")) plan.push({ op: "crossing", args: { ids: a.ids.slice(0, 2) }, why: "intersections" });
  }
  const done: Record<string, unknown>[] = [];
  const skipped: { phep: string; loai: string; ly_do: string }[] = [];
  for (const p of plan) {
    try {
      done.push({ loai: p.why, ...(await store(rs, p.op, p.args, await runOp(c, p.op, p.args, sessionP))) });
    } catch (err) {
      if (!(err instanceof OpError)) throw err;
      skipped.push({ phep: p.op, loai: p.why, ly_do: err.message });
    }
  }
  return { ket_qua: done, khong_chay_duoc: skipped };
}

async function answerScope(a: { question: string; ids: string[] }) {
  const c = await cat();
  const es = a.ids.map((id) => entryOf(c, id));
  const pls = detectPlaces(a.question);
  const tf = detectTimeframe(a.question);
  const scheme = schemeFromQuestion(a.question);
  const ok: string[] = [];
  const no: string[] = [];
  const notes: string[] = [];
  for (const e of es) {
    const name = `"${e.label}"`;
    for (const p of pls) {
      if (p.kind === "province") (e.province ? ok : no).push(`${name} cho ${p.name}: ${e.province ? "có số theo tỉnh" : "chỉ có số cả nước"}`);
      else {
        const { profile } = await loadDataset(e.slug);
        const has = profile.geoLevels.regions > 0;
        (has || e.province ? ok : no).push(`${name} cho ${p.name}: ${has ? "có số cấp vùng" : e.province ? "chỉ có số tỉnh — gộp qua aggregate nếu cộng được, hoặc so tỉnh trong vùng (rank within)" : "không có số tỉnh/vùng"}`);
      }
    }
    const years = e.nation?.years.length ? e.nation.years : e.province?.years ?? [];
    const last = years[years.length - 1];
    if (tf.year !== undefined) (years.includes(tf.year) ? ok : no).push(`${name} năm ${tf.year}: ${years.includes(tf.year) ? "có số" : `không có (có ${years[0]}–${last})`}`);
    if (tf.fromYear !== undefined) (years[0] <= tf.fromYear ? ok : no).push(`${name} từ ${tf.fromYear}: ${years[0] <= tf.fromYear ? "có" : `số bắt đầu từ ${years[0]}`}`);
    if (tf.window !== undefined) (last - years[0] >= tf.window ? ok : no).push(`${name} ${tf.window} năm qua: ${last - years[0] >= tf.window ? `có (${last - tf.window}–${last})` : `chuỗi chỉ ${years[0]}–${last}`}`);
    if (last && new Date().getFullYear() - last >= 2) notes.push(`${name}: năm mới nhất có số là ${last}.`);
    if (e.provisional.length) notes.push(`${name}: số năm ${e.provisional.join(", ")} là sơ bộ.`);
    if (scheme === "34" && e.scheme === "63") notes.push(`${name}: câu hỏi theo 34 tỉnh mới, số theo 63 tỉnh cũ — chỉ quy đổi được khi cộng được.`);
  }
  return {
    noi_duoc_nhac: pls.map((p) => p.name),
    moc_thoi_gian: tf,
    tra_loi_duoc: ok,
    khong_tra_loi_duoc: no,
    ghi_chu: notes,
    huong_dan: "Nêu rõ phần không trả lời được và lý do trong câu trả lời. Ý định khác (xếp hạng, so sánh…) đối chiếu với loai_chuyen của describe_measure.",
  };
}

async function checkTool(a: { answer: string; question?: string; result_ids?: string[] }, rs: ResultStore) {
  const found = a.result_ids?.length ? await rs.get(a.result_ids) : null;
  const picked: StoredResult[] = found ? [...found.values()] : await rs.recent();
  const missing = (a.result_ids ?? []).filter((id) => !found?.has(id));
  const out = checkAnswer(a.answer, picked.map((r) => ({ op: r.op, data: r.data })), a.question ?? "");
  if (missing.length) out.errors.unshift(`result_id không có trong phiên: ${missing.join(", ")}`);
  return { ...out, ok: out.ok && !missing.length };
}

export async function callTool(name: string, args: Record<string, unknown>, ctx: CallContext = {}): Promise<{ ok: boolean; text: string }> {
  const t0 = Date.now();
  const rs: ResultStore = ctx.user ? new R2Store(ctx.user) : memory;
  let out: Record<string, unknown>;
  let ok = true;
  try {
    switch (name) {
      case "find_measures":
        out = await findMeasures(args as never);
        break;
      case "describe_measure":
        out = await describeMeasure(args as never);
        break;
      case "scan":
        out = await scan(args as never, rs);
        break;
      case "compute": {
        const { op, ...rest } = args as unknown as { op: Op } & OpArgs;
        out = await store(rs, op, rest, await runOp(await cat(), op, rest, sessionP));
        break;
      }
      case "answer_scope":
        out = await answerScope(args as never);
        break;
      case "check_answer":
        out = await checkTool(args as never, rs);
        ok = out.ok as boolean;
        break;
      default:
        throw new OpError(`Không có tool "${name}".`);
    }
  } catch (err) {
    ok = false;
    out = { loi: err instanceof OpError ? err.message : `Lỗi hệ thống: ${(err as Error).message}` };
    if (!(err instanceof OpError)) console.error(`[insight-data] ${name}:`, err);
  }
  if (ok && ["find_measures", "describe_measure", "answer_scope"].includes(name)) await rs.putContext({ op: name, args, data: out }).catch(() => {});
  // Log ra đĩa chỉ khi chạy local; production chưa log (ngoài phạm vi spec 2026-10-12)
  if (!ctx.user) await log({ tool: name, args, ok, ms: Date.now() - t0, out }).catch(() => {});
  return { ok, text: JSON.stringify(out) };
}
