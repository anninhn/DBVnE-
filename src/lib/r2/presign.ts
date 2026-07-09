import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Bucket, getR2Client } from "./client";

const TTL_SECONDS = 15 * 60; // 15 phút — đủ cho browser upload file lớn

/**
 * Tạo presigned PUT URL cho browser upload thẳng R2.
 *
 * Pattern: browser → PUT file → R2 (không qua Vercel serverless).
 * TTL 15 phút — nếu user idle quá lâu phải refresh.
 *
 * R2 key pattern: `<fileId>/<filename>` — final path, không qua staging.
 * Lý do skip staging prefix: git commit là "publish boundary" (xem plan
 * synchronous-toasting-kahn.md). R2 chỉ là dumb binary store.
 *
 * @param fileId UUID do server generate
 * @param filename tên file gốc (vd: "grdp_test.csv") — dùng làm suffix R2 key
 * @param contentType MIME type (vd: text/csv)
 */
export async function presignUpload(
  fileId: string,
  filename: string,
  contentType: string
): Promise<{ presignedUrl: string; r2Key: string; bucket: string }> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  // Sanitize filename — chỉ giữ [a-zA-Z0-9._-]
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const r2Key = `${fileId}/${safeName}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: r2Key,
    ContentType: contentType,
  });

  const presignedUrl = await getSignedUrl(client, command, {
    expiresIn: TTL_SECONDS,
  });

  return { presignedUrl, r2Key, bucket };
}
