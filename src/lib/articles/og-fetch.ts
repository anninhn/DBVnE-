/**
 * OG metadata fetcher — parse Open Graph + article tags từ vnexpress.net.
 *
 * Spec: specs/2026-07-24-article-linking/
 *
 * Server-only. Sử dụng cheerio (user approved 2026-07-24) thay vì regex vì
 * robust hơn với HTML structure thay đổi.
 *
 * Tags extract:
 * - og:title (required — nếu thiếu → throw, không phải bài báo hợp lệ)
 * - og:image → thumbnail
 * - article:author (fallback: byline regex)
 * - article:published_time → published_at (ISO date)
 * - article:section → section (vd: "Thời sự")
 *
 * URL scope: chỉ vnexpress.net (chấp nhận subdomain).
 * Redirect: check final URL hostname không ra ngoài vnexpress.net.
 */

import * as cheerio from "cheerio";
import type { ArticleEntry } from "./types";

/** Timeout cho fetch HTML (ms) — 8s trong maxDuration 30s của Vercel. */
const FETCH_TIMEOUT_MS = 8000;

/** User-Agent custom — một số site block default fetch UA. */
const USER_AGENT =
  "vnexpress-data-platform-og-fetcher/1.0 (+https://data.vnexpress.net)";

export interface FetchedOgMeta {
  url: string;
  title: string;
  author?: string;
  published_at?: string;
  section?: string;
  thumbnail?: string;
}

/**
 * Validate URL là vnexpress.net (chấp nhận cả thiếu https://).
 *
 * @throws Error nếu URL không hợp lệ hoặc không phải vnexpress.net domain.
 */
export function assertVnexpressUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("URL không được để trống");
  }

  // Auto-add https:// nếu user paste không có scheme
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("URL không hợp lệ");
  }

  // Chấp nhận vnexpress.net + subdomain (vd: video.vnexpress.net)
  if (!url.hostname.endsWith("vnexpress.net")) {
    throw new Error("Chỉ chấp nhận URL từ vnexpress.net");
  }

  return url;
}

/**
 * Fetch HTML + extract OG tags từ vnexpress.net article.
 *
 * @throws Error nếu:
 *  - Fetch fail (network, timeout, HTTP error)
 *  - Redirect ra ngoài vnexpress.net (vd: qua facebook.com)
 *  - HTML không có `og:title` meta tag
 */
export async function fetchOgMeta(url: URL): Promise<FetchedOgMeta> {
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "vi",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Không tải được trang (HTTP ${res.status})`);
  }

  // Check redirect không đi ra ngoài vnexpress.net
  const finalUrl = new URL(res.url);
  if (!finalUrl.hostname.endsWith("vnexpress.net")) {
    throw new Error("Redirect ra ngoài vnexpress.net");
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Helper đọc meta tag — thử cả property= và name= để fallback
  const meta = (key: string): string | undefined => {
    const val =
      $(`meta[property="${key}"]`).attr("content") ||
      $(`meta[name="${key}"]`).attr("content");
    return val?.trim() || undefined;
  };

  const title = meta("og:title");
  if (!title) {
    throw new Error("Thiếu og:title — không phải bài báo hợp lệ");
  }

  const thumbnail = meta("og:image");
  const author = meta("article:author") || extractByline($);
  const published_at = meta("article:published_time");
  const section = meta("article:section");

  return {
    url: finalUrl.toString(),
    title,
    author,
    published_at,
    section,
    thumbnail,
  };
}

/**
 * Fallback byline — tìm tên tác giả khi thiếu article:author meta.
 *
 * VNExpress HTML pattern: <span class="author">Nguyễn Văn A</span> hoặc
 * <strong class="author">. Crude regex đủ cho phổ biến cases.
 */
function extractByline($: cheerio.CheerioAPI): string | undefined {
  const candidates = [".author", '[class*="author"]', ".byline", ".article-author"];
  for (const selector of candidates) {
    const text = $(selector).first().text().trim();
    if (text && text.length < 200) {
      // Strip suffix như "•", "|", dates
      return text.split(/[|•\n]/)[0].trim();
    }
  }
  return undefined;
}

/**
 * Build ArticleEntry từ FetchedOgMeta — chuẩn bị cho commit.
 * `added_at` + `added_by` caller set khi route invoke.
 */
export function ogMetaToArticle(
  og: FetchedOgMeta,
  overrides?: Partial<Pick<ArticleEntry, "title" | "author" | "published_at" | "section" | "thumbnail">>
): Omit<ArticleEntry, "added_at" | "added_by"> {
  return {
    url: og.url,
    title: overrides?.title ?? og.title,
    author: overrides?.author ?? og.author,
    published_at: overrides?.published_at ?? og.published_at,
    section: overrides?.section ?? og.section,
    thumbnail: overrides?.thumbnail ?? og.thumbnail,
  };
}
