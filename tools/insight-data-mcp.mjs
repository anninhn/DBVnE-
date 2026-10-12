/**
 * MCP server "insight-data" (stdio) — lớp tool dữ liệu cho Claude Code (THIET-KE-V8 mục 3b).
 *
 * Khác tools/insight-mcp.mjs (lát 1, proxy về app Next qua phiên + token): server này chạy
 * thẳng code trong src/lib/insight bằng node loader của bench, không cần dev server. Tool là
 * code thuần — không gọi AI — nên token chỉ tính vào tài khoản Claude của người dùng.
 *
 * Chạy qua tools/insight-data-mcp.sh (nạp .env.local, cd về gốc repo, bật loader).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TOOL_DEFS, callTool } from "@/lib/insight/mcp/tools";
import { MCP_INSTRUCTIONS as instructions } from "@/lib/insight/mcp/instructions";

const server = new Server({ name: "insight-data", version: "0.1.0" }, { capabilities: { tools: {} }, instructions });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const out = await callTool(req.params.name, req.params.arguments ?? {});
  return { content: [{ type: "text", text: out.text }], isError: !out.ok };
});

await server.connect(new StdioServerTransport());
