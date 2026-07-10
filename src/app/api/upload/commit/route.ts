import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

import { getObjectMetadata } from "@/lib/r2/get";
import { getMetadataYaml } from "@/lib/datasets/read";
import { slugify, isValidSlug } from "@/lib/slugify";
import {
  commitMetadata,
  renderMetadataYaml,
  renderDictionaryMarkdown,
  type MetadataForRender,
  type DictionaryForRender,
} from "@/lib/dataset-commit";
import type { ColumnStats } from "@/lib/types/dataset";

interface CommitRequest {
  fileId: string;
  r2Key: string;
  metadata: {
    title: string;
    description: string;
    category: string;
    tags: string[];
    source: string;
    source_url: string;
    confidence: "high" | "medium" | "low";
    format: "csv" | "xlsx";
    filename: string;
    row_count?: number;
    columns_count?: number;
  };
  dictionary: DictionaryForRender[];
  /** Full-dataset stats per column — computed tại analyze time, persisted vào metadata */
  column_stats?: Record<string, ColumnStats>;
  /** Optional custom slug từ user — nếu thiếu, fallback sang slugify(title) */
  custom_slug?: string;
}

/**
 * Suffix slug với -2, -3, ... nếu đã tồn tại trong repo.
 */
async function resolveUniqueSlug(baseSlug: string): Promise<string> {
  let candidate = baseSlug;
  let suffix = 2;
  // Giới hạn retry để tránh infinite loop
  while (suffix < 100) {
    const existing = await getMetadataYaml(candidate);
    if (!existing) return candidate;
    candidate = `${baseSlug}-${suffix}`;
    suffix++;
  }
  return `${baseSlug}-${Date.now()}`;
}

export async function POST(req: NextRequest) {
  let body: CommitRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body phải là JSON hợp lệ" },
      { status: 400 }
    );
  }

  const { fileId, r2Key, metadata, dictionary, custom_slug, column_stats } = body;

  if (!metadata?.title || !metadata?.description) {
    return NextResponse.json(
      { error: "Thiếu tiêu đề hoặc mô tả dataset" },
      { status: 400 }
    );
  }

  // 1. Generate unique slug — ưu tiên custom_slug (đã sanitize), fallback slugify(title)
  let baseSlug: string;
  if (custom_slug && custom_slug.trim()) {
    // Sanitize custom slug qua slugify để strip ký tự lạ (defensive — client cũng validate rồi)
    baseSlug = slugify(custom_slug);
    if (!isValidSlug(baseSlug)) {
      return NextResponse.json(
        {
          error: `Custom slug "${custom_slug}" không hợp lệ sau khi sanitize. Chỉ cho phép [a-z0-9-], 1-60 ký tự.`,
        },
        { status: 400 }
      );
    }
  } else {
    baseSlug = slugify(metadata.title);
  }

  if (!baseSlug) {
    return NextResponse.json(
      { error: "Không tạo được slug từ tiêu đề" },
      { status: 400 }
    );
  }
  const slug = await resolveUniqueSlug(baseSlug);

  // 2. Fetch R2 object metadata (version_id, sha256, size_mb)
  let r2Meta: {
    version_id?: string;
    sha256?: string;
    size_mb?: number;
  } = {};
  try {
    const full = await getObjectMetadata(r2Key);
    r2Meta = {
      version_id: full.version_id,
      sha256: full.sha256,
      size_mb: full.size_mb,
    };
  } catch (err) {
    console.warn("[commit] R2 metadata fetch thất bại:", err);
    // Continue — fields optional trong metadata.yaml
  }

  // 3. Render YAML + markdown content (shared helpers)
  const yamlContent = renderMetadataYaml(
    metadata as MetadataForRender,
    slug,
    undefined, // upload mode — không có files[] sẵn
    {
      format: metadata.format,
      filename: metadata.filename,
      r2Key,
      r2Meta,
      row_count: metadata.row_count,
      columns_count: metadata.columns_count,
      column_stats: column_stats,
    }
  );
  const markdownContent = renderDictionaryMarkdown(dictionary ?? []);

  // 4. Git commit + push qua shared commitMetadata (mode: create)
  let commitResult;
  try {
    commitResult = await commitMetadata({
      slug,
      metadataYaml: yamlContent,
      dictionaryMarkdown: markdownContent,
      mode: "create",
    });
  } catch (err) {
    console.error("[commit] Git push thất bại:", err);
    return NextResponse.json(
      {
        error: "Không thể lưu dataset. Vui lòng thử lại.",
        slug,
        yamlPreview: yamlContent,
        markdownPreview: markdownContent,
        committed: false,
      },
      { status: 500 }
    );
  }

  console.info("[commit] Dataset đã publish:", {
    slug,
    commitSha: commitResult.commitSha,
    r2Key,
    r2VersionId: r2Meta.version_id,
  });

  return NextResponse.json({
    slug,
    yamlPreview: yamlContent,
    markdownPreview: markdownContent,
    committed: true,
    commitSha: commitResult.commitSha,
    commitUrl: commitResult.commitUrl,
    url: `/datasets/${slug}`,
    message: `Dataset đã được lưu.`,
  });
}
