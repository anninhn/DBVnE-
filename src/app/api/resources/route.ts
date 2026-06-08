import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/db/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getSupabase();
    const {
      entity_id,
      resource_type,
      title,
      year,
      structured_data,
      file_url,
      file_type,
      file_size_mb,
      source,
      description,
      tags,
      uploaded_by,
    } = body;

    // Validate required fields
    if (!entity_id || !resource_type || !title || !uploaded_by) {
      return NextResponse.json(
        { error: "entity_id, resource_type, title, uploaded_by are required" },
        { status: 400 }
      );
    }

    // Verify entity exists
    const { data: entity } = await supabase
      .from("entities_catalog")
      .select("entity_id")
      .eq("entity_id", entity_id)
      .single();

    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    // Tạo resource
    const { data: resource, error: insertError } = await supabase
      .from("resources")
      .insert({
        entity_id,
        resource_type,
        title,
        year: year || null,
        structured_data: structured_data || null,
        file_url: file_url || null,
        file_type: file_type || null,
        file_size_mb: file_size_mb || null,
        source: source || null,
        description: description || null,
        tags: tags || [],
        uploaded_by,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Tạo version snapshot
    const { error: versionError } = await supabase
      .from("resource_versions")
      .insert({
        resource_id: resource.id,
        version: 1,
        snapshot: {
          resource_type,
          title,
          year,
          structured_data,
          file_url,
          file_type,
          file_size_mb,
          source,
          description,
          tags,
        },
        file_url: file_url || null,
        changed_by: uploaded_by,
        change_note: "Initial upload",
      });

    if (versionError) {
      console.error("Version snapshot failed:", versionError.message);
    }

    return NextResponse.json(resource, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
