import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/auth/config";
import CatalogNav from "@/components/CatalogNav";
import { checkAuthorize, CONSENT_TTL_S, originFromHeaders, redirectWith, sign } from "@/lib/oauth/core";

export const dynamic = "force-dynamic";

/**
 * Trang xác nhận OAuth — phóng viên cho phép ứng dụng AI (Claude, ChatGPT, Cursor…) dùng kho dữ liệu bằng tài khoản của mình
 * (spec 2026-10-12-mcp-connector). Chưa đăng nhập → /login rồi quay lại đây.
 */
export default async function ConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
  const origin = originFromHeaders(await headers());
  const c = checkAuthorize(q, origin);
  if (!c.ok) {
    if (!c.fatal) redirect(redirectWith(c.redirect!, { error: c.error, error_description: c.description, state: c.state, iss: origin }));
    return <Shell>{<p className="text-sm text-red-600">Lỗi kết nối: {c.description}</p>}</Shell>;
  }

  const session = await auth();
  if (!session?.user) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?${q.toString()}`)}`);
  const user = session.user as unknown as SessionUser;
  const ticket = sign("consent", { ...c.req, u: user.username }, CONSENT_TTL_S);
  const app = c.req.client_name ?? "Ứng dụng AI"

  return (
    <Shell>
      <h1 className="text-xl font-semibold text-hf-text text-center">Kết nối {app} với Kho dữ liệu VnExpress</h1>
      <div className="bg-hf-bg-subtle border border-hf-border rounded-lg p-6 space-y-4 mt-6">
        <p className="text-sm text-hf-text">
          <b>{app}</b> muốn tra cứu và tính toán trên kho dữ liệu bằng tài khoản <b>{user.displayName}</b> ({user.username}).
        </p>
        <ul className="text-sm text-hf-text-muted list-disc pl-5 space-y-1">
          <li>Chỉ đọc: tìm chỉ tiêu, tính số, dựng biểu đồ. Không sửa, không xoá dataset.</li>
          <li>Kết quả công cụ (số liệu, bảng, biểu đồ) được gửi tới nhà cung cấp AI của ứng dụng này (Anthropic, OpenAI, Google…) để trả lời bạn. Chỉ dùng với dữ liệu đã công khai.</li>
          <li>Quyền kết nối hết hạn sau 30 ngày không dùng. Muốn ngắt sớm: xoá kết nối (connector / MCP server) trong ứng dụng.</li>
        </ul>
        <form method="post" action="/api/oauth/consent" className="flex gap-3 pt-2">
          <input type="hidden" name="ticket" value={ticket} />
          <button
            name="decision"
            value="allow"
            className="flex-1 bg-hf-yellow text-hf-text py-2 rounded-md text-sm font-semibold hover:bg-hf-yellow/80 transition"
          >
            Cho phép
          </button>
          <button
            name="decision"
            value="deny"
            className="flex-1 border border-hf-border text-hf-text py-2 rounded-md text-sm hover:bg-hf-bg transition"
          >
            Từ chối
          </button>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CatalogNav />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </>
  );
}
