#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_DIR="$ROOT_DIR/.openclaw/reports"
mkdir -p "$REPORT_DIR"
STAMP="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
REPORT_FILE="$REPORT_DIR/security-audit-$STAMP.md"
TMP_FILE="$REPORT_DIR/security-audit-$STAMP.tmp"

echo "# Security Audit Report" > "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "## Tracked Files Scan" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

SECRET_PATTERN='(NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ[A-Za-z0-9._-]{20,}|SUPABASE_SERVICE_ROLE_KEY=eyJ[A-Za-z0-9._-]{20,}|OPENAI_API_KEY=sk-[A-Za-z0-9_-]{20,}|PERPLEXITY_API_KEY=pplx-[A-Za-z0-9_-]{20,}|MEM0_API_KEY=mem0-[A-Za-z0-9_-]{12,}|JIRA_TOKEN="?ATAT[A-Za-z0-9._:-]{20,}"?)'

TRACKED_RESULTS="$(
  git ls-files \
  | rg -v '(^|/)\.env(\.|$)|\.env$' \
  | xargs rg -n "$SECRET_PATTERN" -S \
  | rg -v 'your_key_here|your_openai_key_here|your_perplexity_key_here|xxxxx|example|optional' \
  || true
)"
if [[ -z "$TRACKED_RESULTS" ]]; then
  echo "- No hardcoded live-token patterns found in tracked repo files." >> "$REPORT_FILE"
else
  echo "- Potential issues found in tracked repo files:" >> "$REPORT_FILE"
  while IFS= read -r line; do
    safe_line="$(echo "$line" | sed -E 's#(=).{8,}#\1<redacted>#')"
    echo "  - $safe_line" >> "$REPORT_FILE"
  done <<< "$TRACKED_RESULTS"
fi

echo "" >> "$REPORT_FILE"
echo "## Local Sensitive File Presence (outside git tracking)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

for file in \
  "$ROOT_DIR/.env.local" \
  "/Users/maany/careerhq/api-keys.env" \
  "/Users/maany/.openclaw/bin/jira"
do
  if [[ -f "$file" ]]; then
    echo "- Present: $file" >> "$REPORT_FILE"
  else
    echo "- Missing: $file" >> "$REPORT_FILE"
  fi
done

echo "" >> "$REPORT_FILE"
echo "## Verdict" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [[ -z "$TRACKED_RESULTS" ]]; then
  echo "- PASS (repo tracked files)." >> "$REPORT_FILE"
  status=0
else
  echo "- FAIL (tracked file secret patterns detected)." >> "$REPORT_FILE"
  status=2
fi

echo "$REPORT_FILE" > "$TMP_FILE"
cat "$TMP_FILE"
rm -f "$TMP_FILE"

exit "$status"
