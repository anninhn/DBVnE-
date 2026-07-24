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
import {
  fetchFileContents,
  listFolderEntries,
} from "@/lib/github/contents-api";
import { parseDictionaryMarkdown } from "@/lib/datasets/read";
import type { DataDictionaryEntry, Dataset } from "@/lib/types/dataset";

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
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

async function listSlugs(): Promise<string[]> {
  const entries = await listFolderEntries("datasets");
  return entries.filter((e) => e.type === "dir").map((e) => e.name);
}

async function fetchRaw(path: string): Promise<string | null> {
  return (await fetchFileContents(path))?.content ?? null;
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

// ──────────────────────────────────────────────────────────────────────────────
// FOCUS block — Discovery Chat attach dataset
// ──────────────────────────────────────────────────────────────────────────────

const FOCUS_SAMPLE_ROWS = 5; // sample rows bổ trợ minh họa, không phải primary context

/**
 * Build FOCUS block cho Discovery Chat khi user attach dataset cụ thể (click
 * "Hỏi về dataset này" từ sidebar).
 *
 * Format tương tự `formatDataset` NHƯNG:
 * - Toàn bộ data dictionary (không cap MAX_COLUMNS) — AI cần columns đầy đủ để
 *   trả lời chính xác, không phụ thuộc sample rows.
 * - Có marker `🎯 FOCUS DATASET` để system prompt nhận biết priority.
 * - Kèm 5 sample rows đầu (nếu có structured_data) — CHỈ bổ trợ minh họa data
 *   shape/value pattern. Nếu structured_data null (file quá lớn) → block vẫn
 *   đủ metadata + dictionary để AI trả lời chính xác.
 */
export function buildFocusBlock(
  dataset: Dataset,
  sampleRows?: Record<string, string | number | boolean | null>[],
): string {
  const lines: string[] = [];
  lines.push("🎯 FOCUS DATASET (user đã chọn — ưu tiên trả lời dựa trên dataset này):");
  lines.push(`### ${dataset.title}`);
  lines.push(`slug: \`${dataset.slug}\``);

  if (dataset.description) lines.push(`Mô tả: ${dataset.description}`);
  if (dataset.category) lines.push(`Danh mục: ${dataset.category}`);
  if (dataset.tags?.length) lines.push(`Tags: ${dataset.tags.join(", ")}`);

  // Formats — distinct file_type từ resources
  const formats = Array.from(
    new Set(
      dataset.resources
        .map((r) => r.file_type)
        .filter((t): t is NonNullable<typeof t> => Boolean(t)),
    ),
  );
  if (formats.length > 0) lines.push(`Định dạng: ${formats.join(", ")}`);

  if (dataset.row_count) lines.push(`Số dòng: ${dataset.row_count}`);
  if (dataset.year_range?.length) {
    lines.push(`Phạm vi thời gian: ${dataset.year_range.join(", ")}`);
  }
  if (dataset.feature_count != null) lines.push(`Số features: ${dataset.feature_count}`);
  if (dataset.geometry_type) lines.push(`Geometry: ${dataset.geometry_type}`);
  if (dataset.license) lines.push(`License: ${dataset.license}`);
  if (dataset.source) lines.push(`Nguồn: ${dataset.source}`);

  // FULL data dictionary — không cap. Primary context cho AI matching.
  if (dataset.data_dictionary.length > 0) {
    lines.push("Tất cả các cột/trường dữ liệu (data dictionary đầy đủ):");
    for (const entry of dataset.data_dictionary) {
      const parts = [`  - \`${entry.column_name}\``];
      if (entry.data_type) parts.push(`(${entry.data_type})`);
      if (entry.unit && entry.unit !== "-") parts.push(`[${entry.unit}]`);
      if (entry.description) parts.push(`— ${entry.description}`);
      lines.push(parts.join(" "));
    }
  }

  // Sample rows — CHỈ bổ trợ minh họa, KHÔNG bắt buộc để trả lời
  const rows = sampleRows?.slice(0, FOCUS_SAMPLE_ROWS) ?? [];
  if (rows.length > 0) {
    const headers = dataset.data_dictionary.length > 0
      ? dataset.data_dictionary.map((d) => d.column_name)
      : Object.keys(rows[0]);
    lines.push(`DỮ LIỆU MẪU (${rows.length} dòng đầu — chỉ bổ trợ minh họa):`);
    lines.push(`| ${headers.join(" | ")} |`);
    lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
    for (const row of rows) {
      const cells = headers.map((h) => {
        const v = row[h];
        if (v == null) return "";
        return String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
      });
      lines.push(`| ${cells.join(" | ")} |`);
    }
  } else {
    lines.push("DỮ LIỆU MẪU: (không có sample rows — dựa vào metadata + dictionary ở trên)");
  }

  return lines.join("\n");
}
