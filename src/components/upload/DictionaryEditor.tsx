"use client";

import { useEffect, useState } from "react";
import type { DictionaryEntry } from "./UploadWizard";

interface Props {
  entries: DictionaryEntry[];
  onChange: (entries: DictionaryEntry[]) => void;
}

const TYPE_OPTIONS: DictionaryEntry["type"][] = [
  "string",
  "number",
  "date",
  "boolean",
  "category",
];

const DECIMAL_OPTIONS = ["", ".", ","] as const;
const GROUP_OPTIONS = ["", ".", ",", " "] as const;

function labelForDecimal(v: (typeof DECIMAL_OPTIONS)[number]): string {
  if (v === "") return "auto";
  return v;
}

function labelForGroup(v: (typeof GROUP_OPTIONS)[number]): string {
  if (v === "") return "none";
  return v === " " ? "space" : v;
}

export default function DictionaryEditor({ entries, onChange }: Props) {
  const [local, setLocal] = useState(entries);

  useEffect(() => {
    onChange(local);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  function update(idx: number, patch: Partial<DictionaryEntry>) {
    setLocal((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, ...patch } : e))
    );
  }

  function remove(idx: number) {
    setLocal((prev) => prev.filter((_, i) => i !== idx));
  }

  function add() {
    setLocal((prev) => [
      ...prev,
      { column: "new_column", type: "string", unit: "-", description: "" },
    ]);
  }

  return (
    <section className="bg-hf-bg border border-hf-border rounded-md overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 border-b border-hf-border">
        <h2 className="text-sm font-semibold text-hf-text">
          Data Dictionary
          <span className="ml-2 text-xs font-normal text-hf-text-faint">
            {local.length} columns
          </span>
        </h2>
        <span className="bg-hf-yellow-50/60 text-yellow-800 text-[11px] px-2 py-px rounded-full font-medium border border-hf-yellow/30">
          🤖 AI đề xuất
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-hf-bg-muted text-hf-text-muted text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Column</th>
              <th className="text-left px-3 py-2 font-medium w-28">Type</th>
              <th className="text-left px-3 py-2 font-medium w-20">Dec</th>
              <th className="text-left px-3 py-2 font-medium w-20">Group</th>
              <th className="text-left px-3 py-2 font-medium w-32">Unit</th>
              <th className="text-left px-3 py-2 font-medium">Description</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {local.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-hf-text-faint text-xs">
                  Chưa có column nào. Click &quot;Add column&quot; để thêm thủ công.
                </td>
              </tr>
            )}
            {local.map((entry, idx) => {
              const isNumeric = entry.type === "number";
              return (
                <tr key={idx} className="border-t border-hf-border">
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={entry.column}
                      onChange={(e) => update(idx, { column: e.target.value })}
                      className="w-full font-mono text-[13px] bg-transparent border border-transparent hover:border-hf-border focus:border-hf-yellow focus:ring-1 focus:ring-hf-yellow-50 rounded px-1.5 py-1 outline-none"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={entry.type}
                      onChange={(e) =>
                        update(idx, { type: e.target.value as DictionaryEntry["type"] })
                      }
                      className="w-full bg-hf-bg-subtle border border-hf-border focus:border-hf-yellow focus:ring-1 focus:ring-hf-yellow-50 rounded px-1.5 py-1 text-[13px] outline-none"
                    >
                      {TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={entry.decimal_char ?? ""}
                      onChange={(e) =>
                        update(idx, {
                          decimal_char: (e.target.value || undefined) as DictionaryEntry["decimal_char"],
                        })
                      }
                      disabled={!isNumeric}
                      title={isNumeric ? "Ký tự thập phân (Frictionless schema)" : "Chỉ áp dụng cho number"}
                      className="w-full bg-hf-bg-subtle border border-hf-border focus:border-hf-yellow focus:ring-1 focus:ring-hf-yellow-50 rounded px-1.5 py-1 text-[13px] outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {DECIMAL_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {labelForDecimal(v)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={entry.group_char ?? ""}
                      onChange={(e) =>
                        update(idx, {
                          group_char: (e.target.value || undefined) as DictionaryEntry["group_char"],
                        })
                      }
                      disabled={!isNumeric}
                      title={isNumeric ? "Ký tự nhóm hàng nghìn (Frictionless schema)" : "Chỉ áp dụng cho number"}
                      className="w-full bg-hf-bg-subtle border border-hf-border focus:border-hf-yellow focus:ring-1 focus:ring-hf-yellow-50 rounded px-1.5 py-1 text-[13px] outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {GROUP_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {labelForGroup(v)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={entry.unit}
                      onChange={(e) => update(idx, { unit: e.target.value })}
                      placeholder="vd: tỷ VND, %, năm"
                      className="w-full bg-transparent border border-transparent hover:border-hf-border focus:border-hf-yellow focus:ring-1 focus:ring-hf-yellow-50 rounded px-1.5 py-1 text-[13px] outline-none"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={entry.description}
                      onChange={(e) => update(idx, { description: e.target.value })}
                      placeholder="Ý nghĩa cột..."
                      className="w-full bg-transparent border border-transparent hover:border-hf-border focus:border-hf-yellow focus:ring-1 focus:ring-hf-yellow-50 rounded px-1.5 py-1 text-[13px] outline-none"
                    />
                  </td>
                  <td className="px-2 text-center">
                    <button
                      onClick={() => remove(idx)}
                      className="text-hf-text-faint hover:text-hf-red text-sm"
                      aria-label={`Xóa column ${entry.column}`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="px-5 py-2.5 border-t border-hf-border bg-hf-bg-subtle">
        <button
          onClick={add}
          className="text-xs text-hf-link hover:underline"
        >
          + Add column
        </button>
      </footer>
    </section>
  );
}
