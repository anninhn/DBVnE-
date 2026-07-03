"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { CommitPreview } from "./UploadWizard";

interface Props {
  preview: CommitPreview;
  onReset: () => void;
}

type Tab = "yaml" | "markdown";

export default function CommitPreview({ preview, onReset }: Props) {
  const [tab, setTab] = useState<Tab>("yaml");

  return (
    <div className="space-y-4">
      {/* Notice banner */}
      <div className="border border-hf-yellow/40 bg-hf-yellow-50/40 text-hf-text px-4 py-3 rounded-md text-sm">
        <strong>⚠️ Preview-only.</strong> {preview.message}{" "}
        <span className="text-hf-text-muted">
          File đã lưu ở R2 <code className="font-mono text-xs">staging/</code>{" "}
          (auto-clean sau 24h).
        </span>
      </div>

      {/* Slug info */}
      <div className="bg-hf-bg border border-hf-border rounded-md px-4 py-2.5 text-[13px]">
        <span className="text-hf-text-muted">Dataset slug:</span>{" "}
        <code className="font-mono text-hf-text font-medium">{preview.slug}</code>
      </div>

      {/* Tab panes */}
      <div className="bg-hf-bg border border-hf-border rounded-md overflow-hidden">
        <div className="flex border-b border-hf-border">
          <button
            onClick={() => setTab("yaml")}
            className={`px-4 py-2 text-xs font-medium border-r border-hf-border ${
              tab === "yaml"
                ? "bg-hf-bg-muted text-hf-text"
                : "bg-hf-bg text-hf-text-muted hover:text-hf-text"
            }`}
          >
            <code className="font-mono">metadata.yaml</code>
          </button>
          <button
            onClick={() => setTab("markdown")}
            className={`px-4 py-2 text-xs font-medium ${
              tab === "markdown"
                ? "bg-hf-bg-muted text-hf-text"
                : "bg-hf-bg text-hf-text-muted hover:text-hf-text"
            }`}
          >
            <code className="font-mono">dictionary.md</code>
          </button>
        </div>

        <div className="p-4 max-h-[600px] overflow-auto">
          {tab === "yaml" ? (
            <pre className="font-mono text-[13px] text-hf-text whitespace-pre-wrap break-words">
              {preview.yamlPreview}
            </pre>
          ) : (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{preview.markdownPreview}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex justify-between items-center pt-2">
        <a
          href="https://dash.cloudflare.com"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-hf-link hover:underline"
        >
          → Xem file trên Cloudflare R2 dashboard
        </a>
        <button
          onClick={onReset}
          className="bg-hf-text text-hf-bg px-4 py-2 rounded-md text-sm font-medium hover:bg-hf-text-muted transition"
        >
          Upload dataset khác
        </button>
      </div>
    </div>
  );
}
