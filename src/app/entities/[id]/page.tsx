import Link from "next/link";
import { notFound } from "next/navigation";

interface Entity {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  old_codes: string[];
  region: string | null;
  tags: string[];
}

interface Resource {
  id: number;
  resource_type: string;
  title: string;
  year: number | null;
  structured_data: Record<string, unknown> | null;
  file_url: string | null;
  file_type: string | null;
  file_size_mb: number | null;
  source: string | null;
  description: string | null;
  tags: string[];
  uploaded_by: string;
  uploaded_at: string;
}

async function getEntityData(id: string): Promise<{ entity: Entity; resources: Resource[] } | null> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const res = await fetch(`${base}/api/entities/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

const TYPE_LABELS: Record<string, string> = {
  indicator: "Chỉ số",
  ranking: "Xếp hạng",
  document: "Tài liệu",
  audio: "Ghi âm",
  dataset: "Dataset",
  geo_layer: "Bản đồ",
};

export default async function EntityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getEntityData(id);

  if (!data) notFound();

  const { entity, resources } = data;

  // Nhóm resources theo type
  const grouped = resources.reduce<Record<string, Resource[]>>((acc, r) => {
    const type = r.resource_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(r);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Tỉnh thành
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">
            {entity.entity_name}
          </h1>
          <div className="flex gap-4 mt-2 text-sm text-gray-500">
            <span>{entity.entity_id}</span>
            {entity.region && <span>{entity.region}</span>}
            {entity.old_codes?.length > 0 && (
              <span>Mã cũ: {entity.old_codes.join(", ")}</span>
            )}
          </div>
        </div>
      </header>

      {/* Resources */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {resources.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p>Chưa có tài nguyên cho tỉnh này.</p>
            <Link href="/upload" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
              Upload tài nguyên mới →
            </Link>
          </div>
        )}

        {Object.entries(grouped).map(([type, items]) => (
          <section key={type} className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {TYPE_LABELS[type] || type} ({items.length})
            </h2>
            <div className="space-y-2">
              {items.map((r) => (
                <div
                  key={r.id}
                  className="bg-white rounded-lg border p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{r.title}</h3>
                      <div className="flex gap-3 mt-1 text-sm text-gray-500">
                        {r.year && <span>Năm {r.year}</span>}
                        {r.source && <span>{r.source}</span>}
                        <span>bởi {r.uploaded_by}</span>
                      </div>
                      {r.description && (
                        <p className="text-sm text-gray-600 mt-2">{r.description}</p>
                      )}
                      {r.tags?.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {r.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* File download */}
                    {r.file_url && (
                      <a
                        href={r.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 ml-4 px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition"
                      >
                        {r.file_type?.toUpperCase() || "File"}
                        {r.file_size_mb && (
                          <span className="ml-1 text-blue-400">
                            {r.file_size_mb}MB
                          </span>
                        )}
                      </a>
                    )}
                  </div>

                  {/* Structured data preview */}
                  {r.structured_data && Object.keys(r.structured_data).length > 0 && (
                    <div className="mt-3 bg-gray-50 rounded p-3 text-sm">
                      <table className="w-full">
                        <tbody>
                          {Object.entries(r.structured_data).map(([key, value]) => (
                            <tr key={key} className="border-b border-gray-100 last:border-0">
                              <td className="py-1 pr-4 text-gray-500 font-mono text-xs">{key}</td>
                              <td className="py-1 text-gray-900">{String(value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
