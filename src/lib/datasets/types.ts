/**
 * Metadata YAML schema types — file-based source of truth.
 *
 * File: datasets/<slug>/metadata.yaml (commit vào GitHub)
 * Reference: constitution/tech-stack.md (re-architected 2026-07-02).
 *
 * Format-aware: tabular/pdf/mp3/geojson có field riêng.
 * Common fields cho mọi format.
 *
 * Map sang `Dataset` type (src/lib/types/dataset.ts) qua `metadataToDataset()`
 * trong read.ts — giữ compat với <DatasetExplorer> hiện tại.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Common fields (mọi format)
// ──────────────────────────────────────────────────────────────────────────────

export type Category =
  | "kinh-te"
  | "xa-hoi"
  | "chinh-tri"
  | "khi-hau"
  | "ha-tang";

export type License = "internal" | "public" | "restricted";

export type Format = "csv" | "xlsx" | "parquet" | "pdf" | "mp3" | "geojson";

export interface MetadataSource {
  name: string;
  url?: string;
  retrieved?: string; // ISO date
  method?: "download" | "email" | "leak" | "scrape" | "manual_entry";
}

/**
 * Reference tới R2 object — atomic link giữa metadata (git) và data (R2).
 * 3 trường `r2_key + version_id + sha256` đảm bảo snapshot nhất quán:
 * đổi data = tạo R2 version_id mới → update metadata.yaml → git commit mới.
 */
export interface FileRef {
  /** R2 object key — format `<fileId>/<filename>` (UUID-based, stable) */
  r2_key: string;
  /** R2 object version ID (object versioning enabled trên bucket) */
  version_id?: string;
  /** SHA-256 checksum của object — integrity check */
  sha256?: string;
  /** File size tính bằng MB */
  size_mb?: number;
  /** Tên file gốc (vd: "grdp_2024.csv") — hiển thị trong Files tab */
  filename?: string;
}

export interface MetadataYaml {
  // Common
  title: string;
  slug: string;
  description: string;
  category?: Category | string;
  tags?: string[];
  source?: MetadataSource | string;
  license?: License;
  format?: Format | string;
  uploaded_by?: string;
  uploaded_at?: string; // ISO datetime
  confidence?: "high" | "medium" | "low";
  files?: FileRef[];

  // Tabular (CSV/XLSX/Parquet)
  row_count?: number;
  columns_count?: number;
  coverage?: {
    temporal?: (number | string)[];
    geographic?: string;
  };
  methodology_notes?: string;
  next_refresh?: string;

  // PDF
  page_count?: number;
  doc_type?: string;
  published_date?: string;
  language?: string;
  key_findings?: string;

  // MP3
  duration_seconds?: number;
  participants?: string[];
  recorded_date?: string;

  // GeoJSON
  feature_count?: number;
  geometry_type?: string;
  bbox?: number[];
  crs?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Dictionary.md parsing
// ──────────────────────────────────────────────────────────────────────────────

export interface DictionaryEntry {
  column: string;
  type?: string;
  unit?: string;
  description?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// GitHub raw fetch config
// ──────────────────────────────────────────────────────────────────────────────

export interface GithubConfig {
  owner: string;
  repo: string;
  branch: string;
  token?: string; // private repo cần PAT
}

export function getGithubConfig(): GithubConfig {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  if (!owner || !repo) {
    throw new Error(
      "GITHUB_REPO_OWNER và GITHUB_REPO_NAME cần set trong .env.local"
    );
  }
  return {
    owner,
    repo,
    branch: process.env.GITHUB_REPO_BRANCH || "main",
    token: process.env.GITHUB_TOKEN,
  };
}

/**
 * Raw URL cho file metadata.yaml/dictionary.md trong GitHub repo.
 * CDN cache, anonymous OK nếu repo public, có token cho private.
 */
export function rawUrl(config: GithubConfig, path: string): string {
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${path}`;
}
