#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
STATE_DIR="${REPO_DIR}/.openclaw/reports"
STATE_FILE="${STATE_DIR}/jira-review-alert-state.json"
TMP_FILE="${STATE_DIR}/jira-review-alert-current.json"

mkdir -p "${STATE_DIR}"

JIRA_HELPER="${JIRA_HELPER:-/Users/maany/.openclaw/bin/jira}"
JIRA_URL="${JIRA_URL:-$(sed -n 's/^JIRA_URL="\(.*\)"/\1/p' "${JIRA_HELPER}" | head -n1)}"
JIRA_USER="${JIRA_USER:-$(sed -n 's/^JIRA_USER="\(.*\)"/\1/p' "${JIRA_HELPER}" | head -n1)}"
JIRA_TOKEN="${JIRA_TOKEN:-$(sed -n 's/^JIRA_TOKEN="\(.*\)"/\1/p' "${JIRA_HELPER}" | head -n1)}"
PROJECT_KEY="${PROJECT_KEY:-KAN}"
SLACK_TARGET="${SLACK_TARGET:-C0AGFMREHTJ}"
SLACK_CHANNEL="${SLACK_CHANNEL:-slack}"
DRY_RUN="${DRY_RUN:-0}"

if [[ -z "${JIRA_URL}" || -z "${JIRA_USER}" || -z "${JIRA_TOKEN}" ]]; then
  echo "Missing Jira credentials. Set JIRA_URL/JIRA_USER/JIRA_TOKEN or ensure ${JIRA_HELPER} has them."
  exit 1
fi

ENCODED_JQL=$(python3 - <<'PY'
import urllib.parse
print(urllib.parse.quote('project = KAN ORDER BY updated DESC'))
PY
)

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
    "Tickets requiring Codex review/deploy checks:",
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

openclaw message send \
  --channel "${SLACK_CHANNEL}" \
  --target "${SLACK_TARGET}" \
  --message "${ALERT_MSG}" >/dev/null

echo "Alert sent to ${SLACK_CHANNEL}:${SLACK_TARGET}"
