import { NextRequest, NextResponse } from "next/server";
import { getObject } from "@/lib/r2/get";
import { inspectFile } from "@/lib/ai/inspect";
import { analyzeDataset } from "@/lib/ai/dataset-reviewer";

export const maxDuration = 60; // AI call có thể mất 10-30s với file lớn

interface AnalyzeRequest {
  fileId: string;
  r2Key: string;
  filename: string;
}

export async function POST(req: NextRequest) {
  let body: AnalyzeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body phải là JSON hợp lệ" },
      { status: 400 }
    );
  }

  const { fileId, r2Key, filename } = body;

  if (!fileId || !r2Key || !filename) {
    return NextResponse.json(
      { error: "Thiếu thông tin file" },
      { status: 400 }
    );
  }

  // Verify r2Key match pattern `<fileId>/<filename>` (UUID-based, chặn traversal)
  // Key pattern thay đổi sau khi skip staging prefix (plan synchronous-toasting-kahn.md)
  const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\//;
  if (r2Key.includes("..") || !UUID_RE.test(r2Key)) {
    return NextResponse.json(
      { error: "Thông tin file không hợp lệ" },
      { status: 400 }
    );
  }

  try {
    // 1. Fetch file từ R2
    const buffer = await getObject(r2Key);

    // 2. Inspect (parse columns, dtypes, samples, stats)
    const inspection = inspectFile(buffer, filename);

    // 3. Gọi AI phân tích
    const proposal = await analyzeDataset(inspection);

    // 4. Return proposal + file preview cho frontend
    return NextResponse.json({
      proposal,
      filePreview: {
        format: inspection.format,
        rowCount: inspection.rowCount,
        columnCount: inspection.columnCount,
        columns: inspection.columns.map((c) => c.name),
        sampleRows: inspection.sampleRows,
      },
      fileId,
    });
  } catch (err) {
    console.error("[analyze] Error:", err);
    const msg = err instanceof Error ? err.message : String(err);

    // Pattern match common errors → user-friendly
    let userMsg = "Không phân tích được file. Vui lòng thử lại.";
    if (msg.includes("GEMINI_API_KEY") || msg.includes("API key")) {
      userMsg = "AI chưa được cấu hình. Liên hệ admin.";
    } else if (msg.includes("quota") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      userMsg = "AI đã hết quota gọi trong ngày. Thử lại vào ngày mai.";
    } else if (msg.includes("timeout") || msg.includes("Timeout") || msg.includes("Deadline")) {
      userMsg = "AI phân tích quá lâu. Thử lại với file nhỏ hơn.";
    } else if (msg.includes("Unsupported file format")) {
      userMsg = "Định dạng file không hỗ trợ. Chỉ chấp nhận .csv hoặc .xlsx.";
    } else if (msg.includes("XLSX không có sheet")) {
      userMsg = "File Excel không có sheet nào để phân tích.";
    } else if (process.env.NODE_ENV === "development") {
      userMsg = `Không phân tích được file: ${msg}`;
    }

    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
