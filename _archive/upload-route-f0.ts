import { NextResponse } from "next/server";
import { uploadFile, getFileType } from "@/lib/storage/upload";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const entityId = formData.get("entity_id") as string;
    const year = formData.get("year") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!entityId) {
      return NextResponse.json({ error: "entity_id required" }, { status: 400 });
    }

    const { url, sizeMb } = await uploadFile(file, entityId, year ? parseInt(year) : null);

    return NextResponse.json({
      file_url: url,
      file_type: getFileType(file.name),
      file_size_mb: sizeMb,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
