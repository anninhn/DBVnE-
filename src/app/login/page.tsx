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
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    const next = (await searchParams).next;
    redirect(next && next.startsWith("/") ? next : "/");
  }

  const next = (await searchParams).next;
  const safeNext = next && next.startsWith("/") ? next : "/";

  return (
    <>
      <CatalogNav />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-hf-text">Đăng nhập</h1>
            <p className="text-sm text-hf-text-muted mt-1">
              Cần đăng nhập để upload, chỉnh sửa hoặc xóa dataset.
            </p>
          </div>
          <LoginForm next={safeNext} />
        </div>
      </main>
    </>
  );
}
