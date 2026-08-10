#!/usr/bin/env bash
# L1 coverage gate — require summary per package (S23-09)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LINES_MIN="${1:-50}"
FUNCS_MIN="${2:-50}"

run_cov() {
  local filter="$1"
  local outdir="$2"
  bunx turbo run test --filter="$filter" -- --coverage --coverage.reporter=json-summary --coverage.reportsDirectory="$outdir"
}

run_cov @xray/shared packages/shared/coverage
run_cov @xray/worker packages/worker/coverage

fail=0
for pair in "packages/shared/coverage/coverage-summary.json:shared" "packages/worker/coverage/coverage-summary.json:worker"; do
  file="${pair%%:*}"
  name="${pair##*:}"
  if [ ! -f "$file" ]; then
    echo "❌ missing coverage summary for $name ($file)"
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
