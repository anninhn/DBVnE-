import { listDatasets } from "@/lib/datasets/list";
import DatasetExplorer from "@/components/DatasetExplorer";

// Dynamic SSR runtime — fetch metadata.yaml từ GitHub raw mỗi request.
// Không còn PostgreSQL dependency. Cache 60s qua React cache() + GitHub CDN.
export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function Home() {
  const datasets = await listDatasets();
  return (
    <div className="min-h-screen flex flex-col">
      {/* CatalogNav + sidebar + listing đều render trong DatasetExplorer */}
      <main className="flex-1">
        <DatasetExplorer datasets={datasets} />
      </main>
    </div>
  );
}
