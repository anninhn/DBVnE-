import { NextResponse } from "next/server";
import { getTags } from "@/lib/tags";

/**
 * GET /api/tags — return list of tag slugs từ PostgreSQL.
 * Cache 5 phút ở lib layer.
 */
export async function GET() {
  try {
    const tags = await getTags();
    return NextResponse.json({ tags });
  } catch (err) {
    console.error("[tags] GET error:", err);
    return NextResponse.json({ tags: [] }, { status: 200 });
  }
}
