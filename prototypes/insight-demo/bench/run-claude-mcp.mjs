/**
 * Chạy bộ câu hỏi qua Claude Code + MCP insight-data (THIET-KE-V8 mục 3b) — để so với bậc 1
 * (run-questions.mts) trên CÙNG bộ câu hỏi, cùng cách chấm.
 *
 *   node prototypes/insight-demo/bench/run-claude-mcp.mjs <tên-vòng> [q01,q02…]
 *
 * Tài khoản: đặt CLAUDE_CONFIG_DIR tới thư mục cấu hình đã đăng nhập tài khoản muốn đo (không
 * đặt = cấu hình mặc định của máy). Script KHÔNG đổi cấu hình hay đăng nhập hộ.
 *
 * Ra bench/runs/<tên-vòng>/: trace.jsonl (mỗi câu: câu trả lời, các lần gọi tool, thời gian, token,
 * chi phí, phán quyết của Stop hook), meta.json.
 */
import { spawn, execSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";

const BENCH = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(BENCH, "../../..");
const WORKDIR = path.join(ROOT, "prototypes/insight-demo/claude");
const HOOK_LOG = path.join(ROOT, "data/insight/mcp-log/stop-hook.jsonl");
const runName = process.argv[2] ?? `claude-mcp-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
const only = process.argv[3]?.split(",");
const outDir = path.join(BENCH, "runs", runName);
await fs.mkdir(outDir, { recursive: true });

const { questions } = JSON.parse(await fs.readFile(path.join(BENCH, "questions.json"), "utf8"));
const qs = questions.filter((q) => !only || only.includes(q.id));

await fs.writeFile(
  path.join(outDir, "meta.json"),
  JSON.stringify(
    {
      run: runName,
      client: "claude-code -p + MCP insight-data + Stop hook",
      startedAt: new Date().toISOString(),
      commit: execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim(),
      claudeVersion: execSync("claude --version", { encoding: "utf8" }).trim(),
      configDir: process.env.CLAUDE_CONFIG_DIR ?? "(mặc định)",
    },
    null,
    2
  )
);
const traceFile = path.join(outDir, "trace.jsonl");
await fs.writeFile(traceFile, "");

function runOne(question) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn("claude", ["-p", question, "--output-format", "stream-json", "--verbose"], { cwd: WORKDIR, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let buf = "";
    let err = "";
    p.stdout.on("data", (d) => (buf += d));
    p.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => p.kill("SIGTERM"), 10 * 60_000);
    p.on("close", (code) => {
      clearTimeout(timer);
      const events = buf.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const calls = [];
      const pending = new Map();
      for (const e of events) {
        for (const b of e.message?.content ?? []) {
          if (b.type === "tool_use") { const c = { tool: b.name, input: b.input }; pending.set(b.id, c); calls.push(c); }
          if (b.type === "tool_result" && pending.has(b.tool_use_id)) {
            const text = typeof b.content === "string" ? b.content : (b.content ?? []).map((x) => x.text ?? "").join("");
            Object.assign(pending.get(b.tool_use_id), { isError: !!b.is_error, output: text.slice(0, 4000) });
          }
        }
      }
      const result = events.find((e) => e.type === "result");
      const init = events.find((e) => e.type === "system" && e.subtype === "init");
      resolve({ code, ms: Date.now() - t0, answer: result?.result ?? null, calls, model: init?.model, mcp: init?.mcp_servers, usage: result?.usage, cost_usd: result?.total_cost_usd, num_turns: result?.num_turns, stderr: err.slice(-2000) });
    });
  });
}

for (const q of qs) {
  const before = (await fs.readFile(HOOK_LOG, "utf8").catch(() => "")).split("\n").filter(Boolean).length;
  console.log(`▶ ${q.id}: ${q.question}`);
  const r = await runOne(q.question);
  const hook = (await fs.readFile(HOOK_LOG, "utf8").catch(() => "")).split("\n").filter(Boolean).slice(before).map((l) => JSON.parse(l));
  await fs.appendFile(traceFile, JSON.stringify({ id: q.id, question: q.question, ...r, hook }) + "\n");
  console.log(`  ${(r.ms / 1000).toFixed(0)} giây · ${r.calls.length} lần gọi tool · hook: ${hook.map((h) => h.verdict).join(",") || "-"} · model ${r.model}`);
}
console.log(`Xong → ${traceFile}`);
