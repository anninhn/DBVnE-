import { getSupabase } from "@/lib/db/supabase";

const BUCKET_NAME = "provincial-assets";

/**
 * Upload file lên Supabase Storage.
 * Có thể thay bằng Cloudflare R2 sau — interface giữ nguyên.
 */
export async function uploadFile(
  file: File,
  entityId: string,
  year: number | null
): Promise<{ url: string; sizeMb: number }> {
  const supabase = getSupabase();
  const path = `${entityId}/${year || "unknown"}/${Date.now()}_${file.name}`;

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, file, { contentType: file.type });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(path);

  const sizeMb = Math.round((file.size / 1024 / 1024) * 100) / 100;

  return { url: urlData.publicUrl, sizeMb };
}

/**
 * Lấy file type từ filename
 */
export function getFileType(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}
