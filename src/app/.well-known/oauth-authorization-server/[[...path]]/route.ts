import { NextResponse } from "next/server";
import { corsPreflight, withCors } from "@/lib/oauth/cors";
import { originOf } from "@/lib/oauth/core";

/** RFC 8414 — máy chủ cấp quyền tối thiểu cho MCP connector (src/lib/oauth/core.ts) */
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const origin = originOf(req);
  return withCors(NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/api/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      authorization_response_iss_parameter_supported: true,
      scopes_supported: ["offline_access"],
    },
    { headers: { "cache-control": "no-store" } }
  ));
}

export const OPTIONS = corsPreflight;
