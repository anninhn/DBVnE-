// Thử xác minh cách đọc bằng "đọc hai lần độc lập rồi so" trên 4 dataset XLSX của kho.
// Chạy: node --experimental-strip-types prototypes/insight-demo/bench/xlsx-two-readings.mjs
// Cách đọc ở đây là MÔ TẢ JSON (sheet, dòng header, vai trò cột) do code thực thi — không chạy code do AI viết.
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
const ROOT = "/Users/ninhnguyen/Desktop/DB_VNExpress";
const require = createRequire(`${ROOT}/package.json`);
const XLSX = require("xlsx");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { matchGeo } = await import(`${ROOT}/src/lib/insight/geo.ts`);
const D = `${ROOT}/data/insight`;
const env0 = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split("\n").filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const idx = JSON.parse(fs.readFileSync("/tmp/idx.json", "utf8"));
const s3 = new S3Client({ region: "auto", endpoint: `https://${env0.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env0.R2_ACCESS_KEY_ID, secretAccessKey: env0.R2_SECRET_ACCESS_KEY } });

async function getWorkbook(d) {
  const r = d.resources.find(r => r.type === "xlsx");
  const f = `${D}/cache/xlsx/${d.slug}.xlsx`;
  if (!fs.existsSync(f)) {
    const o = await s3.send(new GetObjectCommand({ Bucket: env0.R2_BUCKET_NAME, Key: r.r2_key }));
    fs.writeFileSync(f, Buffer.from(await o.Body.transformToByteArray()));
  }
  return XLSX.read(fs.readFileSync(f));
}
const rowsOf = (ws) => XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: true });
const cell = (v) => v === null ? "" : String(v).replace(/\s+/g, " ").slice(0, 30);
const MAX_COLS = 60;

const isNum = (v) => typeof v === "number" || (v !== null && /^-?[\d.,]+$/.test(String(v).trim()) && String(v).trim() !== "");
function inspect(wb) {
  return wb.SheetNames.map((sn) => {
    const rows = rowsOf(wb.Sheets[sn]);
    const nonEmpty = rows.map((r, i) => [i, r]).filter(([, r]) => r && r.some(v => v !== null && String(v).trim() !== ""));
    const show = (list) => list.map(([i, r]) => `  dòng ${i}: ${JSON.stringify(r.slice(0, MAX_COLS).map(cell))}`).join("\n");
    const nCols = Math.max(0, ...rows.map(r => r.length));
    const mid = Math.floor(nonEmpty.length * 0.45);
    // Mẫu dòng: N = có ô số, T = chỉ có chữ — lộ ra dòng nhóm chen giữa các dòng số
    const pattern = nonEmpty.slice(0, 60).map(([, r]) => (r.some(isNum) ? "N" : "T")).join("");
    // Nhãn lặp lại nhiều lần trong cùng một cột — dấu hiệu khối dòng con lặp theo nhóm
    const freq = new Map();
    for (const [, r] of nonEmpty) r.forEach((v, c) => { if (v !== null && !isNum(v)) { const k = `cột ${c}: "${cell(v).trim()}"`; freq.set(k, (freq.get(k) ?? 0) + 1); } });
    const repeated = [...freq.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return [
      `### Sheet "${sn}" — ${rows.length} dòng (${nonEmpty.length} dòng có nội dung), ${nCols} cột${nCols > MAX_COLS ? ` (chỉ in ${MAX_COLS} cột đầu)` : " (in đủ mọi cột)"}`,
      show(nonEmpty.slice(0, 14)),
      "  …",
      show(nonEmpty.slice(mid, mid + 8)),
      "  …",
      show(nonEmpty.slice(-4)),
      `  Mẫu 60 dòng có nội dung đầu (N = có số, T = chỉ chữ): ${pattern}`,
      `  Nhãn lặp lại ≥ 3 lần: ${repeated.length ? repeated.map(([k, n]) => `${k} ×${n}`).join("; ") : "không có"}`,
    ].join("\n");
  }).join("\n\n");
}

