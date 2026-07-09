import { S3Client } from "@aws-sdk/client-s3";

let _client: S3Client | null = null;

/**
 * R2 S3-compatible client (server-only).
 *
 * Khởi tạo từ env vars. Endpoint format:
 *   https://<account_id>.r2.cloudflarestorage.com
 *
 * Lưu ý: KHÔNG expose client này ra browser — Access Key là server secret.
 * Browser upload qua presigned URL (xem presign.ts).
 */
export function getR2Client(): S3Client {
  if (_client) return _client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials missing. Cần R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY trong .env.local"
    );
  }

  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // R2 không support AWS SDK v3 default checksum on presigned PUT.
    // Without this, presigned URL chứa `x-amz-checksum-crc32=...` → R2 reject.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return _client;
}

export function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME missing trong .env.local");
  return bucket;
}

/**
 * Xây dựng public URL cho R2 object — browser fetch trực tiếp, không proxy server (D2).
 *
 * Format: `${R2_PUBLIC_BASE}/${r2Key}`
 * Ví dụ: https://pub-abc123.r2.dev/550e8400-e29b-41d4-a716-446655440000/data.csv
 *
 * Lưu ý: R2 bucket phải config public access + CORS cho vercel.app + localhost.
 */
export function buildFileUrl(r2Key: string): string {
  const base = process.env.R2_PUBLIC_BASE;
  if (!base) {
    throw new Error(
      "R2_PUBLIC_BASE missing trong .env.local — cần set URL public R2 (vd: https://pub-abc123.r2.dev)"
    );
  }
  return `${base}/${r2Key}`;
}
