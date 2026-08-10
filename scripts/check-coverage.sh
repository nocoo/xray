#!/usr/bin/env bash
# L1 coverage gate — require fresh summary per package (S23-09 / S23R2)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LINES_MIN="${1:-50}"
FUNCS_MIN="${2:-50}"

run_cov() {
  local filter="$1"
  local pkgdir="$2"
  local outdir="$ROOT/$pkgdir/coverage"
  rm -rf "$outdir"
  # reportsDirectory is relative to package cwd; use bare "coverage"
  # --force avoids turbo cache serving stale coverage runs
  bunx turbo run test --filter="$filter" --force -- \
    --coverage \
    --coverage.reporter=json-summary \
    --coverage.reportsDirectory=coverage
}

run_cov @xray/shared packages/shared
run_cov @xray/worker packages/worker

fail=0
for pair in "packages/shared/coverage/coverage-summary.json:shared" "packages/worker/coverage/coverage-summary.json:worker"; do
  file="${pair%%:*}"
  name="${pair##*:}"
  if [ ! -f "$file" ]; then
    echo "❌ missing coverage summary for $name ($file)"
    # surface accidental nested paths from wrong reportsDirectory
    nested=$(find "$ROOT/packages" -path '*/packages/*/coverage/coverage-summary.json' 2>/dev/null | head -5 || true)
    if [ -n "${nested:-}" ]; then
      echo "   found nested summaries (path bug): $nested"
    fi
    fail=1
    continue
  fi
  node -e "
const s=require('./$file').total;
const lines=s.lines.pct, funcs=s.functions.pct;
console.log('$name coverage lines='+lines+' functions='+funcs);
if (lines < $LINES_MIN || funcs < $FUNCS_MIN) {
  console.error('❌ $name below gate lines>=$LINES_MIN funcs>=$FUNCS_MIN');
  process.exit(1);
}
" || fail=1
done

exit "$fail"
