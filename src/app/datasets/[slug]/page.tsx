import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDatasetBySlug } from "@/lib/datasets/read";
import TabSwitcher from "./TabSwitcher";
import DatasetViewer from "./DatasetViewer";
import MetadataSidebar from "./MetadataSidebar";
import Markdown from "./Markdown";
import DataDictionary from "./DataDictionary";

// Dynamic SSR runtime — tránh Vercel cache 404 khi dataset chưa tồn tại
// (cache layer fetch vẫn 60s qua `next: { revalidate: 60 }`).
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const dataset = await getDatasetBySlug(slug);
  if (!dataset) return { title: "Không tìm thấy dataset" };
  return { title: `${dataset.title} — VNExpress Data Platform` };
}

function fileIcon(type?: string): string {
  switch (type) {
    case "csv":
    case "xlsx":
      return "📊";
    case "pdf":
      return "📄";
    case "mp3":
      return "🎵";
    case "geojson":
      return "🗺️";
    case "json":
      return "🧩";
    default:
      return "📁";
  }
}

export default async function DatasetPage({ params }: PageProps) {
  const { slug } = await params;
  const dataset = await getDatasetBySlug(slug);
  if (!dataset) notFound();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav — đồng bộ với listing */}
      <nav className="bg-hf-bg border-b border-hf-border h-[52px] px-4 flex items-center gap-6 sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2 font-bold text-[15px] text-hf-text">
          <span className="text-[22px]">🤗</span>
          <span>VNExpress Data</span>
        </Link>
        <div className="flex gap-5 flex-1 text-sm">
          <Link href="/" className="font-semibold text-hf-text">Datasets</Link>
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

      <div className="max-w-[1280px] mx-auto bg-hf-bg w-full flex-1">
        {/* Detail header — org/name + actions + metadata pills */}
        <div className="px-6 py-4 border-b border-hf-border">
          <div className="text-xs text-hf-text-faint mb-2">
            Datasets / {dataset.uploaded_by.toLowerCase()} / {dataset.slug}
          </div>
          <h1 className="text-[22px] font-semibold text-hf-text flex items-center gap-4">
            <span>
              <span className="text-hf-text-muted font-normal">{dataset.uploaded_by.toLowerCase()} /</span>{" "}
              {dataset.slug}
            </span>
            <span className="flex gap-2 ml-auto">
              <button className="px-3.5 py-1 rounded-md border border-hf-border-strong bg-hf-bg text-[13px] font-medium text-hf-text hover:bg-hf-bg-muted">
                ★ {dataset.likes}
              </button>
              <button className="px-3.5 py-1 rounded-md border border-hf-border-strong bg-hf-bg text-[13px] font-medium text-hf-text hover:bg-hf-bg-muted">
                + Follow
              </button>
            </span>
          </h1>

          {/* Metadata pills */}
          <div className="flex flex-wrap gap-4 mt-3 text-[13px]">
            <PillGroup label="Modalities:"><Pill>Tabular</Pill></PillGroup>
            <PillGroup label="Formats:"><Pill>csv</Pill></PillGroup>
            <PillGroup label="Size:">
              <Pill>{dataset.row_count.toLocaleString("vi-VN")} rows</Pill>
            </PillGroup>
            <PillGroup label="Library:">
              <Pill>Datasets</Pill>
              <Pill>pandas</Pill>
            </PillGroup>
            <PillGroup label="License:"><Pill>{dataset.license}</Pill></PillGroup>
          </div>
        </div>

        {/* Tabs */}
        <TabSwitcher
          tabs={[
            { key: "card", label: "Dataset card" },
            { key: "files", label: "Files and versions" },
            { key: "community", label: "Community" },
          ]}
        >
          {/* ── Dataset card tab (viewer + readme) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px]">
            <div className="p-6 border-r border-hf-border min-w-0">
              <DatasetViewer dataset={dataset} />

              {/* README */}
              <div className="mt-6">
                <h2 className="text-lg font-semibold text-hf-text mt-5 mb-2 pb-1.5 border-b border-hf-border">
                  {dataset.title}
                </h2>
                <Markdown>{dataset.description}</Markdown>
                <p className="mb-2.5 text-hf-text leading-relaxed">
                  <strong>Nguồn:</strong> {dataset.source}
                </p>
                {dataset.resources.length > 0 && dataset.data_dictionary.length > 0 && (
                  <div className="mt-6">
                    <h2 className="text-lg font-semibold text-hf-text mt-5 mb-2 pb-1.5 border-b border-hf-border">
                      Từ điển dữ liệu
                    </h2>
                    <DataDictionary
                      resources={dataset.resources}
                      dictionary={dataset.data_dictionary}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <aside className="p-6">
              <MetadataSidebar dataset={dataset} />
            </aside>
          </div>

          {/* ── Files tab ── */}
          <div className="p-6">
            <table className="w-full border-collapse text-[13px] font-mono border-t border-hf-border">
              <thead>
                <tr>
                  {["filename", "size", "rows", "updated", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 pt-2.5 pb-2 bg-hf-bg-subtle border-b border-hf-border font-semibold font-sans text-hf-text"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataset.resources.map((r) => (
                  <tr key={r.id} className="border-b border-hf-border last:border-0">
                    <td className="px-3 py-1.5">
                      {fileIcon(r.file_type)} {r.title.toLowerCase().replace(/\s+/g, "_")}.{r.file_type ?? "csv"}
                    </td>
                    <td className="px-3 py-1.5 text-right">{r.file_size_mb} MB</td>
                    <td className="px-3 py-1.5 text-right">
                      {r.structured_data?.length.toLocaleString("vi-VN") ?? "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      {new Date(r.uploaded_at).toLocaleDateString("vi-VN", { month: "short", day: "numeric" })}
                    </td>
                    <td className="px-3 py-1.5">
                      <a href={r.file_url ?? "#"} className="text-hf-link hover:underline">
                        download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Community tab ── */}
          <div className="p-6 text-center text-hf-text-muted py-24">
            Chưa có thảo luận. Hãy là người đầu tiên bình luận.
          </div>
        </TabSwitcher>
      </div>
    </div>
  );
}

function PillGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1 items-center">
      <span className="text-hf-text-faint text-xs">{label}</span>
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-hf-bg-muted px-2.5 py-0.5 rounded-full text-xs text-hf-text font-medium">
      {children}
    </span>
  );
}
