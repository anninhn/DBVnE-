import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/db/supabase";

export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("entities_catalog")
    .select("entity_id, entity_name, entity_type, region, tags")
    .eq("entity_type", "PROVINCE")
    .order("entity_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
