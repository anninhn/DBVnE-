import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client } from "./client";

/**
 * Server-side fetch R2 object — trả Buffer.
 *
 * CHỈ gọi từ API route server. KHÔNG expose ra browser
 * (Access Key là server secret).
 */
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
