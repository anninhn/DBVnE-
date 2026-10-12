/**
 * MCP insight-data qua HTTP cục bộ (127.0.0.1) — cho Claude Desktop trên macOS.
 *
 * Vì sao: Claude Desktop khởi động MCP stdio bằng chính app Claude; macOS chặn app đọc ~/Desktop
 * ("Operation not permitted") kể cả khi đã bật Full Disk Access (đo 2026-10-12). Server này chạy từ
 * terminal (có quyền), Claude Desktop chỉ chạy cầu nối tools/insight-data-bridge.mjs đặt ngoài Desktop.
 *
 * Giao thức: mỗi POST /rpc là MỘT thông điệp JSON-RPC của MCP; trả JSON-RPC (hoặc 204 với notification).
 * Cùng TOOL_DEFS / callTool với bản stdio — không có đường đi riêng.
 *
 * Chạy: tools/insight-data-http.sh   (cổng mặc định 8765, đổi bằng INSIGHT_MCP_PORT)
 */
import http from "http";
import { readFileSync } from "fs";
import { TOOL_DEFS, callTool } from "@/lib/insight/mcp/tools";

const PORT = Number(process.env.INSIGHT_MCP_PORT ?? 8765);
const instructions = readFileSync(new URL("../prototypes/insight-demo/claude/CLAUDE.md", import.meta.url), "utf8");

async function handle(msg) {
  const ok = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  switch (msg.method) {
    case "initialize":
      return ok({
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "insight-data", version: "0.1.0" },
        instructions,
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOL_DEFS });
    case "tools/call": {
      const out = await callTool(msg.params.name, msg.params.arguments ?? {});
      return ok({ content: [{ type: "text", text: out.text }], isError: !out.ok });
    }
    case "resources/list":
      return ok({ resources: [] });
    case "prompts/list":
      return ok({ prompts: [] });
    default:
      return msg.id === undefined ? null : { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Không hỗ trợ ${msg.method}` } };
  }
}

http
  .createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/rpc") return res.writeHead(404).end();
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      let msg;
      try {
        msg = JSON.parse(body);
      } catch {
        return res.writeHead(400).end();
      }
      try {
        const out = await handle(msg);
        if (!out) return res.writeHead(204).end();
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out));
      } catch (err) {
        console.error("[insight-data-http]", err);
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String(err?.message ?? err) } }));
      }
    });
  })
  .listen(PORT, "127.0.0.1", () => console.error(`[insight-data-http] http://127.0.0.1:${PORT}/rpc`));
