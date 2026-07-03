import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Bucket, getR2Client } from "./client";

const STAGING_TTL_SECONDS = 15 * 60; // 15 phút — đủ cho browser upload file lớn

/**
 * Tạo presigned PUT URL cho browser upload thẳng R2 staging/.
 *
 * Pattern: browser → PUT file → R2 (không qua Vercel serverless).
 * TTL 15 phút — nếu user idle quá lâu phải refresh.
 *
 * @param fileId UUID do server generate (vd: crypto.randomUUID())
 * @param contentType MIME type từ file user chọn (vd: text/csv)
 */
export async function presignStagingUpload(
  fileId: string,
  contentType: string
): Promise<{ presignedUrl: string; r2Key: string; bucket: string }> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const r2Key = `staging/${fileId}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: r2Key,
    ContentType: contentType,
  });

  const presignedUrl = await getSignedUrl(client, command, {
    expiresIn: STAGING_TTL_SECONDS,
  });

  return { presignedUrl, r2Key, bucket };
}
