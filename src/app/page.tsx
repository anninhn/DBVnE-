import { listDatasets } from "@/lib/data/datasets";
import DatasetExplorer from "@/components/DatasetExplorer";

// Render per-request, not at build time. The listing reads from Supabase,
// so prerendering would (a) fail without env vars at build time and
// (b) bake a stale dataset list into the deploy. See F1 deploy fix.
export const dynamic = "force-dynamic";

export default async function Home() {
  const datasets = await listDatasets();
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav — HF clone */}
      <nav className="bg-hf-bg border-b border-hf-border h-[52px] px-4 flex items-center gap-6 sticky top-0 z-50">
        <div className="flex items-center gap-2 font-bold text-[15px] text-hf-text">
          <span className="text-[22px]">🤗</span>
          <span>VNExpress Data</span>
        </div>
        <div className="flex gap-5 flex-1 text-sm">
          <span className="font-semibold text-hf-text">Datasets</span>
          <span className="text-hf-text-muted hover:text-hf-text cursor-pointer">Spaces</span>
          <span className="text-hf-text-muted hover:text-hf-text cursor-pointer">Tasks</span>
          <span className="text-hf-text-muted hover:text-hf-text cursor-pointer">Community</span>
        </div>
        <input
          type="text"
          placeholder="Search VNExpress data…"
          className="bg-hf-bg-muted border border-hf-border rounded-md px-3 py-1.5 text-[13px] w-[200px] text-hf-text-muted"
        />
      </nav>

      <main className="flex-1">
        <DatasetExplorer datasets={datasets} />
      </main>
    </div>
  );
}
