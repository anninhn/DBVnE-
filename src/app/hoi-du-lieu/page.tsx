/**
 * /hoi-du-lieu — Discovery Chat dedicated page.
 *
 * Server component: auth check → redirect /login nếu chưa. Else render ChatBox.
 * ChatBox là client component — handles stream + state.
 *
 * Attach dataset: URL param `?attached=<slug>` (từ sidebar "Hỏi về dataset này")
 * → server fetch title qua getDatasetBySlug (lightweight), pass xuống ChatBox để
 * render chip. API discovery tự fetch full detail (metadata + dictionary + sample
 * rows) khi nhận attachedSlug trong body.
 *
 * Spec 2026-07-24-discovery-chat.
 */

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDatasetBySlug } from "@/lib/datasets/read";
import CatalogNav from "@/components/CatalogNav";
import ChatBox from "@/components/chat/ChatBox";

// Dynamic SSR — không cache, auth check mỗi request.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ attached?: string }>;
}

// CatalogNav render trực tiếp (root layout chỉ có SessionProvider, không render nav).
export default async function HoiDuLieuPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/hoi-du-lieu");
  }

  // Attach dataset (optional) — sidebar CTA "Hỏi về dataset này".
  // Silent fallback: slug invalid/deleted → attachedDataset null → ChatBox không show chip.
  const { attached: attachedSlug } = await searchParams;
  let attachedDataset: { slug: string; title: string } | null = null;
  if (attachedSlug) {
    const ds = await getDatasetBySlug(attachedSlug);
    if (ds) {
      attachedDataset = { slug: ds.slug, title: ds.title };
    }
  }

  return (
    <>
      <CatalogNav />
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-[calc(100vh-52px)] text-hf-text-muted text-sm">
            Đang tải...
          </div>
        }
      >
        <ChatBox
          displayName={
            (session.user as { displayName?: string }).displayName ??
            "bạn"
          }
          attachedDataset={attachedDataset}
        />
      </Suspense>
    </>
  );
}
