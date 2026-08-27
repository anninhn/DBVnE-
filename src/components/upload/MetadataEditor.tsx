"use client";

import { useEffect, useState } from "react";
import type { AIProposal } from "./UploadWizard";
import { slugify, isValidSlug } from "@/lib/slugify";
import { ALL_CATEGORIES, CATEGORY_LABELS } from "@/lib/types/dataset";

interface Props {
  initial: AIProposal["metadata"];
  onChange: (metadata: AIProposal["metadata"]) => void;
  /** Slug state — lifted lên UploadWizard để pass vào commit API */
  slug: string;
  onSlugChange: (slug: string) => void;
  /**
   * Read-only mode — used trong EditDatasetForm (D3: slug cố định sau upload).
   * Khi true: render slug dạng info box, không phải input field.
   */
  slugReadOnly?: boolean;
}

// Sinh từ CATEGORY_LABELS — nguồn sự thật duy nhất (src/lib/types/dataset.ts).
// Trước đây hardcode 9 giá trị lệch với filter sidebar 6 giá trị → 8/17 dataset
// không bao giờ hiện khi lọc Category.
const CATEGORIES = ALL_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));

const CONFIDENCE_STYLES = {
  high: "bg-blue-100 text-blue-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-red-100 text-red-800",
};

const CONFIDENCE_LABELS = {
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
};

