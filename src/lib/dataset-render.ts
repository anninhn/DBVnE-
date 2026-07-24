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
  /** Frictionless schema — ký tự thập phân (`.` mặc định, `,` cho VN) */
  decimal_char?: "." | ",";
  /** Frictionless schema — ký tự nhóm hàng nghìn (`,`, `.`, hoặc space) */
  group_char?: "." | "," | " ";
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
 * Article ref cho render YAML articles[] section (spec 2026-07-24).
 * Mirror ArticleEntry ở src/lib/articles/types.ts — pure type cho render layer.
 */
export interface ArticleForRender {
  url: string;
  title: string;
  author?: string;
  published_at?: string;
  section?: string;
  thumbnail?: string;
  added_at: string;
  added_by: string;
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
    /** GeoJSON-only */
    feature_count?: number;
    geometry_type?: string;
    bbox?: [number, number, number, number];
    crs?: string;
    /** Articles (spec 2026-07-24) — pass-through từ existing YAML khi edit */
    articles?: ArticleForRender[];
  }
): string {
  const today = new Date().toISOString().slice(0, 10);
  const tagsYaml =
    meta.tags.length > 0
      ? `\n${meta.tags.map((t) => `  - ${t}`).join("\n")}`
      : " []";

  // row_count + columns_count — provenance từ analyze (inspection). Chỉ render khi có.
  // Cho GeoJSON: row_count = feature_count (consistent), columns_count = số properties.
  const rowLine =
    options?.row_count != null ? `\nrow_count: ${options.row_count}` : "";
  const colLine =
    options?.columns_count != null
      ? `\ncolumns_count: ${options.columns_count}`
      : "";

  // GeoJSON-only fields — render sau columns_count khi format=geojson
  const isGeoJson = options?.format === "geojson";
  const featureLine =
    isGeoJson && options?.feature_count != null
      ? `\nfeature_count: ${options.feature_count}`
      : "";
  const geomLine =
    isGeoJson && options?.geometry_type
      ? `\ngeometry_type: "${options.geometry_type}"`
      : "";
  const bboxLine =
    isGeoJson && options?.bbox
      ? `\nbbox: [${options.bbox.join(", ")}]`
      : "";
  const crsLine =
    isGeoJson && options?.crs ? `\ncrs: "${options.crs}"` : "";

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

  // Articles (spec 2026-07-24) — render trước files để YAML dễ đọc.
  // Empty/null → omit section hoàn toàn (không render `articles: []`).
  const articlesSection =
    options?.articles && options.articles.length > 0
      ? renderArticlesYaml(options.articles)
      : "";

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
format: ${format}${rowLine}${colLine}${featureLine}${geomLine}${bboxLine}${crsLine}
confidence: ${meta.confidence}
uploaded_by: ${uploadedBy}
uploaded_at: "${uploadedAt}"${articlesSection}
files:
${filesSection}
`;
}

/**
 * Render articles[] → YAML block (spec 2026-07-24).
 *
 * Format:
 *   articles:
 *     - url: "..."
 *       title: "..."
 *       author: "..."
 *       published_at: "..."
 *       section: "..."
 *       thumbnail: "..."
 *       added_at: "..."
 *       added_by: "..."
 *
 * Optional fields chỉ render khi có giá trị (không emit empty quotes).
 */
function renderArticlesYaml(articles: ArticleForRender[]): string {
  const lines: string[] = ["", "articles:"];
  for (const a of articles) {
    lines.push(`  - url: "${escYaml(a.url)}"`);
    lines.push(`    title: "${escYaml(a.title)}"`);
    if (a.author) lines.push(`    author: "${escYaml(a.author)}"`);
    if (a.published_at) lines.push(`    published_at: "${escYaml(a.published_at)}"`);
    if (a.section) lines.push(`    section: "${escYaml(a.section)}"`);
    if (a.thumbnail) lines.push(`    thumbnail: "${escYaml(a.thumbnail)}"`);
    lines.push(`    added_at: "${escYaml(a.added_at)}"`);
    lines.push(`    added_by: "${escYaml(a.added_by)}"`);
  }
  return lines.join("\n");
}

/**
 * Render dictionary.md content (markdown table).
 *
 * Bao gồm 2 cột Frictionless schema: `Dec` (decimal_char) + `Group` (group_char).
 * Default `-` khi không có — backward compat với dictionary cũ.
 */
export function renderDictionaryMarkdown(
  entries: DictionaryForRender[]
): string {
  if (entries.length === 0) {
    return `# Dictionary\n\nDataset không có column (non-tabular hoặc chưa inspect).\n`;
  }

  const header =
    "| Column | Type | Dec | Group | Unit | Description |\n|--------|------|-----|-------|------|-------------|";
  const rows = entries
    .map(
      (e) =>
        `| \`${e.column}\` | ${e.type} | ${e.decimal_char ?? "-"} | ${e.group_char ?? "-"} | ${e.unit || "-"} | ${e.description || ""} |`
    )
    .join("\n");

  return `# Dictionary\n\n${header}\n${rows}\n`;
}
