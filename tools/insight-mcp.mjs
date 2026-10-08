#!/usr/bin/env node
/**
 * MCP server "insight" (stdio) — proxy mỏng chuyển mọi lượt gọi tool về app Next.
 *
 * Vì sao proxy thay vì chạy tool ngay trong tiến trình này: tool dùng lại code của app
 * (getDatasetBySlug, đọc R2, parser…) vốn chạy trong Next. Proxy chỉ khai báo danh
 * sách tool (lấy từ GET /api/insight/tools) và chuyển tiếp — logic, rào chắn và trạng
 * thái phiên đều nằm phía app.
 *
 * Claude Code spawn file này qua --mcp-config. Biến môi trường do route /api/insight/run đặt:
 *   INSIGHT_BASE_URL  vd http://localhost:3000
 *   INSIGHT_SESSION   id phiên
 *   INSIGHT_TOKEN     bí mật của phiên
 *
 * Dùng low-level `Server` (không phải McpServer) để chuyển nguyên JSON Schema của app,
 * không phải khai báo lại schema bằng zod ở đây.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const BASE = process.env.INSIGHT_BASE_URL ?? "http://localhost:3000";
const SESSION = process.env.INSIGHT_SESSION;
const TOKEN = process.env.INSIGHT_TOKEN;

if (!SESSION || !TOKEN) {
  console.error("[insight-mcp] thiếu INSIGHT_SESSION / INSIGHT_TOKEN");
  process.exit(1);
}

const server = new Server({ name: "insight", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const res = await fetch(`${BASE}/api/insight/tools`);
  if (!res.ok) throw new Error(`GET /api/insight/tools → ${res.status}`);
  const { tools } = await res.json();
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const res = await fetch(`${BASE}/api/insight/tools`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: SESSION,
      token: TOKEN,
      tool: req.params.name,
      args: req.params.arguments ?? {},
    }),
  });
  if (!res.ok) {
    return { content: [{ type: "text", text: `Lỗi app (${res.status}): ${await res.text()}` }], isError: true };
  }
  const out = await res.json();
  return { content: [{ type: "text", text: out.text }], isError: !out.ok };
});

await server.connect(new StdioServerTransport());
