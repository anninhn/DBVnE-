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
 * API soft-delete dataset.
 *
 * Spec D3 — xóa NODE_ENV guard (prod có delete capability khi login).
 * Soft delete: set `status: deleted` + `deleted_by/at` trong metadata.yaml.
 * Raw file R2 + folder GitHub KHÔNG xóa — recovery cho đến khi hard delete.
 *
 * Hard delete = manual admin qua tools/cleanup-orphans.mjs --include-deleted.
 *
 * Audit log: append line vào datasets/_audit/delete.log (race window — spec D4).
 */
export async function POST(req: NextRequest) {
  // Auth check — thay NODE_ENV guard cũ
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