const SCHEMA = `{"bang":[{"ten":"...","loai":"so_lieu|danh_sach|tu_dien|suy_ra|khac","sheets":["..."],"xep_chong_chieu":"tên chiều nếu xếp chồng nhiều sheet cùng cấu trúc, ngược lại null","dong_header":0,"dong_du_lieu_tu":1,"bo_dong":[],"dong_nhom":{"cot_nhan":1,"ten":"...","vai_tro":"dia_ly|chieu"},"cot":[{"vi_tri":0,"ten":"...","vai_tro":"dia_ly|thoi_gian|chi_tieu|chieu|van_ban|bo"}]}]}`;
const TYPES = `Nhiều sheet có CÙNG cấu trúc cột (vd mỗi sheet một khu vực) thì gộp thành MỘT bảng, liệt kê đủ các sheet và đặt xep_chong_chieu là tên chiều phân biệt (vd "Khu vực"). Loại bảng: so_lieu = bảng số liệu thống kê (mỗi dòng một địa phương/năm, có cột số); danh_sach = mỗi dòng một đối tượng/sự kiện/người; tu_dien = mô tả các cột; suy_ra = tính lại từ sheet khác (vd bảng xếp hạng); khac = còn lại. Chỉ số dòng và cột tính từ 0 như trong bản mô tả. bo_dong = chỉ số dòng TUYỆT ĐỐI cần bỏ trong vùng dữ liệu (vd dòng đánh số cột A,B,1,2). Vai trò cột: dia_ly (tên tỉnh/xã), thoi_gian, chi_tieu (cột số đo), chieu (phân loại), van_ban (chữ tự do), bo (CHỈ dùng cho cột STT hoặc cột trống — mọi cột có nội dung phải giữ, chữ tự do thì là van_ban). Phải khai ĐỦ mọi cột có nội dung của bảng, không được bỏ sót cột nào. dong_nhom: khi bảng LỒNG NHAU — có "dòng nhóm" chỉ chứa nhãn, không có số (vd tên tỉnh), đứng đầu một khối "dòng con" có số (vd các khu vực kinh tế lặp lại dưới mỗi tỉnh) — thì khai dong_nhom: cot_nhan là cột chứa nhãn nhóm, ten là tên chiều mới, vai_tro là vai trò của nhãn nhóm; nhãn nhóm được điền xuống mọi dòng con, còn nhãn của dòng con giữ ở cột của nó (thường là chieu). Bảng không lồng nhau thì dong_nhom = null. Gợi ý: mẫu N/T xen kẽ đều đặn và nhãn lặp lại nhiều lần là dấu hiệu bảng lồng nhau.`;
const PROMPT_A = (dump) => `Bạn là chuyên viên thống kê. Đọc bản mô tả file Excel dưới đây và viết CÁCH ĐỌC cho từng bảng trong file. ${TYPES}\nTrả về DUY NHẤT JSON đúng khuôn:\n${SCHEMA}\n\n${dump}`;
const PROMPT_B = (dump) => `Dưới đây là nội dung thô của một workbook. Nhiệm vụ: xác định trong workbook có những bảng nào, mỗi bảng nằm ở sheet nào, header ở dòng nào, dữ liệu bắt đầu từ dòng nào, dòng nào phải loại, và mỗi cột đóng vai trò gì. ${TYPES}\nChỉ in JSON theo khuôn sau, không giải thích:\n${SCHEMA}\n\n${dump}`;

