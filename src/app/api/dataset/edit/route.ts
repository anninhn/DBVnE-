import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

import { commitMetadata } from "@/lib/dataset-commit";
import { requireUserOr401 } from "@/lib/auth";
import { injectEdited } from "@/lib/auth/inject-actor";

interface EditRequest {
  slug: string;
  metadataYaml: string;
  dictionaryMarkdown: string;
}

/**
 * API commit edit metadata — update mode.
 *
 * D3: Edit = metadata/dictionary only, không replace file.
 * Gọi `commitMetadata()` với mode "update" → commit message "Update dataset <slug>".
 *
 * Auth: inject last_edited_by/at + append edits[] entry (spec D2).
 */
export async function POST(req: NextRequest) {
  // Auth check — spec plan task 14
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;
  const user = authCheck.user;

  let body: EditRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body phải là JSON hợp lệ" },
      { status: 400 }
    );
  }

  const { slug, metadataYaml, dictionaryMarkdown } = body;

  if (!slug || !metadataYaml) {
    return NextResponse.json(
      { error: "Thiếu thông tin dataset cần cập nhật" },
      { status: 400 }
    );
  }

  // Inject actor — append edits[] entry, set last_edited_by/at
  const yamlWithActor = injectEdited(metadataYaml, user.username);

  try {
    const result = await commitMetadata({
      slug,
      metadataYaml: yamlWithActor,
      dictionaryMarkdown,
      mode: "update",
    });

    return NextResponse.json({
      success: true,
      slug,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      message: `Đã lưu cập nhật cho dataset "${slug}".`,
      redirect: `/datasets/${slug}`,
    });
  } catch (err) {
    console.error("[edit] Git commit thất bại:", err);
    return NextResponse.json(
      { error: "Không thể lưu cập nhật. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}
