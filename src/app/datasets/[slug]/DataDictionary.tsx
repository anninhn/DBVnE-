import type { DataDictionaryEntry, Resource } from "@/lib/types/dataset";

/**
 * Bảng từ điển dữ liệu.
 *
 * 2 chế độ render:
 *  - **Per-resource** (default): khi resource.columns đã được populate (preview
 *    data đã parse), render 1 bảng/resource với các cột thực tế của file đó,
 *    map sang entry dictionary theo column_name.
 *  - **Dictionary-only fallback**: khi không có resource nào có columns (vd:
 *    GeoJSON lớn >10MB bị skip ở withPreviewData) nhưng dictionary có entries,
 *    render tất cả entries dictionary trong 1 bảng duy nhất.
 *
 * Dictionary độc lập với preview data — schema mô tả luôn có, sample rows có
 * thể skip vì lý do performance.
 */
interface DataDictionaryProps {
  resources: Resource[];
  dictionary: DataDictionaryEntry[];
}

export default function DataDictionary({
  resources,
  dictionary,
}: DataDictionaryProps) {
  // Lookup theo column_name (first match wins — duplicate names share 1 row)
  const lookup = new Map<string, DataDictionaryEntry>();
  for (const d of dictionary) {
    if (!lookup.has(d.column_name)) lookup.set(d.column_name, d);
  }

  const resourcesWithColumns = resources.filter(
    (r) => r.columns && r.columns.length > 0,
  );

  // Fallback: không có resource nào có columns → render dictionary trực tiếp.
  // Dictionary là metadata schema (luôn có nếu user điền khi upload), không
  // phụ thuộc việc preview data có parse được hay không.
  if (resourcesWithColumns.length === 0) {
    if (dictionary.length === 0) {
      return (
        <p className="text-sm text-hf-text-muted">
          Chưa có thông tin cột cho dataset này.
        </p>
      );
    }
    return <DictionaryTable entries={dictionary} />;
  }

  return (
    <div className="space-y-6">
      {resourcesWithColumns.map((resource) => (
        <div key={resource.id}>
          <h3 className="text-sm font-semibold text-hf-text mb-2">
            {resource.title}
          </h3>
          <DictionaryTable
            entries={resource.columns!.map((c) => lookup.get(c)).filter((e): e is DataDictionaryEntry => Boolean(e))}
          />
        </div>
      ))}
    </div>
  );
}

/** Bảng dictionary dùng chung cho cả 2 chế độ render. */
function DictionaryTable({ entries }: { entries: DataDictionaryEntry[] }) {
  return (
    <div className="overflow-x-auto border border-hf-border rounded-md">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-hf-bg-subtle border-b border-hf-border">
            <th className="text-left px-3 py-2 font-medium text-hf-text">
              Trường
            </th>
            <th className="text-left px-3 py-2 font-medium text-hf-text">
              Tên hiển thị
            </th>
            <th className="text-left px-3 py-2 font-medium text-hf-text">
              Kiểu
            </th>
            <th className="text-left px-3 py-2 font-medium text-hf-text">
              Đơn vị
            </th>
            <th className="text-left px-3 py-2 font-medium text-hf-text">
              Mô tả
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.column_name}
              className="border-b border-hf-border last:border-0 align-top"
            >
              <td className="px-3 py-2 font-mono text-xs text-hf-text">
                {entry.column_name}
              </td>
              <td className="px-3 py-2 text-hf-text">
                {entry.label_vi ?? (
                  <span className="text-hf-text-faint">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-hf-text-muted">
                {entry.data_type ?? "—"}
              </td>
              <td className="px-3 py-2 text-hf-text-muted">
                {entry.unit ?? "—"}
              </td>
              <td className="px-3 py-2 text-hf-text-muted">
                {entry.description ?? ""}
                {entry.source && (
                  <div className="text-[11px] text-hf-text-faint mt-0.5">
                    nguồn: {entry.source}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
