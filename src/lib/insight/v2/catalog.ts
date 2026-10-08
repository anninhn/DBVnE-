/**
 * Danh mục chỉ tiêu — chỉ mục tìm kiếm hiện có (spec 005) xuống tới CẤP CHỈ TIÊU,
 * cộng DỮ KIỆN ĐO TỪ CHÍNH FILE (số tỉnh, năm thật có số, nhóm con, 63/34…).
 *
 * Không chép dữ liệu: mỗi dòng chỉ mô tả một chỉ tiêu; số liệu vẫn đọc tại chỗ khi
 * phân tích. Dùng chung code tìm kiếm (rankByVector, rankByKeyword, fuse/RRF).
 *
 * VECTOR: mỗi chỉ tiêu dùng CHUNG vector của dataset chứa nó, lấy từ chỉ mục tìm kiếm
 * sẵn có (`_index/retrieval.json`) — không gọi thêm embedding. Lý do: bản miễn phí của
 * embedding Gemini giới hạn 100 lượt/phút và tính TỪNG đoạn văn trong lô là một lượt
 * (đo 2026-10-09: dựng danh mục bị 429). Nhánh ngữ nghĩa tìm đúng DATASET; nhánh từ
 * khoá ở cấp chỉ tiêu phân biệt CỘT; bước AI chọn chỉ tiêu đúng nghĩa lo phần còn lại.
 *
 * Pilot: lưu local (data/insight/catalog.json). Khi đưa vào app: lưu R2 cạnh
 * `_index/retrieval.json` và cập nhật theo slug ở hook upload/sửa/xoá.
 */

import { promises as fs } from "fs";
import path from "path";
import { fetchListingIndex } from "@/lib/datasets/index-json";
import { embedQuery } from "@/lib/retrieval/embed";
import { loadVectorIndex, rankByVector } from "@/lib/retrieval/vector-store";
import { rankByKeyword } from "@/lib/retrieval/keyword";
import { fuse } from "@/lib/retrieval/fuse";
import { tokenize } from "@/lib/retrieval";
import type { RetrievalIndex } from "@/lib/retrieval/types";
import { loadDataset } from "../load";
import { sliceTable, SliceError, type DatasetProfile, type RawTable } from "../dataset";
import { subgroupOf } from "../measures";
import { INSIGHT_DATA_DIR } from "../session";

const CATALOG_FILE = path.join(INSIGHT_DATA_DIR, "catalog.json");
const MIN_PROVINCES = 50;
const MAX_COMBOS_PER_MEASURE = 30;
const TOTAL_VALUES = /^(tổng số|tổng|chung|toàn bộ|cả nước)$/i;

export interface CatalogEntry {
  id: string;
  slug: string;
  datasetTitle: string;
  source: string;
  measure: string;
  /** Giá trị đã chốt cho các chiều phụ (rỗng nếu dataset không có chiều phụ) */
  dims: Record<string, string>;
  /** Tên hiển thị: chỉ tiêu + giá trị chiều */
  label: string;
  unit?: string;
  additive: boolean;
  subgroup: string | null;
  scheme: "63" | "34" | null;
  province: { n: number; years: number[] } | null;
  nation: { years: number[] } | null;
  provisional: number[];
  text: string;
  keywords: string[];
  vector: number[];
}

export interface Catalog {
  builtAt: string;
  entries: CatalogEntry[];
  skipped: { slug: string; reason: string }[];
}

let memo: Catalog | null = null;

// ── Lưu / nạp (vector dạng base64 Float32 để file gọn) ───────────────────────

function encodeVec(v: number[]): string {
  return Buffer.from(new Float32Array(v).buffer).toString("base64");
}
function decodeVec(s: string): number[] {
  const b = Buffer.from(s, "base64");
  return Array.from(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4));
}

export async function loadCatalog(): Promise<Catalog | null> {
  if (memo) return memo;
  try {
    const raw = JSON.parse(await fs.readFile(CATALOG_FILE, "utf8"));
    memo = { ...raw, entries: raw.entries.map((e: CatalogEntry & { v: string }) => ({ ...e, vector: decodeVec(e.v) })) };
    return memo;
  } catch {
    return null;
  }
}

async function saveCatalog(c: Catalog) {
  await fs.mkdir(INSIGHT_DATA_DIR, { recursive: true });
  const out = { ...c, entries: c.entries.map(({ vector, ...e }) => ({ ...e, v: encodeVec(vector) })) };
  await fs.writeFile(CATALOG_FILE, JSON.stringify(out));
  memo = c;
}

// ── Dựng ─────────────────────────────────────────────────────────────────────

/** Các tổ hợp giá trị chiều cần liệt kê cho một cột đo. Chiều có "Tổng số" → chốt Tổng số. */
function dimCombos(p: DatasetProfile): { combos: Record<string, string>[]; truncated: boolean } {
  let combos: Record<string, string>[] = [{}];
  for (const d of p.dims) {
    if (d.total <= 1) continue;
    const total = d.values.find((v) => TOTAL_VALUES.test(v.trim()));
    const values = total ? [total] : d.values.slice(0, d.total);
    combos = combos.flatMap((c) => values.map((v) => ({ ...c, [d.name]: v })));
    if (combos.length > MAX_COMBOS_PER_MEASURE) return { combos: combos.slice(0, MAX_COMBOS_PER_MEASURE), truncated: true };
  }
  return { combos, truncated: false };
}

