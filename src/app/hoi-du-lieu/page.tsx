/**
 * /hoi-du-lieu — Discovery Chat dedicated page.
 *
 * Server component: auth check → redirect /login nếu chưa. Else render ChatBox.
 * ChatBox là client component — handles stream + state.
 *
 * Spec 2026-07-24-discovery-chat.
 */

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import CatalogNav from "@/components/CatalogNav";
import ChatBox from "@/components/chat/ChatBox";

// Dynamic SSR — không cache, auth check mỗi request.
export const dynamic = "force-dynamic";

// CatalogNav render trực tiếp (root layout chỉ có SessionProvider, không render nav).
export default async function HoiDuLieuPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/hoi-du-lieu");
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
        />
      </Suspense>
    </>
  );
}
