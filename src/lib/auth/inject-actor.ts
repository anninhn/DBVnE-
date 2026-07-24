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
