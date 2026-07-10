/**
 * Pure render helpers cho metadata.yaml + dictionary.md.
 *
 * Không có server-only imports → safe cho client components.
 * Cả upload route (server) + edit form (client) đều dùng các hàm này.
 */

/** Metadata fields cho render YAML — dùng chung upload + edit */
export interface MetadataForRender {
  title: string;
  description: string;
  category: string;
  tags: string[];
  source: string;
  source_url: string;
  confidence: "high" | "medium" | "low";
}

/** ColumnStats — matches type từ dataset.ts, giữ render file pure (không import type) */
type ColumnStatsForRender =
  | { kind: "numeric"; min: number; max: number; histogram: number[] }
  | { kind: "categorical"; distinct: number; segments: { label: string; count: number }[] };

/** Dictionary entry cho render markdown — dùng chung upload + edit */
export interface DictionaryForRender {
  column: string;
  type: string;
  unit: string;
  description: string;
}

/** File ref cho render YAML files[] section */
export interface FileRefForRender {
  filename?: string;
  path?: string;
  r2_key: string;
  version_id?: string;
  sha256?: string;
  size_mb?: number;
  column_stats?: Record<string, ColumnStatsForRender>;
}

/**
 * Escape YAML double-quoted string.
 */
function escYaml(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Render column_stats object → YAML block (cho metadata.yaml files[].column_stats).
 *
 * Numeric: kind + min + max + histogram[8]
 * Categorical: kind + distinct + segments[top-12]
 *
 * @param indent số space indent cho column key level (thường là 6 — nằm trong files[].column_stats:)
 */
function renderColumnStatsYaml(
  stats: Record<string, ColumnStatsForRender>,
  indent: number
): string {
  const pad = " ".repeat(indent);
  const lines: string[] = [];

  for (const [colName, stat] of Object.entries(stats)) {
    lines.push(`${pad}"${escYaml(colName)}":`);
    if (stat.kind === "numeric") {
      lines.push(`${pad}  kind: numeric`);
      lines.push(`${pad}  min: ${stat.min}`);
      lines.push(`${pad}  max: ${stat.max}`);
      lines.push(`${pad}  histogram: [${stat.histogram.join(", ")}]`);
    } else {
      lines.push(`${pad}  kind: categorical`);
      lines.push(`${pad}  distinct: ${stat.distinct}`);
      if (stat.segments.length > 0) {
        lines.push(`${pad}  segments:`);
        for (const seg of stat.segments) {
          lines.push(`${pad}    - label: "${escYaml(seg.label)}"`);
          lines.push(`${pad}      count: ${seg.count}`);
        }
      } else {
        lines.push(`${pad}  segments: []`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Render metadata.yaml content từ metadata fields + file info.
 *
 * Khi edit (mode update): truyền `files` để giữ nguyên r2_key, version_id, sha256.
 * Khi upload (mode create): truyền `options.r2Key` + `options.r2Meta` cho file mới.
 */
export function renderMetadataYaml(
  meta: MetadataForRender,
  slug: string,
  files?: FileRefForRender[],
  options?: {
    format?: string;
    filename?: string;
    uploaded_by?: string;
    uploaded_at?: string;
    r2Key?: string;
    r2Meta?: { version_id?: string; sha256?: string; size_mb?: number };
    row_count?: number;
    columns_count?: number;
    column_stats?: Record<string, ColumnStatsForRender>;
  }
): string {
  const today = new Date().toISOString().slice(0, 10);
  const tagsYaml =
    meta.tags.length > 0
      ? `\n${meta.tags.map((t) => `  - ${t}`).join("\n")}`
      : " []";

  // row_count + columns_count — provenance từ analyze (inspection). Chỉ render khi có.
  const rowLine =
    options?.row_count != null ? `\nrow_count: ${options.row_count}` : "";
  const colLine =
    options?.columns_count != null
      ? `\ncolumns_count: ${options.columns_count}`
      : "";

  // Nếu có files[] sẵn (edit mode) → giữ nguyên
  let filesSection: string;
  if (files && files.length > 0) {
    filesSection = files
      .map((f) => {
        let line = `  - filename: "${f.filename ?? ""}"`;
        line += `\n    path: "${f.path ?? `${slug}/${f.filename ?? ""}`}"`;
        line += `\n    r2_key: "${f.r2_key}"`;
        if (f.version_id) line += `\n    version_id: "${f.version_id}"`;
        if (f.sha256) line += `\n    sha256: "${f.sha256}"`;
        if (f.size_mb !== undefined) line += `\n    size_mb: ${f.size_mb}`;
        if (f.column_stats && Object.keys(f.column_stats).length > 0) {
          line += `\n    column_stats:\n${renderColumnStatsYaml(f.column_stats, 6)}`;
        }
        return line;
      })
      .join("\n");
  } else {
    // Upload mode — tạo file entry mới
    const r2Key = options?.r2Key ?? "";
    const r2Meta = options?.r2Meta ?? {};
    const versionLine = r2Meta.version_id
      ? `\n    version_id: "${r2Meta.version_id}"`
      : "";
    const shaLine = r2Meta.sha256 ? `\n    sha256: "${r2Meta.sha256}"` : "";
    const sizeLine =
      r2Meta.size_mb !== undefined ? `\n    size_mb: ${r2Meta.size_mb}` : "";
    const statsBlock =
      options?.column_stats && Object.keys(options.column_stats).length > 0
        ? `\n    column_stats:\n${renderColumnStatsYaml(options.column_stats, 6)}`
        : "";
    filesSection = `  - filename: "${options?.filename ?? ""}"
    path: "${slug}/${options?.filename ?? ""}"
    r2_key: "${r2Key}"${versionLine}${shaLine}${sizeLine}${statsBlock}`;
  }

  const uploadedBy = options?.uploaded_by ?? "demo";
  const uploadedAt = options?.uploaded_at ?? new Date().toISOString();
  const format = options?.format ?? "csv";

  return `# metadata.yaml — generated by Upload Wizard
title: "${meta.title}"
slug: "${slug}"
description: "${meta.description}"
category: ${meta.category}
tags:${tagsYaml}
source:
  name: "${meta.source}"
  url: "${meta.source_url || ""}"
  retrieved: "${today}"
  method: manual_entry
license: internal
format: ${format}${rowLine}${colLine}
confidence: ${meta.confidence}
uploaded_by: ${uploadedBy}
uploaded_at: "${uploadedAt}"
files:
${filesSection}
`;
}

/**
 * Render dictionary.md content (markdown table).
 */
export function renderDictionaryMarkdown(
  entries: DictionaryForRender[]
): string {
  if (entries.length === 0) {
    return `# Dictionary\n\nDataset không có column (non-tabular hoặc chưa inspect).\n`;
  }

  const header =
    "| Column | Type | Unit | Description |\n|--------|------|------|-------------|";
  const rows = entries
    .map(
      (e) =>
        `| \`${e.column}\` | ${e.type} | ${e.unit || "-"} | ${e.description || ""} |`
    )
    .join("\n");

  return `# Dictionary\n\n${header}\n${rows}\n`;
}
