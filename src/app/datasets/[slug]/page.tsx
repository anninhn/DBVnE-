import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Star, Pencil, Bookmark, Download } from "lucide-react";
import { getDatasetBySlug, withPreviewData } from "@/lib/datasets/read";
import { formatCompactNumber } from "@/lib/format";
import { lookupDisplayName } from "@/lib/auth";
import DeleteDatasetButton from "@/components/dataset/DeleteDatasetButton";
import CatalogNav from "@/components/CatalogNav";
import TabSwitcher from "./TabSwitcher";
import DatasetCardTabs from "./DatasetCardTabs";
import MetadataSidebar from "./MetadataSidebar";
import Markdown from "./Markdown";
import DataDictionary from "./DataDictionary";
import FilesTabContent from "./FilesTabContent";

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
  return { title: `${dataset.title} — VnExpress Data Platform` };
}

export default async function DatasetPage({ params }: PageProps) {
  const { slug } = await params;
  const dataset = await getDatasetBySlug(slug);
  if (!dataset) notFound();

  // Populate structured_data cho resource CSV đầu tiên → DatasetViewer render
  // table + histogram ở tab "Dataset card" (SSR, không flicker client fetch).
  await withPreviewData(dataset);

  // Resolve displayName cho header (đồng bộ với sidebar ActorRow).
  const ownerDisplay = await lookupDisplayName(dataset.uploaded_by);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav — shared component, không có search input trên detail (D7) */}
      <CatalogNav />

      <div className="max-w-[1280px] mx-auto bg-hf-bg w-full flex-1">
        {/* Detail header — org/name + actions + metadata pills */}
        <div className="px-6 py-4 border-b border-hf-border">
          <div className="text-xs text-hf-text-faint mb-2">
            Datasets / {ownerDisplay} / {dataset.slug}
          </div>
          <h1 className="text-[22px] font-semibold text-hf-text flex items-center gap-4">
            <span className="min-w-0">{dataset.title}</span>
            <span className="flex gap-2 ml-auto">
              <button className="px-3.5 py-1 rounded-md border border-hf-border-strong bg-hf-bg text-[13px] font-medium text-hf-text hover:bg-hf-bg-muted inline-flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
                {dataset.likes}
              </button>
              <button className="px-3.5 py-1 rounded-md border border-hf-border-strong bg-hf-bg text-[13px] font-medium text-hf-text hover:bg-hf-bg-muted inline-flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
                Follow
              </button>
              {dataset.resources[0]?.file_url && (
                <a
                  href={`/api/dataset/download?slug=${encodeURIComponent(slug)}&resourceId=${dataset.resources[0].id}`}
                  className="px-3.5 py-1 rounded-md border border-hf-border-strong bg-hf-bg text-[13px] font-medium text-hf-text hover:bg-hf-bg-muted transition inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
                  Download
                </a>
              )}
              <Link
                href={`/datasets/${slug}/edit`}
                className="px-3.5 py-1 rounded-md border border-hf-border-strong bg-hf-bg text-[13px] font-medium text-hf-text hover:bg-hf-bg-muted transition inline-flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
                Edit
              </Link>
              <DeleteDatasetButton slug={slug} />
            </span>
          </h1>

          {/* Metadata pills */}
          <div className="flex flex-wrap gap-4 mt-3 text-[13px]">
            <PillGroup label="Modalities:">
              <Pill>{dataset.feature_count != null ? "Geospatial" : "Tabular"}</Pill>
            </PillGroup>
            <PillGroup label="Formats:">
              {Array.from(
                new Set(
                  dataset.resources
                    .map((r) => r.file_type)
                    .filter((t): t is NonNullable<typeof t> => Boolean(t))
                ),
              ).map((ft) => (
                <Pill key={ft}>{ft}</Pill>
              ))}
            </PillGroup>
            <PillGroup label="Size:">
              <Pill>
                {dataset.feature_count != null
                  ? `${formatCompactNumber(dataset.feature_count)} features${dataset.geometry_type ? ` • ${dataset.geometry_type}` : ""}`
                  : dataset.row_count > 0
                    ? `${formatCompactNumber(dataset.row_count)} rows`
                    : "—"}
              </Pill>
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
              <DatasetCardTabs dataset={dataset} />

              {/* README */}
              <div className="mt-6">
                <h2 className="text-lg font-semibold text-hf-text mt-5 mb-2 pb-1.5 border-b border-hf-border">
                  {dataset.title}
                </h2>
                <Markdown>{dataset.description}</Markdown>
                <p className="mb-2.5 text-hf-text leading-relaxed">
                  <strong>Nguồn:</strong>{" "}
                  {dataset.source_url ? (
                    <a
                      href={dataset.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-hf-link hover:underline"
                    >
                      {dataset.source}
                    </a>
                  ) : (
                    dataset.source
                  )}
                </p>
                {dataset.resources.length > 0 && dataset.data_dictionary.length > 0 && (
                  <div className="mt-6">
                    <h2 className="text-lg font-semibold text-hf-text mt-5 mb-2 pb-1.5 border-b border-hf-border">
                      Data Dictionary
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
          <FilesTabContent resources={dataset.resources} slug={slug} />

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
