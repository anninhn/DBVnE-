import { NextRequest, NextResponse } from "next/server";

import { buildValueIndexFromRepo, buildAndSaveValueIndex } from "@/lib/retrieval/build";
import { requireUserOr401 } from "@/lib/auth";

/**
 * Dựng lại chỉ mục tra cứu từ metadata trong git.
 *
 * Đây là thao tác vận hành, chạy bằng `tools/build-retrieval-index.mjs`. Nó là
 * route chứ không phải script độc lập vì việc dựng chỉ mục dùng chính hàm đọc
 * metadata của app (`getDatasetBySlug`) và chính hàm chuẩn hoá của tầng tra cứu —
 * viết lại chúng trong `.mjs` là tạo một bản chuẩn hoá thứ hai, mà lệch chuẩn hoá
 * thì tra không ra và KHÔNG có triệu chứng nào (D4).
 *
 * Mặc định là thử: `{ apply: true }` mới ghi lên R2.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;

  let apply = false;
  try {
    const body = await req.json();
    apply = body?.apply === true;
  } catch {
    // Body rỗng = dry-run. Không bắt lỗi ở đây thì gọi bằng curl không body sẽ hỏng.
  }

  const started = Date.now();
  const result = apply ? await buildAndSaveValueIndex() : await buildValueIndexFromRepo();

  return NextResponse.json({
    applied: apply,
    datasetsRead: result.datasetsRead,
    unreadable: result.unreadable,
    columnsIndexed: result.columnsIndexed,
    keys: result.keys,
    partialColumns: result.index.partialColumns.length,
    builtAt: result.index.builtAt,
    sizeKb: Math.round(JSON.stringify(result.index).length / 1024),
    elapsedMs: Date.now() - started,
  });
}
