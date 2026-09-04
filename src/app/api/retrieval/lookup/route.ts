import { NextRequest, NextResponse } from "next/server";

import { lookupValue, RetrievalIndexUnavailableError } from "@/lib/retrieval";
import { requireUserOr401 } from "@/lib/auth";

/**
 * Tra một giá trị ra danh sách dataset chứa nó — mặt tiền HTTP của `lookupValue`.
 *
 * Đây là mặt tiền thứ hai của cùng một năng lực (FR-058): trang hỏi đáp gọi hàm
 * trực tiếp, còn endpoint này để kiểm tay và để công cụ ngoài dùng. Nó KHÔNG cài
 * lại logic nào — có thêm mặt tiền mà không phải sửa năng lực chính là điều kiện
 * mà thiết kế đặt ra.
 *
 * `GET /api/retrieval/lookup?value=Đà Nẵng`
 */
export async function GET(req: NextRequest) {
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;

  const value = req.nextUrl.searchParams.get("value")?.trim();
  if (!value) {
    return NextResponse.json({ error: "Thiếu tham số `value`" }, { status: 400 });
  }

  try {
    const result = await lookupValue({
      value,
      caller: `api:${authCheck.user.username}`,
    });
    return NextResponse.json(result);
  } catch (err) {
    // Chỉ mục chưa dựng KHÔNG được trả thành `found: false` — đó là nói "không
    // có" khi thực ra là "chưa biết". 503 để caller phân biệt được.
    if (err instanceof RetrievalIndexUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
