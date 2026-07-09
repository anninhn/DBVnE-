import { NextResponse } from "next/server";
import { getTags } from "@/lib/tags";

/**
 * GET /api/tags — return controlled vocabulary tag slugs.
 * Hardcoded trong src/lib/tags.ts (post-Supabase migration).
 */
export async function GET() {
  return NextResponse.json({ tags: getTags() });
}
