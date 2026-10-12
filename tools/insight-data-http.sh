#!/usr/bin/env bash
# Server MCP insight-data qua HTTP cục bộ — chạy từ terminal, giữ cửa sổ mở trong lúc dùng Claude Desktop.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
set -a; source .env.local; set +a
exec node --experimental-strip-types --no-warnings \
  --import ./prototypes/insight-demo/bench/node-loader/register.mjs \
  tools/insight-data-http.mjs
