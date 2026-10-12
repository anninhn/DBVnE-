/**
 * Stop hook của Claude Code — GATE CỨNG cho lớp tool insight-data (THIET-KE-V8 mục 3b).
 *
 * Khi Claude định kết thúc lượt: lấy câu trả lời cuối + mọi kết quả tool insight-data từ lúc
 * phóng viên hỏi (trong transcript), chạy CÙNG hàm kiểm với tool check_answer. Sai → chặn,
 * trả danh sách lỗi cho Claude sửa. Câu trả lời không có chữ số → cho qua (hỏi lại, giải thích).
 *
 * Chặn tối đa MAX_BLOCKS lần liền cho một câu hỏi để không lặp vô hạn; lần lọt gate được ghi log.
 */
import { promises as fs } from "fs";
import path from "path";
import { checkAnswer } from "@/lib/insight/mcp/check";

const SERVER = "mcp__insight-data__";
const MAX_BLOCKS = 3;
const LOG_DIR = path.join(process.cwd(), "data", "insight", "mcp-log");

const input = JSON.parse(await new Promise((ok) => {
  let s = "";
  process.stdin.on("data", (d) => (s += d));
  process.stdin.on("end", () => ok(s || "{}"));
}));

const entries = (await fs.readFile(input.transcript_path, "utf8").catch(() => ""))
  .split("\n")
  .filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter((o) => o && !o.isSidechain && (o.type === "user" || o.type === "assistant"));

const blocks = (o) => (typeof o.message?.content === "string" ? [{ type: "text", text: o.message.content }] : o.message?.content ?? []);
const isPrompt = (o) => o.type === "user" && !o.isMeta && blocks(o).some((b) => b.type === "text") && !blocks(o).some((b) => b.type === "tool_result");

let start = -1;
for (let i = entries.length - 1; i >= 0; i--) if (isPrompt(entries[i])) { start = i; break; }
const turn = entries.slice(start + 1);
const question = start >= 0 ? blocks(entries[start]).filter((b) => b.type === "text").map((b) => b.text).join("\n") : "";

// Kết quả tool insight-data trong lượt này
const names = new Map();
for (const o of turn) for (const b of blocks(o)) if (b.type === "tool_use" && b.name?.startsWith(SERVER)) names.set(b.id, b.name.slice(SERVER.length));
const results = [];
let lastToolIdx = -1;
turn.forEach((o, i) => {
  for (const b of blocks(o)) {
    if (b.type !== "tool_result") continue;
    lastToolIdx = i;
    const tool = names.get(b.tool_use_id);
    if (!tool || tool === "check_answer") continue;
    const text = typeof b.content === "string" ? b.content : (b.content ?? []).map((c) => c.text ?? "").join("");
    let data;
    try { data = JSON.parse(text); } catch { continue; }
    const subs = Array.isArray(data.ket_qua) && data.ket_qua.every((x) => x && typeof x === "object" && "op" in x) ? data.ket_qua : [data];
    for (const d of subs) results.push({ op: d.op ?? tool, data: d });
  }
});

// Câu trả lời cuối: ưu tiên trường hook đưa sẵn, không thì chữ của assistant sau lượt tool cuối
const answer = typeof input.last_assistant_message === "string" && input.last_assistant_message
  ? input.last_assistant_message
  : turn.slice(lastToolIdx + 1).filter((o) => o.type === "assistant").flatMap((o) => blocks(o).filter((b) => b.type === "text").map((b) => b.text)).join("\n");

if (!/\d/.test(answer.replace(/`[^`]*`/g, ""))) process.exit(0);

const out = checkAnswer(answer, results, question);
await fs.mkdir(LOG_DIR, { recursive: true });
const countFile = path.join(LOG_DIR, `stop-${input.session_id ?? "x"}.json`);
const state = JSON.parse(await fs.readFile(countFile, "utf8").catch(() => "{}"));
const blocked = state.prompt === question ? state.blocked ?? 0 : 0;
const log = (verdict) => fs.appendFile(path.join(LOG_DIR, "stop-hook.jsonl"), JSON.stringify({ t: new Date().toISOString(), session: input.session_id, verdict, blocked, question: question.slice(0, 300), errors: out.errors, so_kiem: out.so_con_so_da_kiem, n_results: results.length }) + "\n");

if (out.ok) {
  await log("pass");
  await fs.writeFile(countFile, JSON.stringify({ prompt: question, blocked: 0 }));
  process.exit(0);
}
if (blocked >= MAX_BLOCKS) {
  await log("leak");
  await fs.writeFile(countFile, JSON.stringify({ prompt: question, blocked: 0 }));
  process.exit(0);
}
await fs.writeFile(countFile, JSON.stringify({ prompt: question, blocked: blocked + 1 }));
await log("block");
process.stdout.write(JSON.stringify({
  decision: "block",
  reason: `Gate kiểm số liệu (lần ${blocked + 1}/${MAX_BLOCKS}) — câu trả lời chưa đạt, viết lại toàn bộ câu trả lời:\n- ${out.errors.join("\n- ")}`,
}));
