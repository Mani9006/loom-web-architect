#!/bin/bash
set -euo pipefail

# DEPRECATED: This local control loop has been replaced by GitHub Actions.
# See: .github/workflows/hq-control-loop.yml
# See: .github/workflows/claude-code-agent.yml
# See: .github/workflows/jira-sync.yml
#
# This script is kept for manual one-off runs only.
# DO NOT run this in a cron/loop on your Mac Mini - use GitHub Actions instead.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "NOTE: This local loop is deprecated. Use GitHub Actions workflow instead."
echo "  Trigger remotely: gh workflow run hq-control-loop.yml"
echo ""

echo "[hq-loop] Step 1/4: governor"
if [[ "${1:-}" == "--dry-run" ]]; then
  npm run hq:governor:dry
else
  npm run hq:governor
fi

echo "[hq-loop] Step 2/4: executive brief"
npm run hq:brief

echo "[hq-loop] Step 3/4: secret audit"
npm run security:audit

echo "[hq-loop] Step 4/4: github agent dispatch (remote only)"
if [[ "${ENABLE_GITHUB_AGENT_DISPATCH:-1}" == "1" ]]; then
  if [[ "${1:-}" == "--dry-run" ]]; then
    npm run github:agents:dispatch:dry -- --max "${GITHUB_AGENT_DISPATCH_MAX:-1}"
  else
    npm run github:agents:dispatch -- --max "${GITHUB_AGENT_DISPATCH_MAX:-1}"
  fi
else
  echo "  Skipped (ENABLE_GITHUB_AGENT_DISPATCH=0)"
fi

echo "[hq-loop] completed"
