import { notFound } from "next/navigation";
import CatalogNav from "@/components/CatalogNav";
import { loadChart } from "@/lib/insight/mcp/results-store";
import ChartEmbed from "./ChartEmbed";

export const dynamic = "force-dynamic";

/**
 * Trang biểu đồ cho kết quả tool MCP — mọi client (Claude, ChatGPT, Cursor, VS Code…) chỉ cần đưa link này.
 * Spec Vega-Lite do code dựng từ chính số trong kết quả tool (src/lib/insight/mcp/chart.ts); trang chỉ vẽ lại.
 */
export default async function ChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const spec = await loadChart(id);
  if (!spec) notFound();
  return (
    <>
      <CatalogNav />
      <main className="flex-1 px-4 py-8">
        <div className="max-w-3xl mx-auto bg-hf-bg border border-hf-border rounded-lg p-6">
          <ChartEmbed spec={spec} />
          <p className="text-xs text-hf-text-muted mt-4">
            Biểu đồ do code của Kho dữ liệu VnExpress dựng từ chính các số trong kết quả tra cứu — không vẽ tay.
          </p>
        </div>
      </main>
    </>
  );
}