export default function MetadataEditor({ initial, onChange, slug, onSlugChange, slugReadOnly }: Props) {
  const [value, setValue] = useState(initial);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagsLoaded, setTagsLoaded] = useState(false);

  /**
   * slugTouched — true khi user đã chỉnh slug input thủ công.
   * Khi chưa touched: auto-update slug theo title (live preview).
   * Khi touched: slug cố định, không còn follow title.
   *
   * Dùng state (không phải ref) để React biết khi render indicator
   * "(đã chỉnh thủ công)" trong URL preview.
   */
  const [slugTouched, setSlugTouched] = useState(false);

  // Fetch tags từ DB
  useEffect(() => {
    fetch("/api/tags")
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((data) => {
        setTags(data.tags ?? []);
        setTagsLoaded(true);
      })
      .catch(() => setTagsLoaded(true));
  }, []);

  // Auto-fill slug từ title — chỉ khi user chưa chỉnh slug thủ công VÀ không phải read-only mode
  useEffect(() => {
    if (!slugReadOnly && !slugTouched) {
      onSlugChange(slugify(value.title));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.title]);

  // Sync metadata up
  useEffect(() => {
    onChange(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function addTag(tag: string) {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!clean) return;
    if (value.tags.includes(clean)) return;
    setValue({ ...value, tags: [...value.tags, clean] });
    setTagInput("");
  }

  function removeTag(tag: string) {
    setValue({ ...value, tags: value.tags.filter((t) => t !== tag) });
  }

  const suggestions = tags.filter((t) => !value.tags.includes(t) && (!tagInput || t.includes(tagInput.toLowerCase()))).slice(0, 8);

  return (
    <section className="bg-hf-bg border border-hf-border rounded-md p-5">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-hf-text">Metadata</h2>
        <div className="flex items-center gap-2">
          <span className="bg-hf-yellow-50/60 text-yellow-800 text-[11px] px-2 py-px rounded-full font-medium border border-hf-yellow/30">
            🤖 AI đề xuất
          </span>
          <span
            className={`text-[11px] px-2 py-px rounded-full font-medium ${
              CONFIDENCE_STYLES[value.confidence]
            }`}
          >
            Độ tin cậy: {CONFIDENCE_LABELS[value.confidence]}
          </span>
        </div>
      </header>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-hf-text-muted mb-1">
            Tiêu đề <span className="text-hf-red">*</span>
          </label>
          <input
            type="text"
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
            className="w-full border border-hf-border rounded-md px-3 py-2 text-sm focus:border-hf-yellow focus:ring-2 focus:ring-hf-yellow-50 focus:outline-none"
          />
        </div>

        {/* Slug — auto từ title (upload) hoặc read-only (edit D3) */}
        <div>
          <label className="block text-xs font-medium text-hf-text-muted mb-1">
            Slug <span className="text-hf-text-faint font-normal">(URL path)</span>
          </label>
          {slugReadOnly ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-hf-text-faint shrink-0">demo /</span>
              <code className="flex-1 font-mono text-sm text-hf-text bg-hf-bg-muted border border-hf-border rounded-md px-3 py-2">
                {slug}
              </code>
              <span className="text-[11px] text-hf-text-faint shrink-0">
                🔒 Không đổi được (D3)
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-hf-text-faint shrink-0">demo /</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    onSlugChange(e.target.value);
                  }}
                  placeholder="tu-dong-sinh-tu-tieu-de"
                  className={`flex-1 border rounded-md px-3 py-2 text-sm font-mono focus:outline-none ${
                    isValidSlug(slug)
                      ? "border-hf-border focus:border-hf-yellow focus:ring-2 focus:ring-hf-yellow-50"
                      : "border-hf-red/50 focus:border-hf-red focus:ring-2 focus:ring-red-50"
                  }`}
                />
              </div>
              {slug && !isValidSlug(slug) && (
                <p className="text-[11px] text-hf-red mt-1">
                  Chỉ cho phép chữ thường [a-z], số [0-9], dấu gạch (-). Tối đa 60 ký tự.
                </p>
              )}
              {slug && isValidSlug(slug) && (
                <p className="text-[11px] text-hf-text-faint mt-1">
                  URL cuối cùng: <code className="text-hf-text">/datasets/{slug}</code>
                  {slugTouched && (
                    <span className="ml-2 text-hf-text-faint">(đã chỉnh thủ công)</span>
                  )}
                </p>
              )}
            </>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-hf-text-muted mb-1">
            Mô tả <span className="text-hf-red">*</span>
          </label>
          <textarea
            value={value.description}
            onChange={(e) => setValue({ ...value, description: e.target.value })}
            rows={3}
            className="w-full border border-hf-border rounded-md px-3 py-2 text-sm focus:border-hf-yellow focus:ring-2 focus:ring-hf-yellow-50 focus:outline-none resize-y"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs font-medium text-hf-text-muted mb-1">
            Lĩnh vực
          </label>
          <select
            value={value.category}
            onChange={(e) => setValue({ ...value, category: e.target.value })}
            className="w-full border border-hf-border rounded-md px-3 py-2 text-sm bg-hf-bg focus:border-hf-yellow focus:ring-2 focus:ring-hf-yellow-50 focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label} ({c.value})
              </option>
            ))}
          </select>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-medium text-hf-text-muted mb-1">
            Tags{" "}
            <span className="text-hf-text-faint font-normal">
              ({tagsLoaded ? `${tags.length} có sẵn` : "đang tải..."})
            </span>
          </label>

          {/* Selected tags */}
          {value.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {value.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 bg-hf-bg-muted text-hf-text text-xs px-2 py-0.5 rounded-full"
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="text-hf-text-faint hover:text-hf-red"
                    aria-label={`Xóa ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Tag input + suggestions */}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
            placeholder="Gõ tag + Enter, hoặc click gợi ý bên dưới"
            className="w-full border border-hf-border rounded-md px-3 py-2 text-sm focus:border-hf-yellow focus:ring-2 focus:ring-hf-yellow-50 focus:outline-none"
          />

          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {suggestions.map((tag) => (
                <button
                  key={tag}
                  onClick={() => addTag(tag)}
                  className="text-xs text-hf-link hover:underline bg-hf-bg-subtle hover:bg-hf-yellow-50/40 px-2 py-0.5 rounded-full border border-hf-border"
                >
                  + {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Source + URL */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-hf-text-muted mb-1">
              Nguồn
            </label>
            <input
              type="text"
              value={value.source}
              onChange={(e) => setValue({ ...value, source: e.target.value })}
              placeholder="vd: Tổng cục Thống kê (GSO)"
              className="w-full border border-hf-border rounded-md px-3 py-2 text-sm focus:border-hf-yellow focus:ring-2 focus:ring-hf-yellow-50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-hf-text-muted mb-1">
              URL nguồn
            </label>
            <input
              type="url"
              value={value.source_url}
              onChange={(e) => setValue({ ...value, source_url: e.target.value })}
              placeholder="https://..."
              className="w-full border border-hf-border rounded-md px-3 py-2 text-sm focus:border-hf-yellow focus:ring-2 focus:ring-hf-yellow-50 focus:outline-none"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
