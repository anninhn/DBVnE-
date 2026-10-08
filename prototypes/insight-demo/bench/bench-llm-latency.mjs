// Bậc 0: đo độ trễ 3 lời gọi của luồng chuẩn — mỗi lượt một tiến trình (cold) vs một tiến trình sống (warm).
// Chạy: node prototypes/insight-demo/bench/bench-llm-latency.mjs  (cần INSIGHT_ZAI_API_KEY trong .env.local và một phiên đề xuất có candidates)
import { spawn } from "node:child_process";
import fs from "node:fs";
const ROOT = "/Users/ninhnguyen/Desktop/DB_VNExpress", D = `${ROOT}/data/insight`;
const env0 = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split("\n").filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const env = { PATH: process.env.PATH, HOME: process.env.HOME, CLAUDE_CONFIG_DIR: `${D}/claude-config`, ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic", ANTHROPIC_AUTH_TOKEN: env0.INSIGHT_ZAI_API_KEY, API_TIMEOUT_MS: "600000", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" };
const SYS = "Bạn là bộ xử lý của harness dữ liệu báo chí. Chỉ trả về đúng định dạng được yêu cầu, không giải thích.";

const sess = JSON.parse(fs.readFileSync(`${D}/sessions/e17b0aaf-a004-471f-87d2-ff8dad09a0c5.json`, "utf8"));
const cands = sess.candidates.list.map(c => ({ khai_niem: c.concept, chi_tieu: c.options.map(o => ({ id: o.id, chi_tieu: o.measure, dataset: o.datasetTitle, so_tinh: o.provinces, nam: o.years.length ? `${o.years[0]}-${o.years.at(-1)}` : "", nhom_con: o.subgroup, khong_dung_duoc: o.excluded })) }));

const PROMPTS = {
  hieu_cau_hoi: `Phân tích câu hỏi của phóng viên, trả JSON đúng khuôn:
{"luong":"chuan|kham_pha|hoi_lai","khai_niem":[...],"cap":"province|region|nation","danh_muc_tinh":"63|34|khong_ro","ho_goi_y":[...],"hoi_lai":null}
Các họ: thay_doi_xu_huong, ky_luc, xep_hang, ngoai_le, chenh_lech, quy_mo_ty_trong, quan_he_theo_vung, quan_he_co_kiem_soat.
Câu hỏi: "Thu nhập và mức sinh có liên quan gì nhau giữa các tỉnh? Vùng nào khác biệt?"`,
  chon_chi_tieu: `Với mỗi khái niệm, trả JSON {"chon":[{"khai_niem":..., "ids":[...]}]} gồm id MỌI chỉ tiêu ĐÚNG NGHĨA, đúng nhất trước. Chỉ xét nghĩa, bỏ chỉ tiêu chỉ trùng chữ.
${JSON.stringify(cands)}`,
  viet_loi: `Viết tít (≤ 15 từ) và đoạn 2–3 câu tiếng Việt cho phát hiện dưới đây. KHÔNG viết số; dùng chỗ trống {r_ca_nuoc}, {r_dbsh}, {r_dbscl}. Không dùng từ nhân quả, chỉ nói về tỉnh. Trả JSON {"tieu_de":...,"doan":...}.
Phát hiện: quan hệ ngược chiều giữa thu nhập bình quân một lao động và tổng tỷ suất sinh trên 63 tỉnh năm 2024 (mức vừa); chặt ở Đồng bằng sông Hồng; gần như không có ở Đồng bằng sông Cửu Long; lặp lại năm 2018.`,
};
const ORDER = ["hieu_cau_hoi", "chon_chi_tieu", "viet_loi"];
const base = ["-p", "--output-format", "stream-json", "--verbose", "--model", "glm-5.3", "--tools", "", "--system-prompt", SYS];

function cold(prompt) {
  return new Promise((res) => {
    const t0 = Date.now();
    const c = spawn("claude", [...base, prompt], { cwd: `${D}/workdir`, env, stdio: ["ignore", "pipe", "pipe"] });
    let buf = "", out = { };
    c.stdout.on("data", d => { buf += d; });
    c.on("close", () => {
      for (const l of buf.split("\n")) { try { const e = JSON.parse(l); if (e.type === "result") out = e; } catch {} }
      res({ ms: Date.now() - t0, api: out.duration_api_ms, text: String(out.result ?? "").slice(0, 160), usage: out.usage });
    });
  });
}

function warmSession() {
  const c = spawn("claude", [...base, "--input-format", "stream-json"], { cwd: `${D}/workdir`, env, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "", waiter = null;
  c.stdout.on("data", d => {
    buf += d; let i;
    while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { const e = JSON.parse(l); if (e.type === "result" && waiter) { const w = waiter; waiter = null; w(e); } } catch {} }
  });
  return {
    ask(prompt) {
      return new Promise((res) => {
        const t0 = Date.now();
        waiter = (e) => res({ ms: Date.now() - t0, api: e.duration_api_ms, text: String(e.result ?? "").slice(0, 160), usage: e.usage });
        c.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: prompt } }) + "\n");
      });
    },
    close() { c.stdin.end(); },
  };
}

const rows = [];
for (let rep = 1; rep <= 2; rep++) {
  let tot = 0;
  for (const k of ORDER) { const r = await cold(PROMPTS[k]); tot += r.ms; rows.push({ mode: "cold", rep, k, ...r }); }
  rows.push({ mode: "cold", rep, k: "TỔNG", ms: tot });
  const w = warmSession(); tot = 0;
  for (const k of ORDER) { const r = await w.ask(PROMPTS[k]); tot += r.ms; rows.push({ mode: "warm", rep, k, ...r }); }
  w.close(); rows.push({ mode: "warm", rep, k: "TỔNG", ms: tot });
}
for (const r of rows) console.log(`${r.mode} #${r.rep} ${r.k.padEnd(14)} ${(r.ms / 1000).toFixed(1)}s` + (r.api ? ` (api ${(r.api / 1000).toFixed(1)}s, in ${r.usage?.input_tokens}+${r.usage?.cache_read_input_tokens} out ${r.usage?.output_tokens})` : "") + (r.text ? `  → ${r.text.replace(/\s+/g, " ")}` : ""));
fs.writeFileSync("/tmp/insight-test/bench.json", JSON.stringify(rows, null, 1));
