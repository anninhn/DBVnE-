"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import UploadDropzone from "./UploadDropzone";
import AIAnalyzingLoader from "./AIAnalyzingLoader";
import MetadataEditor from "./MetadataEditor";
import DictionaryEditor from "./DictionaryEditor";
import CommitPreview from "./CommitPreview";
import { formatCompactNumber } from "@/lib/format";
import type { ColumnStats } from "@/lib/types/dataset";

type Step = 1 | 2 | 3 | 4;

export interface UploadResult {
  fileId: string;
  r2Key: string;
  filename: string;
  format: "csv" | "xlsx";
}

export interface AIProposal {
  metadata: {
    title: string;
    description: string;
    category: string;
    tags: string[];
    source: string;
    source_url: string;
    confidence: "high" | "medium" | "low";
  };
  dictionary: DictionaryEntry[];
  questions: string[];
}

export interface DictionaryEntry {
  column: string;
  type: "string" | "number" | "date" | "boolean" | "category";
  unit: string;
  description: string;
  /** Frictionless Data Table Schema — optional, chỉ cho type: "number" */
  decimal_char?: "." | ",";
  /** Frictionless Data Table Schema — optional, chỉ cho type: "number" */
  group_char?: "." | "," | " ";
}

export interface FilePreview {
  format: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  sampleRows: Record<string, string | number | boolean | null>[];
  /** Full-dataset stats per column — computed streaming tại analyze time */
  columnStats?: Record<string, ColumnStats>;
}

export interface CommitPreview {
  slug: string;
  yamlPreview: string;
  markdownPreview: string;
  committed: boolean;
  message: string;
  commitSha?: string;
  commitUrl?: string;
  url?: string;
}

const STEP_LABELS: Record<Step, string> = {
  1: "Upload file",
  2: "AI analysis",
  3: "Review metadata",
  4: "Preview",
};

export default function UploadWizard() {
  const [step, setStep] = useState<Step>(1);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [proposal, setProposal] = useState<AIProposal | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [commitPreview, setCommitPreview] = useState<CommitPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setStep(1);
    setUpload(null);
    setProposal(null);
    setFilePreview(null);
    setCommitPreview(null);
    setError(null);
    setSlug("");
  }

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <nav aria-label="Progress" className="flex items-center gap-3 text-xs">
        {([1, 2, 3, 4] as Step[]).map((s, i) => {
          const isDone = s < step;
          const isActive = s === step;
          return (
            <div key={s} className="flex items-center gap-3">
              <div
                className={`flex items-center gap-2 ${
                  isActive ? "text-hf-text" : isDone ? "text-hf-text-muted" : "text-hf-text-faint"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium border ${
                    isDone
                      ? "bg-hf-green text-white border-hf-green"
                      : isActive
                        ? "bg-hf-yellow text-hf-text border-hf-yellow"
                        : "bg-hf-bg text-hf-text-faint border-hf-border"
                  }`}
                >
                  {isDone ? "✓" : s}
                </span>
                <span className={isActive ? "font-medium" : ""}>{STEP_LABELS[s]}</span>
              </div>
              {i < 3 && <span className="text-hf-text-faint">→</span>}
            </div>
          );
        })}
      </nav>

      {error && (
        <div className="border border-hf-red/30 bg-red-50 text-hf-red px-4 py-3 rounded-md text-sm flex items-start justify-between">
          <div>
            <strong>Lỗi:</strong> {error}
          </div>
          <button
            onClick={() => setError(null)}
            className="text-hf-red hover:text-red-700 ml-4 text-xs"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Step content */}
      {step === 1 && (
        <UploadDropzone
          onUploaded={(result) => {
            setUpload(result);
            setStep(2);
          }}
          onError={setError}
        />
      )}

      {step === 2 && upload && (
        <AIAnalyzingLoader
          upload={upload}
          onDone={(p, preview) => {
            setProposal(p);
            setFilePreview(preview);
            setStep(3);
          }}
          onError={setError}
        />
      )}

      {step === 3 && upload && proposal && (
        <div className="space-y-4">
          {/* File info bar */}
          {filePreview && (
            <div className="bg-hf-bg border border-hf-border rounded-md px-4 py-2.5 text-[13px] text-hf-text-muted">
              <span className="font-medium text-hf-text">{upload.filename}</span>
              <span className="text-hf-text-faint mx-2">•</span>
              {formatCompactNumber(filePreview.rowCount)} dòng × {filePreview.columnCount} cột
              <span className="text-hf-text-faint mx-2">•</span>
              <span className="uppercase">{filePreview.format}</span>
            </div>
          )}

          {/* AI questions banner */}
          {proposal.questions.length > 0 && (
            <div className="border-l-2 border-hf-yellow bg-hf-yellow-50/30 pl-3 py-2 pr-3 rounded-r-md">
              <h3 className="text-xs font-semibold text-hf-text mb-1">
                🤖 Câu hỏi cần xác nhận từ AI
              </h3>
              <ul className="text-[13px] text-hf-text-muted space-y-1 list-disc list-inside">
                {proposal.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}

          <MetadataEditor
            initial={proposal.metadata}
            onChange={(metadata) =>
              setProposal({ ...proposal, metadata })
            }
            slug={slug}
            onSlugChange={setSlug}
          />

          <DictionaryEditor
            entries={proposal.dictionary}
            onChange={(dictionary) =>
              setProposal({ ...proposal, dictionary })
            }
          />

          <div className="flex justify-between items-center pt-2">
            <button
              onClick={reset}
              disabled={submitting}
              className="text-sm text-hf-text-muted hover:text-hf-text hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
            >
              ← Hủy & upload lại
            </button>
            <button
              onClick={async () => {
                if (submitting) return;
                setSubmitting(true);
                setError(null);
                try {
                  const res = await fetch("/api/upload/commit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      fileId: upload.fileId,
                      r2Key: upload.r2Key,
                      metadata: {
                        ...proposal.metadata,
                        format: upload.format,
                        filename: upload.filename,
                        row_count: filePreview?.rowCount,
                        columns_count: filePreview?.columnCount,
                      },
                      column_stats: filePreview?.columnStats,
                      dictionary: proposal.dictionary,
                      custom_slug: slug || undefined,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? "Không thể lưu dataset");
                  setCommitPreview(data);
                  setStep(4);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Lỗi không xác định");
                } finally {
                  setSubmitting(false);
                }
              }}
              disabled={submitting}
              className="bg-hf-text text-hf-bg px-4 py-2 rounded-md text-sm font-medium hover:bg-hf-text-muted transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} aria-hidden />}
              {submitting ? "Đang lưu..." : "Lưu dataset →"}
            </button>
          </div>
        </div>
      )}

      {step === 4 && commitPreview && (
        <CommitPreview preview={commitPreview} onReset={reset} />
      )}
    </div>
  );
}
