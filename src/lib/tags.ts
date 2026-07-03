import { getSupabase } from "@/lib/db/supabase";

let _cache: { tags: string[]; expiry: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút

/**
 * Fetch tags từ PostgreSQL tags table qua Supabase.
 *
 * Cache in-memory 5 phút để tránh query DB mỗi lần MetadataEditor render.
 * Tags thay đổi ít — cache TTL dài OK.
 *
 * Fallback: nếu DB error, return empty array (wizard vẫn hoạt động,
 * user có thể type tag thủ công).
 */
export async function getTags(): Promise<string[]> {
  // Cache hit
  if (_cache && Date.now() < _cache.expiry) {
    return _cache.tags;
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("tags")
      .select("slug, name")
      .order("slug");

    if (error) throw error;

    // Dùng slug (kebab-case identifier) — consistent với tags[] trong Resource/EntitiesCatalog
    const tags = (data ?? []).map((row) => row.slug as string).filter(Boolean);

    _cache = { tags, expiry: Date.now() + CACHE_TTL_MS };
    return tags;
  } catch (err) {
    console.warn("[tags] Fetch thất bại, fallback empty array:", err);
    return [];
  }
}
