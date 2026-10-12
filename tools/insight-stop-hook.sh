#!/usr/bin/env bash
# Stop hook cho thư mục prototypes/insight-demo/claude — chạy từ gốc repo, bật loader.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
exec node --experimental-strip-types --no-warnings \
  --import ./prototypes/insight-demo/bench/node-loader/register.mjs \
  tools/insight-stop-hook.mjs
