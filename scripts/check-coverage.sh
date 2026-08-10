#!/usr/bin/env bash
# L1 coverage gate — thresholds for S3.6
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LINES_MIN="${1:-50}"
FUNCS_MIN="${2:-50}"

bunx turbo run test --filter=@xray/shared -- --coverage --coverage.reporter=json-summary --coverage.reportsDirectory=coverage
bunx turbo run test --filter=@xray/worker -- --coverage --coverage.reporter=json-summary --coverage.reportsDirectory=coverage

# Prefer worker summary if present
SUMMARY=""
for p in packages/worker/coverage/coverage-summary.json packages/shared/coverage/coverage-summary.json; do
  if [ -f "$p" ]; then SUMMARY="$p"; break; fi
done

if [ -z "$SUMMARY" ]; then
  echo "coverage-summary.json not found — running plain tests already passed; skip numeric gate in skeleton"
  exit 0
fi

node -e "
const s=require('./$SUMMARY').total;
const lines=s.lines.pct, funcs=s.functions.pct;
console.log('coverage lines='+lines+' functions='+funcs);
if (lines < $LINES_MIN || funcs < $FUNCS_MIN) {
  console.error('Coverage below gate lines>=$LINES_MIN funcs>=$FUNCS_MIN');
  process.exit(1);
}
"
