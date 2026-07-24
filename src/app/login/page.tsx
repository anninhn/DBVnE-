import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import LoginForm from "@/components/auth/LoginForm";
import CatalogNav from "@/components/CatalogNav";

export const dynamic = "force-dynamic";

/**
 * /login page — server component check session, redirect nếu đã login.
 *
 * Spec plan task 8.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  // NextAuth v5 middleware redirect truyền `callbackUrl` — có thể là absolute URL
  // (http://localhost:3000/...) hoặc relative path. Code cũ dùng `next`.
  // Accept cả 3 (ưu tiên callbackUrl). Strip origin để tránh open-redirect.
  const rawNext = sp.callbackUrl ?? sp.next;
  let safeNext = "/";
  if (rawNext) {
    try {
      const u = new URL(rawNext, "http://placeholder");
      // Chỉ accept same-origin path — strip host, giữ pathname+search
      if (u.pathname.startsWith("/")) {
        safeNext = u.pathname + u.search;
      }
    } catch {
      // rawNext là relative path — accept nếu startsWith "/"
      if (rawNext.startsWith("/")) safeNext = rawNext;
    }
  }

  const session = await auth();
  if (session?.user) {
    redirect(safeNext);
  }

  return (
    <>
      <CatalogNav />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-hf-text">Đăng nhập</h1>
            <p className="text-sm text-hf-text-muted mt-1">
              Đăng nhập để download, upload, sửa dataset hoặc hỏi đáp.
            </p>
          </div>
          <LoginForm next={safeNext} />
        </div>
      </main>
    </>
  );
}
