"use client";

import { useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import type { UploadResult } from "./UploadWizard";

const MAX_SIZE_BYTES = 500 * 1024 * 1024;
const ALLOWED_EXTS = [".csv", ".geojson", ".xlsx", ".xls"];

interface Props {
  onUploaded: (result: UploadResult) => void;
  onError: (msg: string) => void;
}

export default function UploadDropzone({ onUploaded, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function handleFile(file: File) {
    const filename = file.name.toLowerCase();
    const ext = ALLOWED_EXTS.find((e) => filename.endsWith(e));
    if (!ext) {
      onError(`Định dạng không hỗ trợ: ${file.name}. Chấp nhận: ${ALLOWED_EXTS.join(", ")}`);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      onError(`File quá lớn: ${(file.size / 1024 / 1024).toFixed(1)}MB. Tối đa 500MB.`);
      return;
    }

    setUploading(true);
    setProgress("Đang chuẩn bị upload...");
    try {
      // 1. Get presigned URL
      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign.error ?? "Không thể chuẩn bị upload");

      // 2. PUT file trực tiếp lên R2 (không qua Vercel)
      setProgress(`Đang upload file (${(file.size / 1024 / 1024).toFixed(1)}MB)...`);
      const putRes = await fetch(presign.presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) {
        throw new Error(`Upload thất bại (${putRes.status}). Vui lòng thử lại.`);
      }

      const format: "csv" | "xlsx" | "geojson" = filename.endsWith(".geojson")
        ? "geojson"
        : filename.endsWith(".xlsx") || filename.endsWith(".xls")
          ? "xlsx"
          : "csv";
      onUploaded({
        fileId: presign.fileId,
        r2Key: presign.r2Key,
        filename: file.name,
        format,
        publicUrl: presign.publicUrl,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload thất bại");
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!uploading) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`border-2 border-dashed rounded-md py-16 px-6 text-center cursor-pointer transition ${
        isDragging
          ? "border-hf-yellow bg-hf-yellow-50/40"
          : "border-hf-border-strong hover:border-hf-yellow hover:bg-hf-bg-subtle"
      } ${uploading ? "opacity-70 cursor-wait" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.geojson,.xlsx,.xls"
        onChange={onSelect}
        className="hidden"
        disabled={uploading}
      />

      <div className="flex justify-center mb-3">
        {uploading ? (
          <Loader2 className="w-10 h-10 text-hf-yellow animate-spin" strokeWidth={1.5} />
        ) : (
          <UploadCloud className="w-10 h-10 text-hf-text-faint" strokeWidth={1.5} />
        )}
      </div>

      {uploading ? (
        <>
          <p className="text-sm font-medium text-hf-text mb-1">{progress}</p>
          <p className="text-xs text-hf-text-faint">Vui lòng đợi...</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-hf-text mb-1">
            Kéo thả file vào đây
          </p>
          <p className="text-xs text-hf-text-muted mb-3">
            hoặc <span className="text-hf-link hover:underline">click để chọn file</span>
          </p>
          <p className="text-[11px] text-hf-text-faint">
            Hỗ trợ: CSV, XLSX, XLS, GeoJSON • Tối đa 500MB
          </p>
        </>
      )}
    </div>
  );
}
