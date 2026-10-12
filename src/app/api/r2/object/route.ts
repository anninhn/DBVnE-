import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client } from "@/lib/r2/client";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * API proxy đọc object R2 qua chính domain của app (same-origin).
 *
 * VÌ SAO CẦN: client fetch thẳng `pub-xxx.r2.dev` là request cross-origin, nên
 * phụ thuộc hoàn toàn vào CORS policy của bucket. Policy đó liệt kê origin cứng
 * (`localhost:3000`, `*.vercel.app`) nên hỏng im lặng mỗi khi:
 *   - `next dev` nhảy sang cổng khác vì 3000 bị chiếm → preview báo "Không tải
 *     được bản đồ (Failed to fetch)", chỉ ở máy dev, rất dễ tưởng lỗi khác;
 *   - deploy lên domain riêng (không phải *.vercel.app) → hỏng cả production.
 * Đi qua route này thì fetch là same-origin, không còn CORS trong mạch preview.
 *
 * KHÔNG mở thêm quyền đọc: chỉ nhận `url` nằm trong `R2_PUBLIC_BASE` — đúng các
 * object mà bucket public vốn đã cho tải. Chặn `url` tuỳ ý để route không thành
 * SSRF gateway.
 *
 * Không đếm download (đó là việc của `/api/dataset/download`) — đây là đường
 * preview, gọi mỗi lần mở Dataset card.
 *
 * Usage: `fetch(proxiedR2Url(resource.file_url))`
 */
export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "Thiếu tham số url" }, { status: 400 });
  }

  const publicBase = process.env.R2_PUBLIC_BASE;
  if (!publicBase) {
    return NextResponse.json(
      { error: "Server config thiếu R2_PUBLIC_BASE" },
      { status: 500 }
    );
  }

  const prefix = `${publicBase.replace(/\/+$/, "")}/`;
  if (!rawUrl.startsWith(prefix)) {
    return NextResponse.json(
      { error: "URL không thuộc R2 bucket của hệ thống" },
      { status: 400 }
    );
  }

  const r2Key = decodeURIComponent(rawUrl.slice(prefix.length));
  if (!r2Key || r2Key.includes("..")) {
    return NextResponse.json({ error: "Key không hợp lệ" }, { status: 400 });
  }

  // Range pass-through: preview CSV chỉ cần vài trăm KB đầu, không cần cả file.
  const range = req.headers.get("range") ?? undefined;

  try {
    const out = await getR2Client().send(
      new GetObjectCommand({ Bucket: getR2Bucket(), Key: r2Key, Range: range })
    );

    if (!out.Body) {
      return NextResponse.json({ error: "Object rỗng" }, { status: 404 });
    }

    const headers = new Headers();
    if (out.ContentType) headers.set("Content-Type", out.ContentType);
    if (out.ContentLength != null) {
      headers.set("Content-Length", String(out.ContentLength));
    }
    if (out.ContentRange) headers.set("Content-Range", out.ContentRange);
    if (out.ETag) headers.set("ETag", out.ETag);
    headers.set("Accept-Ranges", "bytes");
    // File R2 là immutable theo key (mỗi lần upload sinh key mới) → cache dài,
    // preview mở lại không phải tải lại.
    headers.set("Cache-Control", "public, max-age=3600, immutable");

    return new NextResponse(out.Body.transformToWebStream(), {
      status: range ? 206 : 200,
      headers,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "NoSuchKey" || name === "NotFound") {
      return NextResponse.json({ error: "File không tồn tại" }, { status: 404 });
    }
    console.error("[r2/object] Đọc object thất bại:", err);
    return NextResponse.json({ error: "Không đọc được file" }, { status: 500 });
  }
}
