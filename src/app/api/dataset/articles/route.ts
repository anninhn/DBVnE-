/**
 * POST /api/dataset/articles
 *
 * Add 1 article vào dataset metadata.yaml.
 * Spec: specs/2026-07-24-article-linking/
 *
 * Body:
 *   {
 *     slug: string,
 *     article: {
 *       url: string,           // vnexpress.net URL (required)
 *       title: string,         // (required)
 *       author?: string,
 *       published_at?: string,
 *       section?: string,
 *       thumbnail?: string
 *     }
 *   }
 *
 * Response:
 *   200: { success, slug, commitSha, commitUrl, message }
 *   400: validation error
 *   401: chưa login
 *   404: dataset không tồn tại
 *   409: URL đã có trong articles[] (duplicate)
 *   500: GitHub commit fail
 *
 * Auth: requireUserOr401. Permission: mọi user đã login được add vào bất kỳ dataset nào.
 * Audit: append edits[] với summary "Thêm bài báo: <title>".
 *
 * ---
 *
 * DELETE /api/dataset/articles
 *
 * Gỡ 1 liên kết bài báo khỏi dataset. Spec 003 FR-032 (chốt 2026-08-24).
 *
 * Body: { slug: string, url: string }
 *
 * Vì sao cần: tính năng này tồn tại để TRUY NGUỒN, mà provenance sai còn tệ hơn
 * không có provenance — dataset gắn nhầm bài sẽ nói dối về nơi nó đã được dùng.
 * Trước 2026-08-24 chỉ có POST, dán nhầm là bản ghi sai nằm lại vĩnh viễn.
 *
 * Response:
 *   200: { success, slug, url, commitSha, commitUrl, message }
 *   400/401/404/500 như POST
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

export const maxDuration = 30;

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { requireUserOr401 } from "@/lib/auth";
import { injectEdited } from "@/lib/auth/inject-actor";
import { getMetadataYamlRaw } from "@/lib/datasets/read";
import { commitMetadataYamlOnly } from "@/lib/git/commit";
import { assertVnexpressUrl } from "@/lib/articles/og-fetch";
import type { MetadataYaml, ArticleEntry } from "@/lib/datasets/types";

interface ArticleInput {
  url: string;
  title: string;
  author?: string;
  published_at?: string;
  section?: string;
  thumbnail?: string;
}

interface AddArticleRequest {
  slug: string;
  article: ArticleInput;
}

/** Normalize URL để compare (trailing slash, lowercase host). */
function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Strip trailing slash từ pathname (vd: /article/ → /article)
    if (u.pathname.endsWith("/") && u.pathname.length > 1) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

