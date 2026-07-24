/**
 * Shared commit logic cho upload + edit API routes (server-side).
 *
 * Cả upload (create) và edit (update) đều commit metadata.yaml + dictionary.md
 * qua cùng path `datasets/<slug>/`. Khác nhau ở commit message:
 * - mode "create": `Upload dataset <slug>`
 * - mode "update": `Update dataset <slug>`
 *
 * D3: Edit = metadata/dictionary only, không replace file (r2_key giữ nguyên).
 *
 * NOTE: Render helpers (renderMetadataYaml, renderDictionaryMarkdown) đã tách
 * sang `src/lib/dataset-render.ts` (pure functions, safe cho client components).
 */

import { commitFiles, type CommitResult } from "@/lib/git/commit";
import { buildIndexFileFromYaml } from "@/lib/datasets/index-json";

// Re-export render helpers cho server-side callers (API routes)
export {
  renderMetadataYaml,
  renderDictionaryMarkdown,
  type MetadataForRender,
  type DictionaryForRender,
  type FileRefForRender,
} from "@/lib/dataset-render";

/** Metadata fields dùng chung cho cả upload + edit */
export interface CommitMetadataInput {
  /** Dataset slug (giữ nguyên khi edit, generated khi upload) */
  slug: string;
  /** YAML content đã render sẵn (metadata.yaml full text) */
  metadataYaml: string;
  /** Markdown content đã render sẵn (dictionary.md full text) */
  dictionaryMarkdown: string;
  /** "create" (upload mới) hoặc "update" (edit metadata) */
  mode: "create" | "update";
}

/**
 * Commit metadata.yaml + dictionary.md lên GitHub.
 *
 * Wrapper quanh `commitMetadataFiles` — tự động chọn commit message theo mode:
 * - create: "Upload dataset <slug>"
 * - update: "Update dataset <slug>"
 *
 * @throws Error nếu GitHub API fail (caller handle)
 */
export async function commitMetadata(
  input: CommitMetadataInput
): Promise<CommitResult> {
  const commitMessage =
    input.mode === "create"
      ? `Upload dataset ${input.slug}`
      : `Update dataset ${input.slug}`;

  // Atomic commit: metadata.yaml + dictionary.md + index.json cùng 1 SHA.
  // Index.json update best-effort — nếu fetch/parse fail, vẫn commit metadata
  // (index có thể rebuild sau qua `tools/rebuild-index.mjs`).
  const files: Parameters<typeof commitFiles>[0] = [
    {
      path: `datasets/${input.slug}/metadata.yaml`,
      content: input.metadataYaml,
    },
    {
      path: `datasets/${input.slug}/dictionary.md`,
      content: input.dictionaryMarkdown,
    },
  ];

  try {
    const indexFile = await buildIndexFileFromYaml(input.metadataYaml);
    if (indexFile) files.push(indexFile);
  } catch (err) {
    console.warn(
      `[commitMetadata] index.json update fail — proceed commit metadata only:`,
      err,
    );
  }

  return commitFiles(files, commitMessage);
}
