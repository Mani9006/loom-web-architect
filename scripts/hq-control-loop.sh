#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[hq-loop] Step 1/5: governor"
if [[ "${1:-}" == "--dry-run" ]]; then
  npm run hq:governor:dry
else
  npm run hq:governor
fi

echo "[hq-loop] Step 2/5: atlas dispatch"
if [[ "${1:-}" == "--dry-run" ]]; then
  npm run atlas:dispatch:dry
else
  npm run atlas:dispatch
fi

if [[ "${ENABLE_GITHUB_AGENT_DISPATCH:-1}" == "1" ]]; then
  echo "[hq-loop] Step 3/5: github agent dispatch"
  if [[ "${1:-}" == "--dry-run" ]]; then
    npm run github:agents:dispatch:dry -- --max "${GITHUB_AGENT_DISPATCH_MAX:-1}"
  else
    npm run github:agents:dispatch -- --max "${GITHUB_AGENT_DISPATCH_MAX:-1}"
  fi
else
  echo "[hq-loop] Step 3/5: github agent dispatch skipped (ENABLE_GITHUB_AGENT_DISPATCH=0)"
fi

echo "[hq-loop] Step 4/5: executive brief"
npm run hq:brief

echo "[hq-loop] Step 5/5: secret audit"
npm run security:audit

echo "[hq-loop] completed"
