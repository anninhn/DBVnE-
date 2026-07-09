import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

import { getObjectMetadata } from "@/lib/r2/get";
import { getMetadataYaml } from "@/lib/datasets/read";
import {
  commitMetadata,
  renderMetadataYaml,
  renderDictionaryMarkdown,
  type MetadataForRender,
  type DictionaryForRender,
} from "@/lib/dataset-commit";

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
  };
  dictionary: DictionaryForRender[];
}

/**
 * Convert slug từ title (Vietnamese-safe).
 * "GRDP 34 Tỉnh 2024" → "grdp-34-tinh-2024"
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
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

  const { fileId, r2Key, metadata, dictionary } = body;

  if (!metadata?.title || !metadata?.description) {
    return NextResponse.json(
      { error: "Metadata thiếu title hoặc description" },
      { status: 400 }
    );
  }

  // 1. Generate unique slug (check conflict trong repo)
  const baseSlug = slugify(metadata.title);
  if (!baseSlug) {
    return NextResponse.json(
      { error: "Không generate được slug từ title" },
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
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        error: `Không commit được metadata lên GitHub: ${message}`,
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
    message: `Dataset đã publish tại /datasets/${slug}.`,
  });
}
