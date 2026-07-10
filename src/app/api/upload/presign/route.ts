import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { presignUpload } from "@/lib/r2/presign";
import { detectFormat } from "@/lib/ai/inspect";

export const maxDuration = 60; // Vercel Fluid Compute

const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

const ALLOWED_CONTENT_TYPES = new Set([
  "text/csv",
  "text/tab-separated-values",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "", // browser có khi không set cho CSV — validate bằng extension thay
]);

interface PresignRequest {
  filename: string;
  contentType: string;
  size: number;
}

export async function POST(req: NextRequest) {
  let body: PresignRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body phải là JSON hợp lệ" },
      { status: 400 }
    );
  }

  const { filename, contentType, size } = body;

  // Validate filename + format
  if (!filename || typeof filename !== "string") {
    return NextResponse.json(
      { error: "Filename thiếu hoặc không hợp lệ" },
      { status: 400 }
    );
  }
  const format = detectFormat(filename);
  if (!format) {
    return NextResponse.json(
      { error: "Định dạng file không hỗ trợ. Chỉ chấp nhận .csv hoặc .xlsx" },
      { status: 400 }
    );
  }

  // Validate content-type nếu có
  if (contentType && !ALLOWED_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: `Content-Type không hỗ trợ: ${contentType}` },
      { status: 400 }
    );
  }

  // Validate size
  if (typeof size !== "number" || size <= 0) {
    return NextResponse.json(
      { error: "Size phải là số dương" },
      { status: 400 }
    );
  }
  if (size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: `File quá lớn. Tối đa 500MB, nhận được ${(size / 1024 / 1024).toFixed(1)}MB`,
      },
      { status: 413 }
    );
  }

  // Generate fileId + presigned URL
  const fileId = randomUUID();
  const finalContentType = contentType || (format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  try {
    const { presignedUrl, r2Key, bucket } = await presignUpload(
      fileId,
      filename,
      finalContentType
    );

    return NextResponse.json({
      presignedUrl,
      fileId,
      r2Key,
      bucket,
      expiresIn: 900, // 15 phút (seconds)
    });
  } catch (err) {
    console.error("[presign] Error:", err);
    return NextResponse.json(
      { error: "Không thể chuẩn bị upload. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}
