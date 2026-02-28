#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
STATE_DIR="${REPO_DIR}/.reports"
STATE_FILE="${STATE_DIR}/jira-review-alert-state.json"
TMP_FILE="${STATE_DIR}/jira-review-alert-current.json"

mkdir -p "${STATE_DIR}"

# Credentials from environment variables (no local file dependency)
JIRA_URL="${JIRA_URL:-}"
JIRA_USER="${JIRA_USER:-}"
JIRA_TOKEN="${JIRA_TOKEN:-}"
PROJECT_KEY="${PROJECT_KEY:-KAN}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
DRY_RUN="${DRY_RUN:-0}"

if [[ -z "${JIRA_URL}" || -z "${JIRA_USER}" || -z "${JIRA_TOKEN}" ]]; then
  echo "Missing Jira credentials. Set JIRA_URL, JIRA_USER, and JIRA_TOKEN environment variables."
  exit 1
fi

ENCODED_JQL=$(python3 -c "import urllib.parse; print(urllib.parse.quote('project = ${PROJECT_KEY} ORDER BY updated DESC'))")

RAW_JSON=$(curl -sS -u "${JIRA_USER}:${JIRA_TOKEN}" \
  -H "Content-Type: application/json" \
  "${JIRA_URL}/rest/api/3/search/jql?jql=${ENCODED_JQL}&maxResults=50&fields=summary,status,updated")

printf '%s' "${RAW_JSON}" > "${TMP_FILE}"

python3 - "${TMP_FILE}" "${STATE_FILE}" "${PROJECT_KEY}" "${JIRA_URL}" > "${STATE_DIR}/jira-review-alert-message.txt" <<'PY'
import json
import os
import sys
from datetime import datetime

current_file, state_file, project, jira_url = sys.argv[1:5]

with open(current_file, "r", encoding="utf-8") as f:
    raw = f.read()

data = json.loads(raw, strict=False)
issues = data.get("issues", [])

tracked = {}
for issue in issues:
    fields = issue.get("fields", {})
    key = issue.get("key")
    if not key:
        continue
    status = (fields.get("status") or {}).get("name", "")
    status_lower = status.lower()
    if status_lower != "done" and "review" not in status_lower:
        continue
    updated = fields.get("updated", "")
    summary = fields.get("summary", "")
    tracked[key] = {
        "status": status,
        "updated": updated,
        "summary": summary,
        "url": f"{jira_url}/browse/{key}",
    }

previous = {}
if os.path.exists(state_file):
    with open(state_file, "r", encoding="utf-8") as f:
        try:
            previous = json.load(f)
        except Exception:
            previous = {}

new_items = []
for key, item in tracked.items():
    prev = previous.get(key)
    if prev != item:
        new_items.append((key, item))

with open(state_file, "w", encoding="utf-8") as f:
    json.dump(tracked, f, indent=2, sort_keys=True)

if not new_items:
    print("")
    sys.exit(0)

timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
lines = [
    f"ResumePreps review alert ({timestamp})",
    "Tickets requiring review/deploy checks:",
]
for key, item in sorted(new_items):
    lines.append(f"- {key} [{item['status']}] {item['summary']}")
    lines.append(f"  {item['url']}")
lines.append("Action: run code review + deploy validation before production release.")
print("\n".join(lines))
PY

ALERT_MSG=$(cat "${STATE_DIR}/jira-review-alert-message.txt")
if [[ -z "${ALERT_MSG}" ]]; then
  echo "No new Review/Done ticket transitions."
  exit 0
fi

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "[dry-run] would send alert:"
  echo "${ALERT_MSG}"
  exit 0
fi

# Send via Slack webhook (replaces openclaw message send)
if [[ -n "${SLACK_WEBHOOK_URL}" ]]; then
  ESCAPED_MSG=$(echo "${ALERT_MSG}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
  curl -s -X POST "${SLACK_WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -d "{\"text\": ${ESCAPED_MSG}}" >/dev/null
  echo "Alert sent via Slack webhook"
else
  echo "No SLACK_WEBHOOK_URL set. Alert message:"
  echo "${ALERT_MSG}"
fi
