import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Bucket, getR2Client } from "@/lib/r2/client";
import { getDatasetBySlug } from "@/lib/datasets/read";
import { incrementDownloadCount } from "@/lib/r2/counter";
import { requireUserOr401 } from "@/lib/auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Encode Content-Disposition header RFC 6266/5987 — hỗ trợ filename Unicode.
 *
 * Trả về 2 dạng:
 *  - `filename="..."`: fallback ASCII (browser cũ)
 *  - `filename*=UTF-8''...`: RFC 5987 cho Unicode (browser modern)
 *
 * `attachment` ép browser download thay vì open inline.
 */
function encodeContentDisposition(filename: string): string {
  const safeAscii = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const utf8 = encodeURIComponent(filename);
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${utf8}`;
}

/**
 * API download — tạo presigned GET URL với ResponseContentDisposition,
 * redirect 302 → browser download file thay vì open inline.
 *
 * Why presigned GET với ResponseContentDisposition:
 * - R2 public access không support `response-content-disposition` query param
 *   (chỉ S3-compatible presigned GET mới support).
 * - presigned GET expire sau 60s — đủ cho redirect + browser bắt đầu download.
 * - Filename Unicode encode RFC 5987.
 *
 * Why không set Content-Disposition khi upload:
 * - AWS SDK v3 presign PUT không sign Content-Disposition default → browser
 *   PUT với header không sign → R2 reject (signature mismatch).
 * - API route approach hoạt động cho cả files cũ (đã upload trước fix).
 *
 * Usage: `<a href="/api/dataset/download?slug=X&resourceId=1">Download</a>`
 */
export async function GET(req: NextRequest) {
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const resourceIdParam = searchParams.get("resourceId");
  const resourceId = resourceIdParam ? parseInt(resourceIdParam, 10) : 1;

  if (!slug) {
    return NextResponse.json({ error: "Thiếu slug" }, { status: 400 });
  }

  const dataset = await getDatasetBySlug(slug);
  if (!dataset) {
    return NextResponse.json(
      { error: `Dataset "${slug}" không tồn tại` },
      { status: 404 }
    );
  }

  const resource =
    dataset.resources.find((r) => r.id === resourceId) ?? dataset.resources[0];
  if (!resource?.file_url) {
    return NextResponse.json(
      { error: "Dataset không có file để tải" },
      { status: 404 }
    );
  }

  // Extract r2_key từ file_url — reverse của buildFileUrl
  const publicBase = process.env.R2_PUBLIC_BASE;
  if (!publicBase) {
    return NextResponse.json(
      { error: "Server config thiếu R2_PUBLIC_BASE" },
      { status: 500 }
    );
  }
  const r2Key = resource.file_url.replace(`${publicBase}/`, "");

  // Build filename cho Content-Disposition — ưu tiên title gốc
  const baseName = resource.title || r2Key.split("/").pop() || "dataset";
  const filename = baseName.includes(".")
    ? baseName
    : `${baseName}.${resource.file_type ?? "csv"}`;

  const command = new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: r2Key,
    ResponseContentDisposition: encodeContentDisposition(filename),
  });

  try {
    const url = await getSignedUrl(getR2Client(), command, { expiresIn: 60 });

    // Increment download counter sync trước redirect (~150ms R2 GET+PUT).
    // Why sync: Vercel serverless có thể kill function sau response → fire-and-forget
    // mất count. Best-effort: nếu increment fail, vẫn redirect để user download được.
    try {
      await incrementDownloadCount(slug);
    } catch (err) {
      console.warn(`[download] Increment counter fail cho ${slug}:`, err);
    }

    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    console.error("[download] Presign GET thất bại:", err);
    return NextResponse.json(
      { error: "Không tạo được link download. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}
