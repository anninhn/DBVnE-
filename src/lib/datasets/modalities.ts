/**
 * Modality classifier — phân loại dataset theo dạng dữ liệu cơ bản.
 *
 * Best practice: dựa vào `file_type` (primary signal), KHÔNG dựa vào derived
 * metadata như `feature_count`/`row_count` (có thể bị thiếu nếu processing fail).
 *
 * Tham chiếu: Hugging Face, Kaggle, Google Dataset Search.
 */

import type { FileType } from "@/lib/types/dataset";

export type Modality =
  | "Tabular"
  | "Geospatial"
  | "Text"
  | "Audio"
  | "Image"
  | "Video";

const FILE_TYPE_TO_MODALITY: Record<FileType, Modality> = {
  csv: "Tabular",
  xlsx: "Tabular",
  json: "Tabular", // mặc định JSON là tabular; GeoJSON có file_type riêng
  geojson: "Geospatial",
  pdf: "Text",
  mp3: "Audio",
};

export interface ResourceLike {
  file_type?: FileType | string;
}

/**
 * Trả về danh sách modality duy nhất từ danh sách resource.
 * Thứ tự giữ theo FILE_TYPE_TO_MODALITY (tabular trước → geospatial → text → audio).
 *
 * Example:
 *   classifyModalities([{file_type: "geojson"}]) → ["Geospatial"]
 *   classifyModalities([{file_type: "csv"}, {file_type: "pdf"}]) → ["Tabular", "Text"]
 */
export function classifyModalities(resources: ResourceLike[]): Modality[] {
  const mods: Modality[] = [];
  const seen = new Set<Modality>();

  for (const r of resources) {
    const ft = r.file_type?.toString().toLowerCase() as FileType;
    const modality = FILE_TYPE_TO_MODALITY[ft];
    if (modality && !seen.has(modality)) {
      mods.push(modality);
      seen.add(modality);
    }
  }

  return mods;
}
