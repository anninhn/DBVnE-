import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getMetadataYaml,
  parseDictionaryMarkdown,
} from "@/lib/datasets/read";
import { getGithubConfig, rawUrl } from "@/lib/datasets/types";
import EditDatasetForm from "@/components/dataset/EditDatasetForm";

// Dynamic SSR — tránh Vercel cache 404
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const meta = await getMetadataYaml(slug);
  if (!meta) return { title: "Không tìm thấy dataset" };
  return { title: `Edit: ${meta.title} — VnExpress Data Platform` };
}

/** Fetch dictionary.md raw content từ GitHub raw */
async function fetchDictionaryMarkdown(
  slug: string
): Promise<string | null> {
  const config = getGithubConfig();
  const url = rawUrl(config, `datasets/${slug}/dictionary.md`);

  const headers: Record<string, string> = {
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    "User-Agent": "vnexpress-data-platform",
  };

  const res = await fetch(url, { headers, next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `GitHub raw fetch failed: datasets/${slug}/dictionary.md (${res.status})`
    );
  }
  return res.text();
}

export default async function EditDatasetPage({ params }: PageProps) {
  const { slug } = await params;

  // Fetch metadata + dictionary song song
  const [meta, dictText] = await Promise.all([
    getMetadataYaml(slug),
    fetchDictionaryMarkdown(slug),
  ]);

  // 404 nếu slug không tồn tại
  if (!meta) notFound();

  const dictionary = dictText ? parseDictionaryMarkdown(dictText) : [];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav — đơn giản hơn listing (không search input) */}
      <nav className="bg-hf-bg border-b border-hf-border h-[52px] px-4 flex items-center gap-6 sticky top-0 z-50">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-[15px] text-hf-text"
        >
          <span className="text-[22px]">🤗</span>
          <span>VnExpress Data</span>
        </Link>
        <div className="flex gap-5 flex-1 text-sm">
          <Link href="/" className="font-semibold text-hf-text">
            Datasets
          </Link>
        </div>
      </nav>

      <div className="max-w-[900px] mx-auto bg-hf-bg w-full flex-1 p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="text-xs text-hf-text-faint mb-2">
            <Link
              href={`/datasets/${slug}`}
              className="hover:underline"
            >
              ← Quay lại dataset
            </Link>
          </div>
          <h1 className="text-[22px] font-semibold text-hf-text">
            Chỉnh sửa dataset
          </h1>
          <p className="text-sm text-hf-text-muted mt-1">
            Sửa metadata + data dictionary. File đính kèm giữ nguyên (D3).
          </p>
        </div>

        <EditDatasetForm
          initialSlug={slug}
          initialMetadata={meta}
          initialDictionary={dictionary}
        />
      </div>
    </div>
  );
}
