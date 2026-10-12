/**
 * Xử lý MỘT thông điệp JSON-RPC của MCP — dùng chung cho /api/mcp (production) và tools/insight-data-http.mjs
 * (local, cho Claude Desktop qua cầu nối). Stateless: không giữ phiên MCP.
 */

import { MCP_INSTRUCTIONS } from "./instructions";
import { callTool, TOOL_DEFS, type CallContext } from "./tools";

export interface RpcMessage {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26"];

/** Trả null với notification / response (không cần trả lời) */
export async function handleRpc(msg: RpcMessage, ctx: CallContext = {}): Promise<Record<string, unknown> | null> {
  if (msg.id === undefined || msg.id === null || !msg.method) return null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id, error: { code, message } });
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "insight-data", title: "Kho dữ liệu VnExpress", version: "0.2.0" },
        instructions: MCP_INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOL_DEFS });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      if (!TOOL_DEFS.some((t) => t.name === name)) return fail(-32602, `Không có tool "${name}"`);
      const out = await callTool(name, (msg.params?.arguments as Record<string, unknown>) ?? {}, ctx);
      return ok({ content: [{ type: "text", text: out.text }], isError: !out.ok });
    }
    case "resources/list":
      return ok({ resources: [] });
    case "resources/templates/list":
      return ok({ resourceTemplates: [] });
    case "prompts/list":
      return ok({ prompts: [] });
    default:
      return fail(-32601, `Không hỗ trợ ${msg.method}`);
  }
}