const cenv = { PATH: process.env.PATH, HOME: process.env.HOME, CLAUDE_CONFIG_DIR: `${D}/claude-config`, ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic", ANTHROPIC_AUTH_TOKEN: env0.INSIGHT_ZAI_API_KEY, API_TIMEOUT_MS: "600000", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" };
function ask(prompt) {
  return new Promise((res) => {
    const t0 = Date.now();
    const c = spawn("claude", ["-p", prompt, "--output-format", "json", "--model", "glm-5.3", "--tools", "", "--system-prompt", "Chỉ trả JSON hợp lệ."], { cwd: `${D}/workdir`, env: cenv, stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; c.stdout.on("data", d => out += d);
    c.on("close", () => {
      let text = ""; try { text = JSON.parse(out).result ?? ""; } catch {}
      const m = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
      let spec = null; try { spec = JSON.parse(m[0]); } catch {}
      res({ spec, ms: Date.now() - t0, raw: text.slice(0, 300) });
    });
  });
}

// Thực thi cách đọc → các bảng. Hỗ trợ dòng nhóm: dòng không có số ở mọi cột chỉ tiêu → nhãn nhóm, điền xuống dòng con.
function execute(wb, spec) {
  const out = [];
  for (const t of spec?.bang ?? []) {
    if (!["so_lieu", "danh_sach"].includes(t.loai)) { out.push({ ten: t.ten, loai: t.loai, sheets: t.sheets, rows: [] }); continue; }
    const rows = [];
    const measureCols = (t.cot ?? []).filter(c => c.vai_tro === "chi_tieu").map(c => c.vi_tri);
    const g = t.dong_nhom ?? null;
    for (const sn of t.sheets ?? []) {
      const ws = wb.Sheets[sn]; if (!ws) continue;
      const all = rowsOf(ws);
      const skip = new Set(t.bo_dong ?? []);
      let group = null;
      for (let i = t.dong_du_lieu_tu ?? (t.dong_header + 1); i < all.length; i++) {
        const r = all[i]; if (skip.has(i) || !r || r.every(v => v === null || String(v).trim() === "")) continue;
        if (g && measureCols.length && measureCols.every(c => !isNum(r[c])) && r[g.cot_nhan] !== null && String(r[g.cot_nhan]).trim() !== "") {
          group = r[g.cot_nhan]; continue;
        }
        const rec = {};
        for (const c of t.cot ?? []) if (c.vai_tro !== "bo") rec[c.vi_tri] = { role: c.vai_tro, v: r[c.vi_tri] ?? null };
        if (g) rec["nhom"] = { role: g.vai_tro, v: group };
        if (t.xep_chong_chieu) rec["sheet"] = { role: "chieu", v: sn };
        rows.push(rec);
      }
    }
    out.push({ ten: t.ten, loai: t.loai, sheets: t.sheets, rows, cot: t.cot, dong_nhom: g });
  }
  return out;
}
const num = (v) => typeof v === "number" ? +v.toPrecision(6) : (v !== null && /^-?[\d.,]+$/.test(String(v).trim()) ? String(v).trim() : null);
// Chữ ký so DỮ LIỆU: mỗi dòng = tập giá trị đã chuẩn hoá của mọi cột giữ lại, bất kể đặt tên hay gọi vai trò gì.
const norm = (v) => v === null ? "" : (isNum(v) ? String(+Number(String(v).replace(/,/g, "")).toPrecision(6)) : String(v).replace(/\s+/g, " ").trim().toLowerCase());
function signature(table) {
  return table.rows.map(rec => Object.values(rec).map(x => norm(x.v)).filter(x => x !== "").sort().join("|")).sort();
}
// Khác biệt vai trò (báo riêng, không tính là lệch dữ liệu)
function roleDiff(a, b) {
  const ra = Object.fromEntries((a?.cot ?? []).map(c => [c.vi_tri, c.vai_tro]));
  const rb = Object.fromEntries((b?.cot ?? []).map(c => [c.vi_tri, c.vai_tro]));
  return Object.keys({ ...ra, ...rb }).filter(k => ra[k] !== rb[k]).map(k => `cột ${k}: ${ra[k] ?? "-"} / ${rb[k] ?? "-"}`);
}
function contract(table) {
  if (table.loai !== "so_lieu") return "không áp (không phải bảng số liệu)";
  const issues = [];
  const first = table.rows[0] ?? {};
  const geoKey = Object.keys(first).find(k => first[k].role === "dia_ly");
  if (geoKey) {
    const vals = table.rows.map(r => r[geoKey].v).filter(v => v !== null);
    const ok = vals.filter(v => matchGeo(String(v))).length;
    if (ok / Math.max(1, vals.length) < 0.8) issues.push(`địa lý chỉ khớp ${ok}/${vals.length}`);
  } else issues.push("không có cột địa lý");
  for (const k of Object.keys(first).filter(k => first[k].role === "chi_tieu")) {
    const vals = table.rows.map(r => r[k].v).filter(v => v !== null && String(v).trim() !== "");
    const bad = vals.filter(v => !isNum(v));
    if (bad.length / Math.max(1, vals.length) > 0.05) issues.push(`cột ${k}: ${bad.length}/${vals.length} ô không phải số`);
  }
  if (!table.rows.length) issues.push("0 dòng");
  return issues.length ? "KHÔNG ĐẠT: " + issues.join("; ") : "đạt";
}
// Kiểm cách đọc có tuân thủ luật về cột: khai đủ cột có nội dung, chỉ bỏ STT / cột trống
function columnRules(wb, t) {
  if (!["so_lieu", "danh_sach"].includes(t.loai)) return [];
  const issues = [];
  const ws = wb.Sheets[(t.sheets ?? [])[0]]; if (!ws) return issues;
  const all = rowsOf(ws).slice(t.dong_du_lieu_tu ?? 0);
  const filled = (c) => all.filter(r => r && r[c] !== null && String(r[c]).trim() !== "").length / Math.max(1, all.length);
  const nCols = Math.max(0, ...all.map(r => (r ?? []).length));
  const declared = new Map((t.cot ?? []).map(c => [c.vi_tri, c.vai_tro]));
  const missing = [], droppedContent = [];
  for (let c = 0; c < nCols; c++) {
    if (filled(c) < 0.05) continue; // cột trống
    if (!declared.has(c)) missing.push(c);
    else if (declared.get(c) === "bo") {
      const vals = all.map(r => r?.[c]).filter(v => v !== null && String(v).trim() !== "");
      const isSTT = vals.every(v => /^\d{1,4}$/.test(String(v).trim()));
      if (!isSTT && c !== t.dong_nhom?.cot_nhan) droppedContent.push(c);
    }
  }
  if (missing.length) issues.push(`khai thiếu ${missing.length} cột có nội dung`);
  if (droppedContent.length) issues.push(`bỏ cột có nội dung: ${droppedContent.join(", ")}`);
  return issues;
}
function describeGeo(table) {
  const first = table.rows[0] ?? {};
  const geoKey = Object.keys(first).find(k => first[k].role === "dia_ly");
  if (!geoKey) return "";
  const vals = new Set(table.rows.map(r => r[geoKey].v).filter(Boolean));
  return ` · ${vals.size} địa phương khác nhau`;
}

const results = [];
const ONLY = process.env.ONLY;
for (const d of idx.filter(x => x.resources.some(r => r.type === "xlsx") && (!ONLY || x.slug.includes(ONLY)))) {
  const wb = await getWorkbook(d);
  const dump = inspect(wb);
  const [A, B] = await Promise.all([ask(PROMPT_A(dump)), ask(PROMPT_B(dump))]);
  const tA = execute(wb, A.spec), tB = execute(wb, B.spec);
  console.log(`\n================ ${d.slug}  (A ${(A.ms / 1000).toFixed(0)}s, B ${(B.ms / 1000).toFixed(0)}s)`);
  if (!A.spec || !B.spec) console.log("  JSON lỗi:", !A.spec ? "A " + A.raw : "", !B.spec ? "B " + B.raw : "");
  for (const [name, ts, spec] of [["A", tA, A.spec], ["B", tB, B.spec]]) for (const [ti, t] of ts.entries()) { const cr = columnRules(wb, spec.bang[ti]); if (cr.length) console.log(`  ${name}: ⚠ ${t.ten}: ${cr.join("; ")}`); console.log(`  ${name}: [${t.loai}] ${t.ten} | sheets ${JSON.stringify(t.sheets)} | ${t.rows.length} dòng${describeGeo(t)}${t.dong_nhom ? ` | dòng nhóm: cột ${t.dong_nhom.cot_nhan} → "${t.dong_nhom.ten}" (${t.dong_nhom.vai_tro})` : ""} | hợp đồng: ${contract(t)}`); }
  // So: theo từng sheet, loại bảng + chữ ký dữ liệu
  // Mỗi sheet → phần dòng của nó (bảng xếp chồng được cắt theo sheet; bỏ trường "sheet" do xếp chồng sinh ra)
  const bySheet = (ts) => Object.fromEntries(ts.flatMap(t => (t.sheets ?? []).map(sn => {
    const rows = t.rows.filter(r => !r.sheet || r.sheet.v === sn).map(r => { const { sheet, ...rest } = r; return rest; });
    return [sn, { ...t, rows, stacked: (t.sheets ?? []).length > 1 }];
  })));
  const sA = bySheet(tA), sB = bySheet(tB);
  for (const sn of wb.SheetNames) {
    const a = sA[sn], b = sB[sn];
    const sameType = a?.loai === b?.loai;
    const sameData = a && b ? JSON.stringify(signature(a)) === JSON.stringify(signature(b)) : false;
    const verdict = sameType && sameData ? "KHỚP" : "LỆCH";
    const shape = a && b && a.stacked !== b.stacked ? ` · cách tổ chức khác: ${a.stacked ? "xếp chồng" : "bảng riêng"} / ${b.stacked ? "xếp chồng" : "bảng riêng"}` : "";
    const rd = roleDiff(a, b);
    console.log(`  so sheet "${sn}": loại ${a?.loai ?? "-"} / ${b?.loai ?? "-"} · dòng ${a?.rows.length ?? "-"} / ${b?.rows.length ?? "-"} · dữ liệu ${verdict}${shape}${rd.length ? ` · vai trò khác: ${rd.join(", ")}` : ""}`);
    results.push({ slug: d.slug, sheet: sn, A: a ? { loai: a.loai, n: a.rows.length } : null, B: b ? { loai: b.loai, n: b.rows.length } : null, verdict });
  }
  fs.writeFileSync(`${D}/cache/xlsx/${d.slug}.readings.json`, JSON.stringify({ A: A.spec, B: B.spec }, null, 1));
}
fs.writeFileSync(`${D}/cache/xlsx/_results.json`, JSON.stringify(results, null, 1));
