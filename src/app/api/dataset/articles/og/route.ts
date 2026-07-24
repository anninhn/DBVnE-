/**
 * GET /api/dataset/articles/og?url=...
 *
 * Fetch OG metadata từ vnexpress.net article URL.
 * Spec: specs/2026-07-24-article-linking/
 *
 * Auth required — tránh abuse làm open proxy. User phải đã login.
 *
 * Response:
 *  - 200: { url, title, author?, published_at?, section?, thumbnail? }
 *  - 400: URL không hợp lệ hoặc không phải vnexpress.net
 *  - 401: chưa login
 *  - 422: Page OK nhưng thiếu og:title
 *  - 502: HTTP error khi fetch trang
 *  - 504: Timeout khi fetch
 */

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

import { requireUserOr401 } from "@/lib/auth";
import { assertVnexpressUrl, fetchOgMeta } from "@/lib/articles/og-fetch";

export async function GET(req: NextRequest) {
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;

  const urlParam = req.nextUrl.searchParams.get("url");
  if (!urlParam) {
    return NextResponse.json(
      { error: "Thiếu tham số url" },
      { status: 400 }
    );
  }

  let url: URL;
  try {
    url = assertVnexpressUrl(urlParam);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "URL không hợp lệ" },
      { status: 400 }
    );
  }

  try {
    const og = await fetchOgMeta(url);
    return NextResponse.json(og);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không đọc được trang";

    // Phân loại status code theo lỗi
    if (message.includes("Timeout") || err instanceof DOMException && err.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Trang phản hồi chậm — thử lại sau" },
        { status: 504 }
      );
    }
    if (message.startsWith("Không tải được trang")) {
      return NextResponse.json({ error: message }, { status: 502 });
    }
    if (message.startsWith("Thiếu og:title")) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    if (message.includes("Redirect ra ngoài")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("[og] Fetch OG meta thất bại:", err);
    return NextResponse.json(
      { error: "Không đọc được metadata từ trang" },
      { status: 500 }
    );
  }
}
