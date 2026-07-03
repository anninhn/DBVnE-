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
      { error: "Thiếu fileId, r2Key, hoặc filename" },
      { status: 400 }
    );
  }

  // Verify r2Key thuộc staging prefix (chặn path traversal)
  if (!r2Key.startsWith("staging/")) {
    return NextResponse.json(
      { error: "r2Key phải bắt đầu bằng 'staging/'" },
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
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    return NextResponse.json(
      { error: `Analyze thất bại: ${message}` },
      { status: 500 }
    );
  }
}
