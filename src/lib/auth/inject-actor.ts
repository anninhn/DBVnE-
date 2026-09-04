/**
 * Inject actor fields vào metadata.yaml text.
 *
 * Used by:
 * - upload/commit route: set `uploaded_by/at` từ session user
 * - dataset/edit route: set `last_edited_by/at` + append `edits[]` entry
 * - dataset/delete route: set `status: deleted` + `deleted_by/at`
 *
 * Parse YAML → mutate → stringify (không dùng renderMetadataYaml vì route nhận text sẵn).
 *
 * Spec D2.
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { EditEntry, MetadataYaml } from "@/lib/datasets/types";

/**
 * Inject uploaded_by/at vào metadata.yaml text (cho upload commit route).
 * Overwrite nếu đã có (vd: re-upload).
 */
export function injectUploaded(
  yamlText: string,
  username: string,
  isoNow: string = new Date().toISOString()
): string {
  const meta = parseYaml(yamlText) as MetadataYaml;
  meta.uploaded_by = username;
  meta.uploaded_at = isoNow;
  return stringifyYaml(meta);
}

/**
 * Inject last_edited_by/at + append edits[] entry (cho edit route).
 */
export function injectEdited(
  yamlText: string,
  username: string,
  summary: string = "Edit metadata",
  isoNow: string = new Date().toISOString()
): string {
  const meta = parseYaml(yamlText) as MetadataYaml;
  meta.last_edited_by = username;
  meta.last_edited_at = isoNow;
  if (!Array.isArray(meta.edits)) meta.edits = [];
  const entry: EditEntry = { by: username, at: isoNow, summary };
  meta.edits.push(entry);
  return stringifyYaml(meta);
}

/**
 * Merge auth fields từ existing metadata.yaml vào client-submitted YAML.
 *
 * EditDatasetForm.tsx gọi `renderMetadataYaml()` xây YAML mới từ scratch —
 * không giữ `edits[]`, `last_edited_by/at`, `status`, `deleted_by/at`.
 * Nếu gọi `injectEdited()` thẳng trên YAML đó, edits[] sẽ bị reset về 1 entry
 * mỗi lần edit (history mất).
 *
 * Helper này copy các auth field từ existing YAML (fetch từ GitHub) sang
 * client YAML trước khi inject — giữ history nguyên vẹn.
 */
export function mergeAuthFields(
  clientYaml: string,
  existingYaml: string | null,
): string {
  if (!existingYaml) return clientYaml;

  const client = parseYaml(clientYaml) as MetadataYaml;
  const existing = parseYaml(existingYaml) as MetadataYaml;

  // `coverage` do bước phân tích/backfill suy ra từ dữ liệu, form sửa metadata
  // không biết tới nó và không gửi lên. Không giữ lại thì lần sửa tiêu đề đầu
  // tiên sẽ xoá mất khoảng thời gian của dataset, và bộ lọc theo năm âm thầm bỏ
  // sót nó — không có triệu chứng nào ngoài việc dataset "biến mất" khỏi bộ lọc.
  client.coverage = existing.coverage;

  client.edits = existing.edits;
  client.last_edited_by = existing.last_edited_by;
  client.last_edited_at = existing.last_edited_at;
  client.status = existing.status;
  client.deleted_by = existing.deleted_by;
  client.deleted_at = existing.deleted_at;

  return stringifyYaml(client);
}

/**
 * Mark dataset as soft-deleted (cho delete route).
 * Không xóa folder/file — chỉ set status + actor.
 */
export function injectDeleted(
  yamlText: string,
  username: string,
  isoNow: string = new Date().toISOString()
): string {
  const meta = parseYaml(yamlText) as MetadataYaml;
  meta.status = "deleted";
  meta.deleted_by = username;
  meta.deleted_at = isoNow;
  return stringifyYaml(meta);
}
