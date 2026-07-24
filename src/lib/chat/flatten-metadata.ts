/**
 * Flatten metadata + dictionary của tất cả datasets → 1 text block cho LLM context.
 *
 * Discovery Chat (Phase 2 spec 2026-07-24) gửi flatten text cho Gemini cùng câu hỏi
 * của user. LLM đọc metadata + dictionary → trả lời + cite dataset cụ thể.
 *
 * Pattern: tái sửing GitHub Contents API fetch (list.ts + read.ts).
 * Output ~300-400 tokens/dataset — fits Gemini 2.5 Flash context (1M tokens/day free tier).
 *
 * In-memory cache 60s để tránh refetch trong burst (nhiều query liên tiếp).
 * Cache invalidate tự động — đủ fresh cho chat, cheap cho R2/GitHub.
 */

import { parse as parseYaml } from "yaml";
import type { MetadataYaml } from "@/lib/datasets/types";
import { getGithubConfig, rawUrl } from "@/lib/datasets/types";
import { parseDictionaryMarkdown } from "@/lib/datasets/read";
import type { DataDictionaryEntry } from "@/lib/types/dataset";

// ──────────────────────────────────────────────────────────────────────────────
// Cache
// ──────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000; // 1 phút
let _cache: { text: string; at: number } | null = null;

/** Clear cache — cho eval script refresh giữa các run */
export function clearFlattenCache(): void {
  _cache = null;
}

// ──────────────────────────────────────────────────────────────────────────────
// GitHub fetch helpers (pattern list.ts + read.ts)
// ──────────────────────────────────────────────────────────────────────────────

interface GithubContentEntry {
  name: string;
  path: string;
  type: "file" | "dir";
}

function authHeaders(token?: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "vnexpress-data-platform",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function listSlugs(): Promise<string[]> {
  const config = getGithubConfig();
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/datasets?ref=${config.branch}`;
  const res = await fetch(url, {
    headers: { ...authHeaders(config.token), "Cache-Control": "no-cache" },
    cache: "no-store",
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub contents API failed: ${res.status}`);

  const entries = (await res.json()) as GithubContentEntry[];
  return entries.filter((e) => e.type === "dir").map((e) => e.name);
}

async function fetchRaw(path: string): Promise<string | null> {
  const config = getGithubConfig();
  const res = await fetch(rawUrl(config, path), {
    headers: authHeaders(config.token),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    console.warn(`[flatten] fetch fail ${path}: ${res.status}`);
    return null;
  }
  const data = (await res.json()) as { content?: string };
  if (!data.content) return null;
  const b64 = data.content.replace(/\n/g, "");
  return Buffer.from(b64, "base64").toString("utf-8");
}

// ──────────────────────────────────────────────────────────────────────────────
// Formatter — text compact, signal-rich cho LLM
// ──────────────────────────────────────────────────────────────────────────────

const MAX_COLUMNS = 30; // cap columns tránh token bloat cho dataset wide

function formatDataset(
  slug: string,
  meta: MetadataYaml,
  dict: DataDictionaryEntry[],
): string {
  const lines: string[] = [];
  lines.push(`### ${meta.title}`);
  lines.push(`slug: \`${slug}\``);

  if (meta.description) lines.push(`Mô tả: ${meta.description}`);
  if (meta.category) lines.push(`Danh mục: ${meta.category}`);
  if (meta.tags?.length) lines.push(`Tags: ${meta.tags.join(", ")}`);
  if (meta.format) lines.push(`Định dạng: ${meta.format}`);
  if (meta.row_count) lines.push(`Số dòng: ${meta.row_count}`);
  if (meta.coverage?.temporal?.length) {
    lines.push(`Phạm vi thời gian: ${meta.coverage.temporal.join(", ")}`);
  }
  if (meta.coverage?.geographic) {
    lines.push(`Phạm vi địa lý: ${meta.coverage.geographic}`);
  }
  if (meta.feature_count) lines.push(`Số features: ${meta.feature_count}`);
  if (meta.geometry_type) lines.push(`Geometry: ${meta.geometry_type}`);
  if (meta.page_count) lines.push(`Số trang: ${meta.page_count}`);
  if (meta.duration_seconds) {
    lines.push(`Thời lượng: ${Math.round(meta.duration_seconds / 60)} phút`);
  }
  if (meta.key_findings) lines.push(`Tóm tắt: ${meta.key_findings}`);
  if (meta.source) {
    const src =
      typeof meta.source === "string" ? meta.source : meta.source.name;
    if (src) lines.push(`Nguồn: ${src}`);
  }

  // Dictionary entries — column signal quan trọng nhất cho LLM matching
  // ("có data gì về dân số theo tỉnh" match `dan_so` column)
  if (dict.length > 0) {
    lines.push("Các cột/trường dữ liệu:");
    for (const entry of dict.slice(0, MAX_COLUMNS)) {
      const parts = [`  - \`${entry.column_name}\``];
      if (entry.data_type) parts.push(`(${entry.data_type})`);
      if (entry.unit && entry.unit !== "-") parts.push(`[${entry.unit}]`);
      if (entry.description) parts.push(`— ${entry.description}`);
      lines.push(parts.join(" "));
    }
    if (dict.length > MAX_COLUMNS) {
      lines.push(`  - (và ${dict.length - MAX_COLUMNS} cột khác)`);
    }
  }

  return lines.join("\n");
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Flatten tất cả datasets (metadata + dictionary) thành 1 text block cho LLM.
 *
 * Skip soft-deleted + datasets thiếu title. Cache 60s trong memory.
 * Trả text intro + blocks dataset cách nhau bởi `---`.
 */
export async function flattenAllDatasets(): Promise<string> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) {
    return _cache.text;
  }

  const slugs = await listSlugs();
  if (slugs.length === 0) {
    const empty = "(Hiện chưa có dataset nào trong kho.)";
    _cache = { text: empty, at: Date.now() };
    return empty;
  }

  const results = await Promise.allSettled(
    slugs.map(async (slug) => {
      const [yamlText, dictText] = await Promise.all([
        fetchRaw(`datasets/${slug}/metadata.yaml`),
        fetchRaw(`datasets/${slug}/dictionary.md`),
      ]);
      if (!yamlText) return null;
      let meta: MetadataYaml;
      try {
        meta = parseYaml(yamlText) as MetadataYaml;
      } catch {
        return null;
      }
      if (!meta?.title || meta.status === "deleted") return null;
      const dict = dictText ? parseDictionaryMarkdown(dictText) : [];
      return formatDataset(slug, meta, dict);
    }),
  );

  const blocks = results
    .filter(
      (r): r is PromiseFulfilledResult<string | null> => r.status === "fulfilled",
    )
    .map((r) => r.value)
    .filter((b): b is string => b !== null);

  const text =
    blocks.length > 0
      ? `DANH SÁCH DATASET TRONG KHO VnExpress (${blocks.length} datasets):\n\n${blocks.join("\n\n---\n\n")}`
      : "(Hiện chưa có dataset nào hợp lệ trong kho.)";

  _cache = { text, at: Date.now() };
  return text;
}
