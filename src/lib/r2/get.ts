import {
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client } from "./client";

/**
 * Server-side R2 operations — CHỈ gọi từ API route server.
 * KHÔNG expose ra browser (Access Key là server secret).
 */

/** Fetch R2 object — trả Buffer. */
export async function getObject(key: string): Promise<Buffer> {
  const client = getR2Client();
  const bucket = getR2Bucket();

  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  if (!response.Body) {
    throw new Error(`R2 object rỗng: ${key}`);
  }

  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * Object metadata — version_id + sha256 + size — cho metadata.yaml field `files[]`.
 *
 * Yêu cầu R2 object versioning ENABLE trên bucket (Cloudflare dashboard).
 * Không enable → version_id vẫn trả nhưng luôn null (current version).
 * R2 Object Versioning chưa GA 2026-07 → sha256 (từ ChecksumMode=ENABLED)
 * là primary atomic reference.
 *
 * Reference: plan synchronous-toasting-kahn.md (Approach A refined).
 */
export interface ObjectMetadata {
  version_id?: string;
  sha256?: string;
  size_bytes?: number;
  size_mb?: number;
  content_type?: string;
  last_modified?: Date;
}

export async function getObjectMetadata(
  key: string
): Promise<ObjectMetadata> {
  const client = getR2Client();
  const bucket = getR2Bucket();

  // ChecksumMode ENABLED để R2 trả lại checksum (sha256) qua HeadObject.
  // Cần cho metadata.yaml field `files[].sha256` — atomic reference thay thế
  // khi R2 Object Versioning chưa available (beta Cloudflare 2026-07).
  const response = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
      ChecksumMode: "ENABLED",
    })
  );

  return {
    version_id: response.VersionId,
    sha256:
      (response as unknown as { ChecksumSHA256?: string }).ChecksumSHA256 ??
      response.Metadata?.sha256,
    size_bytes: response.ContentLength,
    size_mb: response.ContentLength
      ? Number((response.ContentLength / 1024 / 1024).toFixed(2))
      : undefined,
    content_type: response.ContentType,
    last_modified: response.LastModified,
  };
}
