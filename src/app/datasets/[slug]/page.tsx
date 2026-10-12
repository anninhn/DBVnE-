import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Pencil, Download } from "lucide-react";
import { getDatasetBySlug, getDatasetDetail } from "@/lib/datasets/read";
import { formatCompactNumber } from "@/lib/format";
import { classifyModalities } from "@/lib/datasets/modalities";
import { lookupDisplayName, requireUser } from "@/lib/auth";
import DeleteDatasetButton from "@/components/dataset/DeleteDatasetButton";
import CatalogNav from "@/components/CatalogNav";
import TabSwitcher from "./TabSwitcher";
import DatasetCardTabs from "./DatasetCardTabs";
import MetadataSidebar from "./MetadataSidebar";
import Markdown from "./Markdown";
import DataDictionary from "./DataDictionary";
import FilesTabContent from "./FilesTabContent";
import ArticlesTab from "./ArticlesTab";

// Dynamic SSR runtime — tránh Vercel cache 404 khi dataset chưa tồn tại
// (cache layer fetch vẫn 60s qua unstable_cache).
// Page luôn re-render mỗi request (force-dynamic), nhưng data fetch qua
// getDatasetDetail dùng cross-request cache 60s → hit ~50ms, miss ~1-3s.
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
  // getDatasetDetail đã bao gồm withPreviewData (cached). Sau hit đầu mỗi
  // phút hoặc sau revalidateTag (upload/edit/delete): cold ~1-3s, hot ~50ms.
  const dataset = await getDatasetDetail(slug);
  if (!dataset) notFound();

  // Resolve displayName cho header (đồng bộ với sidebar ActorRow).
  const ownerDisplay = await lookupDisplayName(dataset.uploaded_by);
  // Download yêu cầu đăng nhập (API route đã có requireUserOr401).
  const currentUser = await requireUser();

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
              {/* Star (likes) + Follow ẩn tạm — chưa có backend/volume user.
                  Sẽ enable lại khi build social features. */}
              {dataset.resources[0]?.file_url && (
                <a
                  href={
                    currentUser
                      ? `/api/dataset/download?slug=${encodeURIComponent(slug)}&resourceId=${dataset.resources[0].id}`
                      : `/login?next=${encodeURIComponent(`/datasets/${slug}`)}`
                  }
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
              {(() => {
                const mods = classifyModalities(dataset.resources);
                return (mods.length > 0 ? mods : (["Tabular"] as const)).map((m) => (
                  <Pill key={m}>{m}</Pill>
                ));
              })()}
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
            {dataset.license && dataset.license.toLowerCase() !== "internal" && (
              <PillGroup label="License:"><Pill>{dataset.license}</Pill></PillGroup>
            )}
          </div>
        </div>

        {/* Tabs */}
        <TabSwitcher
          tabs={[
            { key: "card", label: "Dataset card" },
            { key: "files", label: "Files and versions" },
            { key: "articles", label: "Article Linking" },
          ]}
        >
          {/* ── Dataset card tab (viewer + readme) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px]">
            <div className="p-6 border-r border-hf-border min-w-0">
              <DatasetCardTabs dataset={dataset} canDownload={!!currentUser} slug={slug} />

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
          <FilesTabContent
            resources={dataset.resources}
            slug={slug}
            canDownload={!!currentUser}
            dictionary={dataset.data_dictionary}
          />

          {/* ── Articles tab (spec 2026-07-24-article-linking) ── */}
          <ArticlesTab slug={slug} initialArticles={dataset.articles ?? []} />

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
