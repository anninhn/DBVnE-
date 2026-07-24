import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

import { commitFiles } from "@/lib/git/commit";
import { getMetadataYaml } from "@/lib/datasets/read";
import { requireUserOr401 } from "@/lib/auth";
import { injectDeleted } from "@/lib/auth/inject-actor";
import { appendDeleteAudit } from "@/lib/auth/audit-log";

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
  const config_resp = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/contents/datasets/${slug}/metadata.yaml?ref=${process.env.GITHUB_REPO_BRANCH ?? "main"}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "User-Agent": "vnexpress-data-platform",
      },
      cache: "no-store",
    }
  );
  if (config_resp.status === 404) {
    return NextResponse.json(
      { error: `Dataset "${slug}" không tồn tại` },
      { status: 404 }
    );
  }
  if (!config_resp.ok) {
    return NextResponse.json(
      { error: "Không đọc được metadata.yaml" },
      { status: 500 }
    );
  }

  const data = (await config_resp.json()) as {
    content?: string;
    sha?: string;
  };
  const b64 = (data.content ?? "").replace(/\n/g, "");
  const yamlText = Buffer.from(b64, "base64").toString("utf-8");

  // 2. Inject status: deleted + deleted_by/at
  const isoNow = new Date().toISOString();
  const yamlWithDelete = injectDeleted(yamlText, user.username, isoNow);

  // 3. Commit metadata.yaml cập nhật (KHÔNG xóa file)
  try {
    await commitFiles(
      [
        {
          path: `datasets/${slug}/metadata.yaml`,
          content: yamlWithDelete,
        },
      ],
      `Soft-delete dataset ${slug} by ${user.username}`
    );
  } catch (err) {
    console.error("[delete] Git commit thất bại:", err);
    return NextResponse.json(
      { error: "Không xóa được dataset. Vui lòng thử lại." },
      { status: 500 }
    );
  }

  // 4. Append audit log (best-effort, không fail request nếu log fail)
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
