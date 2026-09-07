import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

export const maxDuration = 30;

import { commitMetadata } from "@/lib/dataset-commit";
import { requireUserOr401 } from "@/lib/auth";
import { injectEdited, mergeAuthFields } from "@/lib/auth/inject-actor";
import { getMetadataYamlRaw } from "@/lib/datasets/read";
import { syncDatasetIndexes } from "@/lib/retrieval/build";

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
 *
 * Bug fix: EditDatasetForm.tsx xây YAML mới từ scratch, không giữ edits[].
 * Route fetch existing YAML từ GitHub → merge auth fields → inject → commit.
 * Không merge = edits[] bị reset về 1 entry mỗi lần edit (history mất).
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

  // Fetch existing YAML từ GitHub — để giữ edits[] history không bị reset.
  // Best-effort: nếu fetch fail (network/GitHub down), proceed không merge —
  // vẫn save được edit nhưng edits[] sẽ start fresh (graceful degradation).
  let existingYaml: string | null = null;
  try {
    existingYaml = await getMetadataYamlRaw(slug);
  } catch (err) {
    console.warn(
      `[edit] Fetch existing metadata thất bại — proceed không merge edits[]:`,
      err
    );
  }

  // Merge auth fields (edits[], last_edited_by/at, status, deleted_by/at)
  // từ existing → client YAML, rồi inject edit mới (append vào edits[]).
  const yamlMerged = mergeAuthFields(metadataYaml, existingYaml);
  const yamlWithActor = injectEdited(yamlMerged, user.username);

  try {
    const result = await commitMetadata({
      slug,
      metadataYaml: yamlWithActor,
      dictionaryMarkdown,
      mode: "update",
    });

    // Invalidate listing cache — homepage refresh ngay < 1s sau edit.
    // Next.js 16: profile={expire:0} cho route handler = expire immediately.
    revalidateTag("datasets", { expire: 0 });

    // Ghi lại vector + entry chỉ mục giá trị của DUY NHẤT dataset này (FR-033).
    // Phải sau `revalidateTag`: hàm này đọc lại metadata qua `getDatasetBySlug`, mà
    // nó có cache 60s — không xoá cache trước thì nó dựng chỉ mục từ bản CŨ, tức là
    // tự tạo ra đúng cái lệch mà nó tồn tại để ngăn.
    await syncDatasetIndexes(slug);

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
