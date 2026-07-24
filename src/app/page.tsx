import { listDatasets } from "@/lib/datasets/list";
import DatasetExplorer from "@/components/DatasetExplorer";

// ISR + cross-request cache:
//   - `revalidate: 60` — page regenerate tối đa mỗi 60s
//   - `unstable_cache` trong listDatasets cũng cache 60s với tag "datasets"
//   - Upload/edit/delete gọi `revalidateTag("datasets")` → invalidate ngay
// KHÔNG dùng `force-dynamic` — sẽ override revalidate và tắt ISR.
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
