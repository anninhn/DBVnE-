import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/db/supabase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabase();

  // Lấy entity info
  const { data: entity, error: entityError } = await supabase
    .from("entities_catalog")
    .select("*")
    .eq("entity_id", id)
    .single();

  if (entityError || !entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  // Lấy danh sách resources
  const { data: resources, error: resourcesError } = await supabase
    .from("resources")
    .select("id, resource_type, title, year, structured_data, file_url, file_type, file_size_mb, source, description, tags, uploaded_by, uploaded_at")
    .eq("entity_id", id)
    .order("year", { ascending: false });

  if (resourcesError) {
    return NextResponse.json({ error: resourcesError.message }, { status: 500 });
  }

  return NextResponse.json({ entity, resources });
}
