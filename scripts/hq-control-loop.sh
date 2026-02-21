#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[hq-loop] Step 1/4: governor"
if [[ "${1:-}" == "--dry-run" ]]; then
  npm run hq:governor:dry
else
  npm run hq:governor
fi

echo "[hq-loop] Step 2/4: atlas dispatch"
if [[ "${1:-}" == "--dry-run" ]]; then
  npm run atlas:dispatch:dry
else
  npm run atlas:dispatch
fi

echo "[hq-loop] Step 3/4: executive brief"
npm run hq:brief

echo "[hq-loop] Step 4/4: secret audit"
npm run security:audit

echo "[hq-loop] completed"