function facts(t: RawTable, p: DatasetProfile, measure: string, dims: Record<string, string>) {
  const yearsOf = (level: "province" | "nation") => {
    try {
      const s = sliceTable(t, p, { slug: p.slug, measure, dims, level });
      return { n: new Set(s.points.map((x) => x.geo)).size, years: [...new Set(s.points.map((x) => x.year))].sort((a, b) => a - b), scheme: s.scheme };
    } catch (e) {
      if (e instanceof SliceError) return null;
      throw e;
    }
  };
  const prov = yearsOf("province");
  const nat = yearsOf("nation");
  return {
    province: prov && prov.n ? { n: prov.n, years: prov.years } : null,
    nation: nat && nat.years.length ? { years: nat.years } : null,
    scheme: (prov?.scheme ?? null) as "63" | "34" | null,
  };
}

async function entriesForDataset(slug: string): Promise<Omit<CatalogEntry, "vector">[]> {
  const { table, profile } = await loadDataset(slug);
  const out: Omit<CatalogEntry, "vector">[] = [];
  const { combos } = dimCombos(profile);
  for (const m of profile.measures) {
    for (const dims of combos) {
      const f = facts(table, profile, m.name, dims);
      if (!f.province && !f.nation) continue;
      const dimText = Object.values(dims).filter((v) => !TOTAL_VALUES.test(v.trim())).join(", ");
      const label = dimText ? `${m.name} — ${dimText}` : m.name;
      const text = `${label}\n${profile.title}${m.unit ? `\nĐơn vị: ${m.unit}` : ""}`;
      out.push({
        id: "",
        slug,
        datasetTitle: profile.title,
        source: profile.source,
        measure: m.name,
        dims,
        label,
        unit: m.unit,
        additive: m.additive,
        subgroup: subgroupOf(label),
        scheme: f.scheme,
        province: f.province,
        nation: f.nation,
        provisional: profile.provisionalYears,
        text,
        keywords: [...new Set(tokenize(`${label} ${profile.title}`))],
      });
    }
  }
  return out;
}

export async function buildCatalog(onProgress?: (msg: string) => void): Promise<Catalog> {
  const listing = (await fetchListingIndex()).filter((e) => e.status !== "deleted");
  const draft: Omit<CatalogEntry, "vector">[] = [];
  const skipped: { slug: string; reason: string }[] = [];
  const queue = [...listing];
  let done = 0;
  const worker = async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      try {
        draft.push(...(await entriesForDataset(e.slug)));
      } catch (err) {
        skipped.push({ slug: e.slug, reason: (err as Error).message.slice(0, 160) });
      }
      done++;
      if (done % 50 === 0) onProgress?.(`Đã đọc ${done}/${listing.length} dataset`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  draft.forEach((d, i) => (d.id = `m${String(i + 1).padStart(5, "0")}`));
  const index = await loadVectorIndex();
  const vecOf = new Map(index.entries.map((e) => [e.slug, e.vector]));
  const entries: CatalogEntry[] = [];
  for (const d of draft) {
    const vector = vecOf.get(d.slug);
    if (!vector) {
      skipped.push({ slug: d.slug, reason: "dataset chưa có trong chỉ mục tìm kiếm" });
      continue;
    }
    entries.push({ ...d, vector });
  }
  const cat: Catalog = { builtAt: new Date().toISOString(), entries, skipped };
  await saveCatalog(cat);
  return cat;
}

// ── Tìm ──────────────────────────────────────────────────────────────────────

export function usableAt(e: CatalogEntry, level: "province" | "nation"): boolean {
  return level === "province" ? !!e.province && e.province.n >= MIN_PROVINCES : !!e.nation;
}

/** Tìm chỉ tiêu cho một khái niệm: vector + từ khoá, trộn RRF. Trả ứng viên dùng được ở cấp cần. */
export async function searchMeasures(
  cat: Catalog,
  concept: string,
  level: "province" | "nation",
  limit = 10
): Promise<{ entries: CatalogEntry[]; degraded?: string }> {
  const query = level === "province" ? `${concept} theo tỉnh` : concept;
  const pseudo: RetrievalIndex = {
    builtAt: cat.builtAt,
    dimensions: cat.entries[0]?.vector.length ?? 0,
    entries: cat.entries.map((e) => ({ slug: e.id, vector: e.vector, text: e.text, keywords: e.keywords, sourceFingerprint: "", builtAt: cat.builtAt })),
  };
  let degraded: string | undefined;
  const qv = await embedQuery(query).catch((err: Error) => {
    degraded = `Chỉ tìm theo từ khoá — không gọi được embedding: ${err.message}`;
    return null;
  });
  const semantic = qv ? rankByVector(pseudo, qv) : [];
  const keyword = rankByKeyword(pseudo, query);
  const byId = new Map(cat.entries.map((e) => [e.id, e]));
  const ranked = fuse(semantic, keyword, 200)
    .map((h) => byId.get(h.slug)!)
    .filter((e) => e && usableAt(e, level));
  return { entries: ranked.slice(0, limit), ...(degraded ? { degraded } : {}) };
}
