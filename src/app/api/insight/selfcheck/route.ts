import { NextResponse } from "next/server";

import { insightEnabled } from "@/lib/insight/local";
import { runCases } from "@/lib/insight/cases";

/**
 * Chạy các ca kiểm tra bước đề xuất chỉ tiêu (src/lib/insight/cases.ts). Chỉ local.
 *   curl localhost:3000/api/insight/selfcheck
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  if (!insightEnabled()) return new NextResponse(null, { status: 404 });
  const results = await runCases();
  return NextResponse.json({ ok: results.every((r) => r.ok), results });
}
