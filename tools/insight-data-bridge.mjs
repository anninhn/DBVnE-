#!/usr/bin/env node
/**
 * Cầu nối stdio → HTTP cho Claude Desktop (xem tools/insight-data-http.mjs). KHÔNG phụ thuộc gì,
 * không đọc file nào — được chép ra ~/.insight-mcp/ (ngoài Desktop) để app Claude chạy được.
 * Mỗi dòng stdin là một thông điệp JSON-RPC → POST tới server → ghi kết quả ra stdout.
 */
import readline from "readline";

const URL_RPC = `http://127.0.0.1:${process.env.INSIGHT_MCP_PORT ?? 8765}/rpc`;
const rl = readline.createInterface({ input: process.stdin });

rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  try {
    const res = await fetch(URL_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: line });
    if (res.status === 204) return;
    process.stdout.write((await res.text()) + "\n");
  } catch (err) {
    console.error("[insight-bridge] không gọi được server:", err.message);
    if (msg.id !== undefined) {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: "Server insight-data chưa chạy. Mở terminal, chạy tools/insight-data-http.sh trong repo DB_VNExpress." } }) + "\n");
    }
  }
});
