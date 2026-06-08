import Link from "next/link";

interface Province {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  region: string | null;
  tags: string[];
}

async function getProvinces(): Promise<Province[]> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const res = await fetch(`${base}/api/entities`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export default async function Home() {
  const provinces = await getProvinces();

  // Nhóm theo vùng
  const grouped = provinces.reduce<Record<string, Province[]>>((acc, p) => {
    const region = p.region || "Khác";
    if (!acc[region]) acc[region] = [];
    acc[region].push(p);
    return acc;
  }, {});

  const regionOrder = [
    "Đồng bằng sông Hồng",
    "Trung du và miền núi phía Bắc",
    "Bắc Trung Bộ",
    "Nam Trung Bộ",
    "Tây Nguyên",
    "Đông Nam Bộ",
    "Đồng bằng sông Cửu Long",
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">
            34 Tỉnh Thành
          </h1>
          <p className="text-gray-500 mt-1">
            Kho tri thức dữ liệu Việt Nam — VNExpress
          </p>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 flex gap-6 text-sm">
          <Link href="/" className="py-3 border-b-2 border-blue-600 text-blue-600 font-medium">
            Tỉnh thành
          </Link>
          <Link href="/upload" className="py-3 text-gray-500 hover:text-gray-900">
            Upload
          </Link>
          <Link href="/api/dictionary" className="py-3 text-gray-500 hover:text-gray-900">
            Data Dictionary
          </Link>
        </div>
      </nav>

      {/* Province cards grouped by region */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {provinces.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">Chưa có dữ liệu tỉnh thành.</p>
            <p className="text-sm mt-2">Chạy seed script trước, hoặc kiểm tra kết nối Supabase.</p>
          </div>
        )}

        {regionOrder.map((region) => {
          const items = grouped[region];
          if (!items) return null;
          return (
            <section key={region} className="mb-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {region}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {items.map((p) => (
                  <Link
                    key={p.entity_id}
                    href={`/entities/${p.entity_id}`}
                    className="block bg-white rounded-lg border p-4 hover:border-blue-400 hover:shadow-sm transition"
                  >
                    <h3 className="font-medium text-gray-900 text-sm leading-snug">
                      {p.entity_name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">{p.entity_id}</p>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        {/* Regions not in regionOrder */}
        {Object.entries(grouped)
          .filter(([region]) => !regionOrder.includes(region))
          .map(([region, items]) => (
            <section key={region} className="mb-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {region}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {items.map((p) => (
                  <Link
                    key={p.entity_id}
                    href={`/entities/${p.entity_id}`}
                    className="block bg-white rounded-lg border p-4 hover:border-blue-400 hover:shadow-sm transition"
                  >
                    <h3 className="font-medium text-gray-900 text-sm leading-snug">
                      {p.entity_name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">{p.entity_id}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
      </main>
    </div>
  );
}
