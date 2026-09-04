import { NextRequest, NextResponse } from "next/server";

import { searchDatasets, RetrievalIndexUnavailableError } from "@/lib/retrieval";
import { requireUserOr401 } from "@/lib/auth";

/**
 * Tìm dataset liên quan tới một câu hỏi — mặt tiền HTTP của `searchDatasets`.
 *
 * Mặt tiền thứ hai của cùng năng lực (FR-058), không cài lại logic nào. Có nó thì
 * kiểm được chất lượng tìm kiếm mà không phải đi qua cả luồng chat — mỗi lượt chat
 * là một lượt gọi model sinh văn bản, đắt hơn và trộn thêm biến số của prompt vào
 * thứ đang muốn đo.
 *
 * `GET /api/retrieval/search?q=lạm phát&limit=10&category=kinh-te&yearFrom=2020`
 */
export async function GET(req: NextRequest) {
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;

  const params = req.nextUrl.searchParams;
  const query = params.get("q")?.trim();
  if (!query) {
    return NextResponse.json({ error: "Thiếu tham số `q`" }, { status: 400 });
  }

  const num = (name: string): number | undefined => {
    const raw = params.get(name);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  try {
    const result = await searchDatasets({
      query,
      limit: num("limit") ?? 20,
      filters: {
        category: params.get("category") ?? undefined,
        format: params.get("format") ?? undefined,
        yearFrom: num("yearFrom"),
        yearTo: num("yearTo"),
      },
      caller: `api:${authCheck.user.username}`,
    });
    return NextResponse.json(result);
  } catch (err) {
    // Chỉ mục chưa dựng KHÔNG được trả thành danh sách rỗng — rỗng nghĩa là
    // "không có dataset nào liên quan", còn đây là "chưa biết".
    if (err instanceof RetrievalIndexUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
