/**
 * Đọc 1 dataset từ GitHub raw — runtime fetch.
 *
 * Page `/datasets/[slug]` gọi `getDatasetBySlug(slug)` mỗi request.
 * Cache in-memory 60s để giảm GitHub API calls + tăng tốc response.
 *
 * Atomic link: metadata.yaml field `files[].r2_key + version_id + sha256`
 * tham chiếu R2 object. Chi tiết: constitution/tech-stack.md.
 */

import { cache } from "react";
import { parse as parseYaml } from "yaml";
import type {
  Dataset,
  Resource,
  DataDictionaryEntry,
} from "@/lib/types/dataset";
import {
  type DictionaryEntry,
  type GithubConfig,
  type MetadataYaml,
  getGithubConfig,
  rawUrl,
} from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// Fetch helpers
// ──────────────────────────────────────────────────────────────────────────────

async function fetchRaw(path: string): Promise<string | null> {
  const config = getGithubConfig();
  const url = rawUrl(config, path);
  const headers: Record<string, string> = {
    // GitHub raw endpoint cần token nếu repo private.
    // Public repo: anonymous OK nhưng rate-limited 60 req/h.
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    // Force edge revalidation (GitHub raw CDN cache 5 phút mặc định)
    "User-Agent": "vnexpress-data-platform",
  };

  const res = await fetch(url, { headers, next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub raw fetch failed: ${path} (${res.status})`);
  }
  return res.text();
}

// ──────────────────────────────────────────────────────────────────────────────
// Dictionary.md parser
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Parse markdown table:
 *   | Column | Type | Unit | Description |
 *   |--------|------|------|-------------|
 *   | tinh   | string | - | Tên tỉnh |
 *
 * → DataDictionaryEntry[] (compat với Dataset.data_dictionary type hiện tại).
 */
export function parseDictionaryMarkdown(md: string): DataDictionaryEntry[] {
  const lines = md.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return [];

  // Skip header + separator row
  const dataRows = lines.slice(2);
  return dataRows
    .map((line) => {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length < 1) return null;
      const [column, type, unit, description] = cells;
      return {
        column_name: column?.replace(/`/g, "") ?? "",
        label_vi: column?.replace(/`/g, "") ?? "",
        data_type: mapDictionaryType(type),
        unit: unit && unit !== "-" ? unit : undefined,
        description: description && description !== "-" ? description : undefined,
      } as DataDictionaryEntry;
    })
    .filter((row): row is DataDictionaryEntry => row !== null);
}

function mapDictionaryType(
  raw?: string,
): DataDictionaryEntry["data_type"] {
  if (!raw) return "text";
  const t = raw.toLowerCase();
  if (t.includes("int") || t.includes("number")) return "int";
  if (t.includes("float") || t.includes("decimal")) return "float";
  if (t.includes("date")) return "date";
  return "text";
}

// ──────────────────────────────────────────────────────────────────────────────
// Mapper: MetadataYaml → Dataset (compat types/dataset.ts)
// ──────────────────────────────────────────────────────────────────────────────

function flattenSource(source: MetadataYaml["source"]): string {
  if (!source) return "";
  if (typeof source === "string") return source;
  return source.name;
}

function mapFilesToResources(
  files: MetadataYaml["files"],
  format: string | undefined,
): { resources: Resource[]; totalSizeMb: number } {
  if (!files || files.length === 0) return { resources: [], totalSizeMb: 0 };

  const resources: Resource[] = files.map((f, i) => ({
    id: i + 1,
    resource_type: inferResourceType(f.filename ?? f.r2_key, format),
    title: f.filename ?? f.r2_key.split("/").pop() ?? "untitled",
    file_url: undefined, // Sẽ wire sau qua R2 public base hoặc /api/files proxy
    file_type: inferFileType(f.filename ?? f.r2_key, format),
    file_size_mb: f.size_mb ?? 0,
    uploaded_by: "demo",
    uploaded_at: new Date().toISOString(),
  }));

  const totalSizeMb = files.reduce((sum, f) => sum + (f.size_mb ?? 0), 0);
  return { resources, totalSizeMb };
}

function inferResourceType(
  filename: string,
  format?: string,
): Resource["resource_type"] {
  const f = format ?? filename.split(".").pop() ?? "";
  if (f === "pdf") return "document";
  if (f === "mp3") return "audio";
  if (f === "geojson" || f === "json") return "geo_layer";
  return "data";
}

function inferFileType(
  filename: string,
  format?: string,
): Resource["file_type"] {
  if (format === "csv" || format === "xlsx" || format === "pdf" || format === "mp3" || format === "geojson") {
    return format;
  }
  const ext = filename.split(".").pop();
  if (ext === "csv" || ext === "xlsx" || ext === "pdf" || ext === "mp3" || ext === "geojson" || ext === "json") {
    return ext;
  }
  return "csv";
}

export function metadataToDataset(
  meta: MetadataYaml,
  dictionary: DataDictionaryEntry[],
): Dataset {
  const format = typeof meta.format === "string" ? meta.format : undefined;
  const { resources, totalSizeMb } = mapFilesToResources(meta.files, format);
  const temporal = meta.coverage?.temporal ?? [];
  const year_range = temporal
    .map((t) => (typeof t === "number" ? t : parseInt(String(t), 10)))
    .filter((n) => !isNaN(n));

  return {
    slug: meta.slug,
    title: meta.title,
    description: meta.description,
    category: (meta.category as Dataset["category"]) ?? "xa-hoi",
    tags: meta.tags ?? [],
    license: (meta.license as Dataset["license"]) ?? "internal",
    year_range,
    row_count: meta.row_count ?? 0,
    file_count: meta.files?.length ?? 0,
    total_size_mb: totalSizeMb,
    downloads: 0,
    likes: 0,
    source: flattenSource(meta.source),
    uploaded_by: meta.uploaded_by ?? "unknown",
    uploaded_at: meta.uploaded_at ?? new Date().toISOString(),
    resources,
    data_dictionary: dictionary,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/** Read 1 dataset by slug từ GitHub raw metadata.yaml + dictionary.md. */
export const getDatasetBySlug = cache(async (slug: string): Promise<Dataset | null> => {
  const yamlText = await fetchRaw(`datasets/${slug}/metadata.yaml`);
  if (!yamlText) return null;

  const meta = parseYaml(yamlText) as MetadataYaml;
  if (!meta || typeof meta !== "object" || !meta.title) {
    console.warn(`[datasets] metadata.yaml không hợp lệ cho slug: ${slug}`);
    return null;
  }

  const dictText = await fetchRaw(`datasets/${slug}/dictionary.md`);
  const dictionary = dictText ? parseDictionaryMarkdown(dictText) : [];

  return metadataToDataset(meta, dictionary);
});

/** Get raw MetadataYaml (không map) — cho commit route check slug exists. */
export async function getMetadataYaml(
  slug: string,
): Promise<MetadataYaml | null> {
  const yamlText = await fetchRaw(`datasets/${slug}/metadata.yaml`);
  if (!yamlText) return null;
  return parseYaml(yamlText) as MetadataYaml;
}

export type { DictionaryEntry, GithubConfig, MetadataYaml };
