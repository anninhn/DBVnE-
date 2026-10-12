/**
 * Bản tóm tắt cấu trúc từng dataset của bộ thử v7 — cơ sở để gắn nhãn hồ sơ ngữ nghĩa
 * (nhãn đúng) và để đưa cho AI đề xuất hồ sơ. Không phân tích gì, chỉ "nhìn".
 *
 *   node --experimental-strip-types --import ./prototypes/insight-demo/bench/node-loader/register.mjs \
 *     prototypes/insight-demo/bench/v7/dump-datasets.mts
 * Ra: data/insight/v7/dumps/<slug>.txt (không commit — chứa dữ liệu).
 */
import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import * as XLSX from "xlsx";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getDatasetBySlug } from "@/lib/datasets/read";
import { getR2Bucket, getR2Client } from "@/lib/r2/client";
import { parseCSV } from "@/lib/parse/csv";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data/insight/v7/dumps");
const RAW = path.join(ROOT, "data/insight/cache/raw");
const BIG_MB = 50;
const { datasets } = JSON.parse(await fs.readFile(path.join(ROOT, "prototypes/insight-demo/bench/v7/pilot-datasets.json"), "utf8"));

function keyFromUrl(url: string): string {
  const base = (process.env.R2_PUBLIC_BASE ?? "").replace(/\/$/, "");
  if (base && url.startsWith(`${base}/`)) return decodeURIComponent(url.slice(base.length + 1));
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

async function fetchFile(key: string, ext: string, rangeBytes?: number): Promise<Buffer> {
  const f = path.join(RAW, `${createHash("sha1").update(key + (rangeBytes ?? "")).digest("hex")}.${ext}`);
  try {
    return await fs.readFile(f);
  } catch {
    const o = await getR2Client().send(new GetObjectCommand({ Bucket: getR2Bucket(), Key: key, ...(rangeBytes ? { Range: `bytes=0-${rangeBytes - 1}` } : {}) }));
    const b = Buffer.from(await o.Body!.transformToByteArray());
    await fs.writeFile(f, b);
    return b;
  }
}

const cut = (v: unknown, n = 40) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").slice(0, n));

function describeTable(header: string[], rows: string[][], partial: boolean): string {
  const out: string[] = [`cột (${header.length}): ${JSON.stringify(header)}`, `số dòng${partial ? " (chỉ phần đầu file)" : ""}: ${rows.length}`, "từng cột:"];
  header.forEach((h, i) => {
    const vals = rows.map((r) => (r[i] ?? "").trim());
    const nonEmpty = vals.filter((v) => v !== "");
    const distinct = [...new Set(nonEmpty)];
    const num = nonEmpty.filter((v) => /^-?[\d.,]+$/.test(v)).length;
    out.push(`  - ${h}: ${distinct.length} giá trị khác nhau, rỗng ${vals.length - nonEmpty.length}, dạng số ${num}/${nonEmpty.length}; mẫu: ${JSON.stringify(distinct.slice(0, 8).map((v) => cut(v, 30)))}`);
  });
  out.push("5 dòng đầu:", ...rows.slice(0, 5).map((r) => `  ${JSON.stringify(r.map((c) => cut(c, 30)))}`));
  return out.join("\n");
}

for (const d of datasets) {
  const ds = await getDatasetBySlug(d.slug);
  if (!ds) {
    console.log("không thấy", d.slug);
    continue;
  }
  const parts: string[] = [
    `# ${ds.title}`,
    `slug: ${d.slug}`,
    `nguồn: ${JSON.stringify(ds.source)}`,
    `mô tả: ${cut(ds.description, 600)}`,
    `năm (metadata): ${JSON.stringify(ds.year_range)}`,
    `dictionary: ${JSON.stringify((ds.data_dictionary ?? []).map((c: Record<string, unknown>) => ({ ten: c.name ?? c.column, kieu: c.type, don_vi: c.unit, mo_ta: cut(c.description, 80) })))}`,
  ];
  for (const r of ds.resources) {
    if (!r.file_url) continue;
    const key = keyFromUrl(r.file_url);
    const ext = (r.file_type ?? path.extname(key).slice(1)).toLowerCase();
    const big = (r.file_size_mb ?? 0) > BIG_MB;
    parts.push(`\n## file ${path.basename(key)} (${ext}, ${r.file_size_mb ?? "?"} MB)${big ? " — CHỈ ĐỌC 256 KB ĐẦU" : ""}`);
    const buf = await fetchFile(key, ext, big ? 256 * 1024 : undefined);
    if (ext === "csv") {
      let rows = parseCSV(buf.toString("utf8")).filter((x) => x.some((c) => c.trim() !== ""));
      if (big) rows = rows.slice(0, -1);
      parts.push(describeTable(rows[0].map((h) => h.trim()), rows.slice(1), big));
    } else if (ext === "xlsx" || ext === "xls") {
      const wb = XLSX.read(buf);
      for (const sn of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, defval: null, raw: true, blankrows: false });
        const nCols = Math.max(0, ...rows.map((x) => x.length));
        parts.push(`\n### sheet "${sn}": ${rows.length} dòng không rỗng × ${nCols} cột`);
        rows.slice(0, 14).forEach((x, i) => parts.push(`  dòng ${i}: ${JSON.stringify(x.slice(0, 20).map((c) => cut(c, 28)))}`));
        if (rows.length > 14) parts.push(`  … dòng cuối: ${JSON.stringify(rows[rows.length - 1].slice(0, 20).map((c) => cut(c, 28)))}`);
      }
    } else if (ext === "geojson" || ext === "json") {
      const g = JSON.parse(buf.toString("utf8"));
      const feats = g.features ?? [];
      const keys = [...new Set(feats.flatMap((f: { properties?: object }) => Object.keys(f.properties ?? {})))];
      parts.push(`đối tượng: ${feats.length}; loại hình học: ${JSON.stringify([...new Set(feats.map((f: { geometry?: { type?: string } }) => f.geometry?.type))])}`);
      parts.push(`thuộc tính: ${JSON.stringify(keys)}`);
      feats.slice(0, 4).forEach((f: { properties?: object }) => parts.push(`  ${JSON.stringify(f.properties).slice(0, 400)}`));
    } else {
      parts.push("(định dạng chưa tóm tắt được)");
    }
  }
  await fs.writeFile(path.join(OUT, `${d.slug}.txt`), parts.join("\n"));
  console.log("ok", d.slug);
}
