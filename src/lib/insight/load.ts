/**
 * Đọc tại chỗ: metadata + file CSV của một dataset, dùng lại đúng các hàm mà trang
 * preview đang dùng (getDatasetBySlug, getObject, parseCSV) — không có bộ đọc thứ hai
 * có thể lệch.
 *
 * File tải về được cache trên đĩa (data/insight/cache/) để không tải lại mỗi lượt.
 */

import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import { getDatasetBySlug } from "@/lib/datasets/read";
import { getObject } from "@/lib/r2/get";
import { parseCSV } from "@/lib/parse/csv";
import { INSIGHT_DATA_DIR } from "./session";
import { profileTable, verifyAdditive, type DatasetProfile, type RawTable } from "./dataset";

const CACHE_DIR = path.join(INSIGHT_DATA_DIR, "cache");

/** File lớn hơn ngưỡng này (vd điểm thi THPT 450 MB) cần đọc theo luồng + gộp — chưa có ở lát 1. */
const MAX_MB = 50;

export class LoadError extends Error {}

const memo = new Map<string, { table: RawTable; profile: DatasetProfile }>();

function keyFromUrl(url: string): string {
  const base = (process.env.R2_PUBLIC_BASE ?? "").replace(/\/$/, "");
  if (base && url.startsWith(`${base}/`)) return decodeURIComponent(url.slice(base.length + 1));
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

export async function loadDataset(slug: string): Promise<{ table: RawTable; profile: DatasetProfile }> {
  const hit = memo.get(slug);
  if (hit) return hit;

  const ds = await getDatasetBySlug(slug);
  if (!ds) throw new LoadError(`Không có dataset "${slug}".`);

  const res = ds.resources.find((r) => r.file_url && /\.csv($|\?)/i.test(r.file_url));
  if (!res?.file_url) {
    const types = ds.resources.map((r) => r.file_type ?? "?").join(", ");
    throw new LoadError(`"${slug}" không có file CSV (có: ${types}). Lát 1 chỉ đọc CSV.`);
  }
  if ((res.file_size_mb ?? ds.total_size_mb) > MAX_MB) {
    throw new LoadError(
      `"${slug}" nặng ${Math.round(res.file_size_mb ?? ds.total_size_mb)} MB — file lớn cần đọc theo luồng và gộp trước, chưa hỗ trợ ở lát 1.`
    );
  }

  const key = keyFromUrl(res.file_url);
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${createHash("sha1").update(key).digest("hex")}.csv`);
  let text: string;
  try {
    text = await fs.readFile(cacheFile, "utf8");
  } catch {
    const buf = await getObject(key);
    text = buf.toString("utf8");
    await fs.writeFile(cacheFile, text);
  }

  const rows = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) throw new LoadError(`"${slug}": file CSV không có dòng dữ liệu.`);

  const table: RawTable = {
    slug,
    title: ds.title,
    source: ds.source,
    yearRange: ds.year_range ?? [],
    dictionary: ds.data_dictionary ?? [],
    header: rows[0].map((h) => h.trim()),
    rows: rows.slice(1),
  };
  const profile = profileTable(table);
  verifyAdditive(table, profile);
  const out = { table, profile };
  memo.set(slug, out);
  return out;
}
