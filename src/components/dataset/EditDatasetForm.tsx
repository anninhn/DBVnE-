"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MetadataEditor from "@/components/upload/MetadataEditor";
import DictionaryEditor from "@/components/upload/DictionaryEditor";
import CommitPreview from "@/components/upload/CommitPreview";
import type { CommitPreview as CommitPreviewData } from "@/components/upload/UploadWizard";
import type { DictionaryEntry } from "@/components/upload/UploadWizard";
import {
  renderMetadataYaml,
  renderDictionaryMarkdown,
  type MetadataForRender,
} from "@/lib/dataset-render";
import type { MetadataYaml } from "@/lib/datasets/types";
import type { DataDictionaryEntry } from "@/lib/types/dataset";

interface Props {
  initialSlug: string;
  initialMetadata: MetadataYaml;
  initialDictionary: DataDictionaryEntry[];
}

// ─── Type converters ──────────────────────────────────────────────────────

/** MetadataYaml → MetadataEditor input format */
function toEditorMetadata(meta: MetadataYaml): {
  title: string;
  description: string;
  category: string;
  tags: string[];
  source: string;
  source_url: string;
  confidence: "high" | "medium" | "low";
} {
  const sourceObj =
    typeof meta.source === "object" && meta.source !== null
      ? meta.source
      : { name: typeof meta.source === "string" ? meta.source : "", url: "" };

  return {
    title: meta.title ?? "",
    description: meta.description ?? "",
    category: (meta.category as string) ?? "khac",
    tags: meta.tags ?? [],
    source: sourceObj.name ?? "",
    source_url: sourceObj.url ?? "",
    confidence: meta.confidence ?? "medium",
  };
}

/** DataDictionaryEntry[] → DictionaryEditor input format */
function toEditorDictionary(
  dict: DataDictionaryEntry[]
): DictionaryEntry[] {
  return dict.map((d) => ({
    column: d.column_name,
    type: (mapDataTypeToEditor(d.data_type) as DictionaryEntry["type"]),
    unit: d.unit ?? "-",
    description: d.description ?? "",
    // Preserve Frictionless schema fields khi edit
    decimal_char: d.decimal_char,
    group_char: d.group_char,
  }));
}

function mapDataTypeToEditor(
  dt: DataDictionaryEntry["data_type"]
): string {
  switch (dt) {
    case "int":
    case "float":
      return "number";
    case "date":
      return "date";
    default:
      return "string";
  }
}

// ─── Component ────────────────────────────────────────────────────────────

export default function EditDatasetForm({
  initialSlug,
  initialMetadata,
  initialDictionary,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"review" | "preview">("review");

  // Metadata state — editable qua MetadataEditor
  const [metadata, setMetadata] = useState(() =>
    toEditorMetadata(initialMetadata)
  );

  // Dictionary state — editable qua DictionaryEditor
  const [dictionary, setDictionary] = useState<DictionaryEntry[]>(() =>
    toEditorDictionary(initialDictionary)
  );

  // Commit preview state
  const [commitPreview, setCommitPreview] = useState<CommitPreviewData | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handlePreviewCommit() {
    setError(null);

    // Render YAML — giữ nguyên files[] từ metadata cũ (D3: edit metadata only)
    const yamlContent = renderMetadataYaml(
      metadata as MetadataForRender,
      initialSlug,
      initialMetadata.files,
      {
        format: typeof initialMetadata.format === "string"
          ? initialMetadata.format
          : "csv",
        uploaded_by: initialMetadata.uploaded_by,
        uploaded_at: initialMetadata.uploaded_at,
        row_count: initialMetadata.row_count,
        columns_count: initialMetadata.columns_count,
        // Spec 2026-07-24-article-linking: truyền articles để giữ khi edit metadata.
        // Nếu không truyền → renderMetadataYaml build YAML mới không có articles → data loss.
        articles: initialMetadata.articles,
      }
    );
    const markdownContent = renderDictionaryMarkdown(dictionary);

    setCommitPreview({
      slug: initialSlug,
      yamlPreview: yamlContent,
      markdownPreview: markdownContent,
      committed: false,
      message: `Sẵn sàng lưu cập nhật cho dataset "${initialSlug}"`,
    });
    setStep("preview");
  }

  async function handleCommit() {
    if (!commitPreview) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/dataset/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: initialSlug,
          metadataYaml: commitPreview.yamlPreview,
          dictionaryMarkdown: commitPreview.markdownPreview,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Không thể lưu cập nhật");
      }

      setCommitPreview({
        ...commitPreview,
        committed: true,
        message: `Đã lưu cập nhật cho dataset "${initialSlug}".`,
        commitSha: data.commitSha,
        commitUrl: data.commitUrl,
      });

      // Redirect về detail page
      router.push(`/datasets/${initialSlug}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Lỗi không xác định khi lưu"
      );
      // Giữ ở step preview để retry
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <nav aria-label="Progress" className="flex items-center gap-3 text-xs">
        {(["review", "preview"] as const).map((s, i) => {
          const isActive = s === step;
          const isDone = s === "review" && step === "preview";
          return (
            <div key={s} className="flex items-center gap-3">
              <div
                className={`flex items-center gap-2 ${
                  isActive
                    ? "text-hf-text"
                    : isDone
                      ? "text-hf-text-muted"
                      : "text-hf-text-faint"
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
                  {isDone ? "✓" : i + 1}
                </span>
                <span className={isActive ? "font-medium" : ""}>
                  {s === "review" ? "Review metadata" : "Preview"}
                </span>
              </div>
              {i < 1 && <span className="text-hf-text-faint">→</span>}
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

      {/* Step: Review metadata */}
      {step === "review" && (
        <div className="space-y-4">
          {/* File info bar — D3: edit metadata only, không replace file */}
          {initialMetadata.files && initialMetadata.files.length > 0 && (
            <div className="bg-hf-yellow-50/30 border border-hf-yellow/30 rounded-md px-4 py-2.5 text-[13px] text-hf-text-muted">
              <strong className="text-hf-text">Editing metadata only.</strong>{" "}
              Attached files will not be changed.{" "}
              {initialMetadata.files.length} file(s):{" "}
              {initialMetadata.files
                .map((f) => f.filename ?? f.r2_key)
                .join(", ")}
            </div>
          )}

          <MetadataEditor
            initial={metadata}
            onChange={setMetadata}
            slug={initialSlug}
            onSlugChange={() => {
              /* no-op: slug cố định trong edit mode (D3) */
            }}
            slugReadOnly
          />

          <DictionaryEditor
            entries={dictionary}
            onChange={setDictionary}
          />

          <div className="flex justify-between items-center pt-2">
            <button
              onClick={() => router.back()}
              className="text-sm text-hf-text-muted hover:text-hf-text hover:underline"
            >
              ← Cancel
            </button>
            <button
              onClick={handlePreviewCommit}
              className="bg-hf-text text-hf-bg px-4 py-2 rounded-md text-sm font-medium hover:bg-hf-text-muted transition"
            >
              Preview →
            </button>
          </div>
        </div>
      )}

      {/* Step: Preview commit */}
      {step === "preview" && commitPreview && (
        <div className="space-y-4">
          <CommitPreview
            preview={commitPreview}
            onReset={() => setStep("review")}
          />

          {/* Commit button — chỉ hiện khi chưa committed */}
          {!commitPreview.committed && (
            <div className="flex justify-end">
              <button
                onClick={handleCommit}
                disabled={submitting}
                className="bg-hf-text text-hf-bg px-4 py-2 rounded-md text-sm font-medium hover:bg-hf-text-muted transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Saving..." : "Save changes →"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
