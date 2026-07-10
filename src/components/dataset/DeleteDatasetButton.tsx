"use client";

import { useState } from "react";
import { Trash2, AlertTriangle } from "lucide-react";

interface Props {
  slug: string;
}

/**
 * Nút xóa dataset — DEV-ONLY (D4).
 *
 * Return null khi NODE_ENV=production → production KHÔNG có delete UI.
 * Local dev: click → modal → type slug để confirm → API call → redirect.
 */
export default function DeleteDatasetButton({ slug }: Props) {
  // Guard: production render nothing
  if (process.env.NODE_ENV === "production") return null;

  const [modalOpen, setModalOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/dataset/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          confirmSlug: confirmInput,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Xóa thất bại");
      }

      // Success — redirect về catalog
      window.location.href = data.redirect ?? "/";
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Lỗi không xác định khi xóa"
      );
      setSubmitting(false);
    }
  }

  function handleClose() {
    setModalOpen(false);
    setConfirmInput("");
    setError(null);
  }

  return (
    <>
      {/* Delete button — red text */}
      <button
        onClick={() => setModalOpen(true)}
        className="px-3.5 py-1 rounded-md border border-hf-red/30 bg-hf-bg text-[13px] font-medium text-hf-red hover:bg-red-50 transition inline-flex items-center gap-1.5"
      >
        <Trash2 className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
        Delete
      </button>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <div
            className="bg-hf-bg border border-hf-border rounded-lg shadow-xl max-w-[440px] w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-hf-text flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-hf-red" strokeWidth={2} aria-hidden />
              Delete dataset permanently
            </h2>

            <p className="text-sm text-hf-text-muted">
              Hành động này không thể hoàn tác. Dataset{" "}
              <code className="font-mono text-hf-text bg-hf-bg-muted px-1.5 py-0.5 rounded">
                {slug}
              </code>{" "}
              sẽ bị xóa khỏi:
            </p>

            <ul className="text-sm text-hf-text-muted space-y-1 ml-4 list-disc">
              <li>Metadata + Data Dictionary</li>
              <li>Attached files</li>
            </ul>

            <div>
              <label className="block text-xs font-medium text-hf-text-muted mb-1.5">
                Gõ slug dataset để xác nhận:
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={slug}
                autoFocus
                className="w-full border border-hf-border rounded-md px-3 py-2 text-sm font-mono focus:border-hf-red focus:ring-2 focus:ring-red-100 focus:outline-none"
              />
            </div>

            {error && (
              <div className="border border-hf-red/30 bg-red-50 text-hf-red px-3 py-2 rounded-md text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-md text-sm font-medium text-hf-text-muted hover:text-hf-text border border-hf-border hover:bg-hf-bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={confirmInput !== slug || submitting}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-hf-red hover:bg-red-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
