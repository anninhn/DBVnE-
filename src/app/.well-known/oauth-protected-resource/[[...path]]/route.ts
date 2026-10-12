import { NextResponse } from "next/server";
import { originOf, resourceOf } from "@/lib/oauth/core";

/** RFC 9728 — Claude đọc từ `resource_metadata` trong 401 của /api/mcp, hoặc dò đường này (kể cả có hậu tố /api/mcp) */
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const origin = originOf(req);
  return NextResponse.json(
    {
      resource: resourceOf(origin),
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      resource_name: "Kho dữ liệu VnExpress",
    },
    { headers: { "cache-control": "no-store" } }
  );
}
