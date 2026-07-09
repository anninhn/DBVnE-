import { NextResponse } from "next/server";
import { listDatasets } from "@/lib/datasets/list";

/**
 * GET /api/datasets — listing metadata (lightweight, không resources/dictionary).
 * Frontend listing dùng trực tiếp listDatasets() qua server component,
 * route này tồn tại theo constitution API surface + cho client/external tools.
 */
export async function GET() {
  try {
    const datasets = await listDatasets();
    return NextResponse.json(datasets);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
