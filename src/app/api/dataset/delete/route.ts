import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

import { deleteDatasetFiles } from "@/lib/git/commit";
import { deleteObject } from "@/lib/r2/delete";
import { getMetadataYaml } from "@/lib/datasets/read";

interface DeleteRequest {
  slug: string;
  confirmSlug: string;
}

/**
 * API xóa dataset — DEV-ONLY (D4).
 *
 * NODE_ENV guard: return 404 khi production.
 *
 * Order: git rm FIRST (metadata.yaml + dictionary.md), R2 delete AFTER.
 * Nếu R2 delete fail → log error, KHÔNG rollback git.
 * Orphaned R2 object acceptable (dataset đã khỏi catalog, metadata clean).
 */
export async function POST(req: NextRequest) {
  // Guard: dev-only — production KHÔNG có delete capability
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Delete disabled in production" },
      { status: 404 }
    );
  }

  let body: DeleteRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body phải là JSON hợp lệ" },
      { status: 400 }
    );
  }

  const { slug, confirmSlug } = body;

  // Backend validation: slug phải khớp confirmSlug
  if (!slug || slug !== confirmSlug) {
    return NextResponse.json(
      { error: "Slug không khớp — gõ chính xác slug để xác nhận xóa" },
      { status: 400 }
    );
  }

  // 1. Fetch metadata.yaml để lấy danh sách r2_key
  const meta = await getMetadataYaml(slug);
  if (!meta) {
    return NextResponse.json(
      { error: `Dataset "${slug}" không tồn tại` },
      { status: 404 }
    );
  }

  // 2. Git rm FIRST — commit xóa metadata.yaml + dictionary.md
  try {
    await deleteDatasetFiles(slug);
  } catch (err) {
    console.error("[delete] Git rm thất bại:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Không xóa được dataset khỏi git: ${message}` },
      { status: 500 }
    );
  }

  // 3. R2 delete AFTER — xóa từng object
  const r2Keys = meta.files?.map((f) => f.r2_key).filter(Boolean) ?? [];
  const r2Errors: string[] = [];

  for (const key of r2Keys) {
    try {
      await deleteObject(key);
      console.info(`[delete] R2 object đã xóa: ${key}`);
    } catch (err) {
      // Log error, KHÔNG rollback git — orphaned R2 object acceptable (D4)
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[delete] R2 delete thất bại cho key ${key}:`, msg);
      r2Errors.push(`${key}: ${msg}`);
    }
  }

  if (r2Errors.length > 0) {
    console.warn(
      `[delete] Dataset ${slug} đã xóa khỏi git nhưng ${r2Errors.length} R2 object(s) orphaned:`,
      r2Errors
    );
  }

  return NextResponse.json({
    success: true,
    redirect: "/",
    message: `Dataset "${slug}" đã xóa${
      r2Errors.length > 0
        ? ` (⚠️ ${r2Errors.length} R2 object(s) orphaned — xem server log)`
        : ""
    }`,
  });
}
