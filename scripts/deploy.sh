#!/usr/bin/env bash
# Manual deploy helper for ResumePreps edge functions.
#
# Usage:
#   scripts/deploy.sh staging
#   scripts/deploy.sh production
#   scripts/deploy.sh staging career-ops-tailor-v2     # single function
#
# Requires `supabase login` to be done locally.

set -euo pipefail

ENV="${1:-}"
FN="${2:-}"

case "$ENV" in
  staging) REF="${SUPABASE_PROJECT_REF_STAGING:-yiqsmjtblahdorgsurrh}" ;;
  production) REF="${SUPABASE_PROJECT_REF_PROD:-woxtbyotydxorcdhhivr}" ;;
  *)
    echo "usage: $0 {staging|production} [function-name]" >&2
    exit 1
    ;;
esac

if [ -n "$FN" ]; then
  echo "→ deploying $FN to $ENV ($REF)"
  supabase functions deploy "$FN" --project-ref "$REF"
  exit 0
fi

echo "→ deploying ALL functions to $ENV ($REF)"
for dir in supabase/functions/*/; do
  name="$(basename "$dir")"
  [ "$name" = "_shared" ] && continue
  echo "  · $name"
  supabase functions deploy "$name" --project-ref "$REF"
done

echo "✓ done"
