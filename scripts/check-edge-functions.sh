#!/usr/bin/env bash
# Type-check every Supabase edge function entrypoint with `deno check`.
#
#   bash scripts/check-edge-functions.sh               # all functions
#   bash scripts/check-edge-functions.sh chat job-search
#
# Uses the function's own deno.json when it has one, otherwise
# supabase/functions/deno.json (the shared config + import map).
# Set DENO_CHECK_IMPORT_MAP=/path/to/import_map.json to run with --no-config
# and a custom import map instead (e.g. offline sandboxes that stub esm.sh).
#
# Prints a per-function error count and a total, writes a markdown summary to
# $GITHUB_STEP_SUMMARY when present, and exits 1 when any function has errors
# (CI runs it with continue-on-error until the existing type debt is paid down).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCS_DIR="$ROOT/supabase/functions"
DENO="${DENO:-deno}"

if [ "$#" -gt 0 ]; then
  names=("$@")
else
  names=()
  for d in "$FUNCS_DIR"/*/; do
    n="$(basename "$d")"
    [ "${n#_}" != "$n" ] && continue        # skip _shared and other _ dirs
    [ -f "$d/index.ts" ] && names+=("$n")
  done
fi

total_errors=0
failed=0
summary="| Function | deno check errors |\n|---|---|\n"

for n in "${names[@]}"; do
  entry="$FUNCS_DIR/$n/index.ts"
  if [ -n "${DENO_CHECK_IMPORT_MAP:-}" ]; then
    args=(--no-config --import-map "$DENO_CHECK_IMPORT_MAP")
  elif [ -f "$FUNCS_DIR/$n/deno.json" ]; then
    args=(--config "$FUNCS_DIR/$n/deno.json")
  else
    args=(--config "$FUNCS_DIR/deno.json")
  fi
  out="$(NO_COLOR=1 "$DENO" check "${args[@]}" "$entry" 2>&1)"
  status=$?
  if [ $status -eq 0 ]; then
    count=0
  else
    # "Found N errors." when >1, otherwise count TS error headers; a module
    # resolution failure ("error: Import ... failed") counts as 1.
    count="$(printf '%s\n' "$out" | sed -n 's/^Found \([0-9][0-9]*\) errors\{0,1\}\..*/\1/p' | tail -1)"
    if [ -z "$count" ]; then
      count="$(printf '%s\n' "$out" | grep -cE '^TS[0-9]+ \[ERROR\]' || true)"
      [ "$count" -eq 0 ] && count=1
    fi
    failed=$((failed + 1))
    printf '%s\n' "$out" | tail -n 40 > "${TMPDIR:-/tmp}/deno-check-$n.log"
  fi
  total_errors=$((total_errors + count))
  printf '%-36s %s\n' "$n" "$count"
  summary+="| \`$n\` | $count |\n"
done

echo "----"
echo "functions checked: ${#names[@]}  failing: $failed  total errors: $total_errors"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Edge functions: deno check"
    echo
    echo "**${#names[@]}** functions, **$failed** failing, **$total_errors** total errors."
    echo
    printf '%b' "$summary"
  } >> "$GITHUB_STEP_SUMMARY"
fi

[ "$failed" -eq 0 ]
