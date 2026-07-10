import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

import { commitMetadata } from "@/lib/dataset-commit";

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
 */
export async function POST(req: NextRequest) {
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

  try {
    const result = await commitMetadata({
      slug,
      metadataYaml,
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
