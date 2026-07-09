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

import { commitMetadataFiles, type CommitResult } from "@/lib/git/commit";

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

  return commitMetadataFiles(
    input.slug,
    input.metadataYaml,
    input.dictionaryMarkdown,
    commitMessage
  );
}
