import { NextRequest, NextResponse } from "next/server";

import { findValuesInQuery, RetrievalIndexUnavailableError } from "@/lib/retrieval";
import { requireUserOr401 } from "@/lib/auth";

/**
 * Tìm các giá trị **thật có trong dữ liệu** được nêu trong một câu hỏi.
 *
 * Mặt tiền HTTP để kiểm; luồng chat gọi hàm trực tiếp. Không cài lại logic nào.
 *
 * `GET /api/retrieval/values-in-query?q=có dữ liệu gì về Đà Nẵng`
 */
export async function GET(req: NextRequest) {
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;

  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query) {
    return NextResponse.json({ error: "Thiếu tham số `q`" }, { status: 400 });
  }

  try {
    const result = await findValuesInQuery(query, `api:${authCheck.user.username}`);
    return NextResponse.json({
      matches: result.matches.map((m) => ({
        display: m.display,
        variants: m.variants,
        datasetCount: m.datasetCount,
        locationCount: m.datasets.length,
        sample: m.datasets.slice(0, 5),
      })),
      partialColumns: result.partialColumns.length,
    });
  } catch (err) {
    if (err instanceof RetrievalIndexUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
