"use client";

import { useEffect, useState } from "react";
import type { AIProposal, FilePreview, UploadResult } from "./UploadWizard";

interface Props {
  upload: UploadResult;
  onDone: (proposal: AIProposal, preview: FilePreview) => void;
  onError: (msg: string) => void;
}

const STAGES = [
  "Đang tải file từ R2...",
  "Đang phân tích cấu trúc cột...",
  "Đang gọi AI phân tích...",
  "Đang tạo đề xuất metadata + dictionary...",
];

export default function AIAnalyzingLoader({ upload, onDone, onError }: Props) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let stageTimer: ReturnType<typeof setInterval> | null = null;

    async function run() {
      // Rotate stage text mỗi 2.5s cho UX (không block thực tế)
      stageTimer = setInterval(() => {
        if (!cancelled && stage < STAGES.length - 1) {
          setStage((s) => Math.min(s + 1, STAGES.length - 1));
        }
      }, 2500);

      try {
        const res = await fetch("/api/upload/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: upload.fileId,
            r2Key: upload.r2Key,
            filename: upload.filename,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Analyze failed");

        if (!cancelled) {
          setStage(STAGES.length - 1);
          // Đợi 500ms cho UX smooth
          setTimeout(() => {
            if (!cancelled) onDone(data.proposal, data.filePreview);
          }, 500);
        }
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : "Analyze thất bại");
        }
      } finally {
        if (stageTimer) clearInterval(stageTimer);
      }
    }

    run();
    return () => {
      cancelled = true;
      if (stageTimer) clearInterval(stageTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upload.fileId]);

  return (
    <div className="bg-hf-bg border border-hf-border rounded-md p-10 text-center">
      <div className="inline-block w-10 h-10 border-4 border-hf-border border-t-hf-yellow rounded-full animate-spin mb-4" />
      <p className="text-sm font-medium text-hf-text mb-1">{STAGES[stage]}</p>
      <p className="text-xs text-hf-text-faint">
        File: <span className="font-mono text-hf-text-muted">{upload.filename}</span>
      </p>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5 mt-6">
        {STAGES.map((_, i) => (
          <span
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition ${
              i <= stage ? "bg-hf-yellow" : "bg-hf-border"
            }`}
          />
        ))}
      </div>

      <p className="text-[11px] text-hf-text-faint mt-6">
        ⏱️ Thường mất 5–15 giây tùy kích thước file
      </p>
    </div>
  );
}
