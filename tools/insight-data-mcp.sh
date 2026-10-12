#!/usr/bin/env bash
# Khởi động MCP server insight-data: nạp .env.local, chạy từ gốc repo (data/insight/ tính theo cwd).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
set -a; source .env.local; set +a
exec node --experimental-strip-types --no-warnings \
  --import ./prototypes/insight-demo/bench/node-loader/register.mjs \
  tools/insight-data-mcp.mjs
