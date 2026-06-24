import type { DataDictionaryEntry, Resource } from "@/lib/types/dataset";

/**
 * Bảng từ điển dữ liệu, nhóm theo resource.
 * spec: specs/2026-06-24-data-dictionary-table/
 *
 * Dictionary row mô tả một column_name — cùng column có thể xuất hiện ở nhiều
 * resource (vd: entity_id). Render 1 bảng/resource, lặp dict row khi cần.
 * Map resource→dictionary làm ở render time, không thêm resource_id vào DB.
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

  // Chỉ resource nào có columns mới hiển thị bảng
  const resourcesWithColumns = resources.filter(
    (r) => r.columns && r.columns.length > 0,
  );

  if (resourcesWithColumns.length === 0) {
    return (
      <p className="text-sm text-hf-text-muted">
        Chưa có thông tin cột cho dataset này.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {resourcesWithColumns.map((resource) => (
        <div key={resource.id}>
          <h3 className="text-sm font-semibold text-hf-text mb-2">
            {resource.title}
          </h3>
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
                {resource.columns!.map((colName) => {
                  const entry = lookup.get(colName);
                  return (
                    <tr
                      key={colName}
                      className="border-b border-hf-border last:border-0 align-top"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-hf-text">
                        {colName}
                      </td>
                      <td className="px-3 py-2 text-hf-text">
                        {entry?.label_vi ?? (
                          <span className="text-hf-text-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-hf-text-muted">
                        {entry?.data_type ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-hf-text-muted">
                        {entry?.unit ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-hf-text-muted">
                        {entry?.description ?? ""}
                        {entry?.source && (
                          <div className="text-[11px] text-hf-text-faint mt-0.5">
                            nguồn: {entry.source}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
