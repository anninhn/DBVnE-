import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client } from "./client";

/**
 * Xóa R2 object — server-only.
 *
 * R2 Object Versioning chưa GA (2026-07) → deleteObject vĩnh viễn,
 * không undo. Gọi sau khi git rm thành công (order: git-first, R2-after).
 *
 * @param key — R2 object key (format: `<fileId>/<filename>`)
 * @throws Error nếu R2 delete thất bại (để API handler log + continue)
 */
export async function deleteObject(key: string): Promise<void> {
  const client = getR2Client();
  const bucket = getR2Bucket();

  await client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key })
  );
}
