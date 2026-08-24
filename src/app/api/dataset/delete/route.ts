import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

export const maxDuration = 30;

import { commitFiles } from "@/lib/git/commit";
import { requireUserOr401 } from "@/lib/auth";
import { injectDeleted } from "@/lib/auth/inject-actor";
import { appendDeleteAudit } from "@/lib/auth/audit-log";
import { fetchFileContents } from "@/lib/github/contents-api";
import { buildIndexFileFromYaml } from "@/lib/datasets/index-json";

interface DeleteRequest {
  slug: string;
  confirmSlug: string;
  reason?: string;
}

/**
 * API soft-delete dataset — CHỈ chạy ở môi trường dev.
 *
 * Soft delete: set `status: deleted` + `deleted_by/at` trong metadata.yaml.
 * Raw file R2 + folder GitHub KHÔNG xóa — recovery cho đến khi hard delete.
 *
 * Hard delete = manual admin qua tools/cleanup-orphans.mjs --include-deleted.
 *
 * Audit log: append line vào datasets/_audit/delete.log (race window — spec D4).
 *
 * VỀ GUARD MÔI TRƯỜNG (spec 002 FR-033, chốt 2026-08-24):
 * Spec `_archive/2026-07-24-auth-light` chỉ đạo bỏ guard này và chỉ sửa ở route,
 * quên `DeleteDatasetButton` — thành ra API cho gỡ ở production nhưng nút bị ẩn.
 * Mâu thuẫn tồn tại tới 2026-08-24, trong thời gian đó có 5 lần gỡ thật trên
 * nhánh chính (gọi API trực tiếp hoặc chạy dev).
 * Ninh chốt giải theo hướng KHOÁ: gỡ dataset là thao tác dọn kho có chủ đích,
 * không phải năng lực thường ngày của 7 người dùng. Muốn gỡ thì chạy dev.
 * Nút UI đã ẩn sẵn ở production nên hai bên giờ khớp nhau.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error:
          "Xóa dataset chỉ dùng được ở môi trường dev. Chạy local để dọn kho, " +
          "hoặc dùng tools/cleanup-orphans.mjs cho hard delete.",
      },
      { status: 403 }
    );
  }

  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;
  const user = authCheck.user;

  let body: DeleteRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body phải là JSON hợp lệ" },
      { status: 400 }
    );
  }

  const { slug, confirmSlug, reason } = body;

  // Backend validation: slug phải khớp confirmSlug
  if (!slug || slug !== confirmSlug) {
    return NextResponse.json(
      { error: "Slug không khớp — gõ chính xác slug để xác nhận xóa" },
      { status: 400 }
    );
  }

  // 1. Fetch metadata.yaml hiện tại (raw text để inject field)
  const result = await fetchFileContents(`datasets/${slug}/metadata.yaml`);
  if (!result) {
    return NextResponse.json(
      { error: `Dataset "${slug}" không tồn tại` },
      { status: 404 }
    );
  }
  const yamlText = result.content;

  // 2. Inject status: deleted + deleted_by/at
  const isoNow = new Date().toISOString();
  const yamlWithDelete = injectDeleted(yamlText, user.username, isoNow);

  // 3. Commit metadata.yaml + index.json (status: deleted) — atomic cùng SHA.
  try {
    const files: Parameters<typeof commitFiles>[0] = [
      {
        path: `datasets/${slug}/metadata.yaml`,
        content: yamlWithDelete,
      },
    ];
    try {
      const indexFile = await buildIndexFileFromYaml(yamlWithDelete);
      if (indexFile) files.push(indexFile);
    } catch (err) {
      console.warn(
        `[delete] index.json update fail — proceed commit metadata only:`,
        err,
      );
    }
    await commitFiles(files, `Soft-delete dataset ${slug} by ${user.username}`);
  } catch (err) {
    console.error("[delete] Git commit thất bại:", err);
    return NextResponse.json(
      { error: "Không xóa được dataset. Vui lòng thử lại." },
      { status: 500 }
    );
  }

  // 4. Invalidate listing cache — homepage refresh ngay < 1s sau delete.
  // Next.js 16: profile={expire:0} cho route handler = expire immediately.
  revalidateTag("datasets", { expire: 0 });

  // 5. Append audit log (best-effort, không fail request nếu log fail)
  try {
    await appendDeleteAudit({
      username: user.username,
      slug,
      reason,
      isoTime: isoNow,
    });
  } catch (err) {
    console.warn(
      `[delete] Audit log append thất bại (commit đã thành công, log được trace qua git history):`,
      err
    );
  }

  return NextResponse.json({
    success: true,
    redirect: "/",
    message: `Dataset "${slug}" đã được xóa (soft delete). Raw file vẫn còn ở R2 cho đến khi admin hard-delete.`,
  });
}