export async function POST(req: NextRequest) {
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;
  const user = authCheck.user;

  let body: AddArticleRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body phải là JSON hợp lệ" },
      { status: 400 }
    );
  }

  const { slug, article } = body;

  // Validate slug + article basic shape
  if (!slug || typeof slug !== "string") {
    return NextResponse.json(
      { error: "Thiếu slug dataset" },
      { status: 400 }
    );
  }
  if (!article || typeof article !== "object") {
    return NextResponse.json(
      { error: "Thiếu thông tin article" },
      { status: 400 }
    );
  }

  // Validate URL
  let url: URL;
  try {
    url = assertVnexpressUrl(article.url);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "URL không hợp lệ" },
      { status: 400 }
    );
  }

  // Validate title — bắt buộc
  const title = article.title?.trim();
  if (!title) {
    return NextResponse.json(
      { error: "Tiêu đề bài báo là bắt buộc" },
      { status: 400 }
    );
  }

  // Fetch existing YAML
  let existingYamlText: string | null;
  try {
    existingYamlText = await getMetadataYamlRaw(slug);
  } catch (err) {
    console.error("[articles] Fetch existing YAML thất bại:", err);
    return NextResponse.json(
      { error: "Không đọc được dataset. Vui lòng thử lại." },
      { status: 500 }
    );
  }
  if (!existingYamlText) {
    return NextResponse.json(
      { error: `Dataset "${slug}" không tồn tại` },
      { status: 404 }
    );
  }

  // Parse + check duplicate URL
  const meta = parseYaml(existingYamlText) as MetadataYaml;
  const articles = Array.isArray(meta.articles) ? meta.articles : [];
  const canonicalNew = canonicalizeUrl(url.toString());
  const isDuplicate = articles.some(
    (a) => canonicalizeUrl(a.url) === canonicalNew
  );
  if (isDuplicate) {
    return NextResponse.json(
      { error: "URL này đã được liên kết với dataset." },
      { status: 409 }
    );
  }

  // Build new article entry
  const newArticle: ArticleEntry = {
    url: url.toString(),
    title,
    author: article.author?.trim() || undefined,
    published_at: article.published_at?.trim() || undefined,
    section: article.section?.trim() || undefined,
    thumbnail: article.thumbnail?.trim() || undefined,
    added_at: new Date().toISOString(),
    added_by: user.username,
  };

  // Append + stringify (giữ field order từ parse, không reorder)
  meta.articles = [...articles, newArticle];
  const yamlMutated = stringifyYaml(meta);

  // Inject audit entry: last_edited_by/at + edits[]
  const summary = `Thêm bài báo: ${title.slice(0, 60)}${title.length > 60 ? "…" : ""}`;
  const yamlWithAudit = injectEdited(yamlMutated, user.username, summary);

  // Commit (chỉ metadata.yaml, không đụng dictionary.md)
  try {
    const result = await commitMetadataYamlOnly(
      slug,
      yamlWithAudit,
      `Add article to dataset ${slug}: ${title.slice(0, 80)}`
    );

    // Spec 003 FR-023 — bài báo mới phải hiện NGAY ở mọi nơi hiển thị dataset.
    // Đây là route ghi duy nhất trước đây thiếu bước này (3 route còn lại —
    // upload/commit, dataset/edit, dataset/delete — đều có), nên bài vừa thêm
    // không xuất hiện cho tới khi cache 60s hết hạn.
    revalidateTag("datasets", { expire: 0 });

    return NextResponse.json({
      success: true,
      slug,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      article: newArticle,
      message: `Đã liên kết bài báo với dataset "${slug}".`,
    });
  } catch (err) {
    console.error("[articles] Git commit thất bại:", err);
    return NextResponse.json(
      { error: "Không thể lưu. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;
  const user = authCheck.user;

  let body: { slug?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body phải là JSON hợp lệ" },
      { status: 400 }
    );
  }

  const slug = body.slug?.trim();
  const targetUrl = body.url?.trim();
  if (!slug || !targetUrl) {
    return NextResponse.json(
      { error: "Thiếu slug hoặc url" },
      { status: 400 }
    );
  }

  let existingYamlText: string | null;
  try {
    existingYamlText = await getMetadataYamlRaw(slug);
  } catch (err) {
    console.error("[articles] Fetch existing YAML thất bại:", err);
    return NextResponse.json(
      { error: "Không đọc được dataset. Vui lòng thử lại." },
      { status: 500 }
    );
  }
  if (!existingYamlText) {
    return NextResponse.json(
      { error: `Dataset "${slug}" không tồn tại` },
      { status: 404 }
    );
  }

  const meta = parseYaml(existingYamlText) as MetadataYaml;
  const articles = Array.isArray(meta.articles) ? meta.articles : [];

  // So khớp bằng canonical form — cùng hàm POST dùng để phát hiện trùng, nên
  // URL thêm vào kiểu nào cũng gỡ được kiểu đó.
  const canonicalTarget = canonicalizeUrl(targetUrl);
  const removed = articles.find(
    (a) => canonicalizeUrl(a.url) === canonicalTarget
  );
  if (!removed) {
    return NextResponse.json(
      { error: "Không tìm thấy liên kết bài báo này trong dataset." },
      { status: 404 }
    );
  }

  const remaining = articles.filter(
    (a) => canonicalizeUrl(a.url) !== canonicalTarget
  );
  // Rỗng thì bỏ hẳn field thay vì để mảng rỗng — khớp cách renderer xử lý.
  if (remaining.length > 0) meta.articles = remaining;
  else delete meta.articles;

  const title = removed.title ?? targetUrl;
  const summary = `Gỡ bài báo: ${title.slice(0, 60)}${title.length > 60 ? "…" : ""}`;
  const yamlWithAudit = injectEdited(
    stringifyYaml(meta),
    user.username,
    summary
  );

  try {
    const result = await commitMetadataYamlOnly(
      slug,
      yamlWithAudit,
      `Remove article from dataset ${slug}: ${title.slice(0, 80)}`
    );

    revalidateTag("datasets", { expire: 0 });

    return NextResponse.json({
      success: true,
      slug,
      url: removed.url,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      message: `Đã gỡ liên kết bài báo khỏi dataset "${slug}".`,
    });
  } catch (err) {
    console.error("[articles] Git commit thất bại:", err);
    return NextResponse.json(
      { error: "Không lưu được thay đổi. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}
