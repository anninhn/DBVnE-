import { NextResponse } from "next/server";

import { insightEnabled } from "@/lib/insight/local";
import { buildCatalog, loadCatalog } from "@/lib/insight/v2/catalog";

/**
 * Danh mục chỉ tiêu (pilot, chỉ local).
 *   GET  → thống kê danh mục hiện có
 *   POST → dựng lại toàn bộ
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300; // trần của gói Vercel Hobby; route chỉ chạy local nên không bị giới hạn thật

function stats(c: Awaited<ReturnType<typeof loadCatalog>>) {
  if (!c) return { exists: false };
  return {
    exists: true,
    builtAt: c.builtAt,
    entries: c.entries.length,
    datasets: new Set(c.entries.map((e) => e.slug)).size,
    provinceLevel: c.entries.filter((e) => e.province && e.province.n >= 50).length,
    subgroup: c.entries.filter((e) => e.subgroup).length,
    skipped: c.skipped.length,
    skippedSample: c.skipped.slice(0, 8),
  };
}

export async function GET() {
  if (!insightEnabled()) return new NextResponse(null, { status: 404 });
  return NextResponse.json(stats(await loadCatalog()));
}

export async function POST() {
  if (!insightEnabled()) return new NextResponse(null, { status: 404 });
  const t0 = Date.now();
  const log: string[] = [];
  const c = await buildCatalog((m) => log.push(m));
  return NextResponse.json({ ...stats(c), seconds: (Date.now() - t0) / 1000, log });
}
