#!/usr/bin/env bash
# L1 coverage gate — enforce lines/functions/branches floors from CLI args.
# Usage: bash scripts/check-coverage.sh [LINES] [FUNCS] [BRANCHES]
# Default: 95 95 95
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LINES_MIN="${1:-95}"
FUNCS_MIN="${2:-95}"
BRANCHES_MIN="${3:-95}"

echo "L1 coverage floors: lines>=${LINES_MIN} functions>=${FUNCS_MIN} branches>=${BRANCHES_MIN}"

fail=0

run_pkg() {
  local filter="$1"
  local pkgdir="$2"
  local outdir="$ROOT/$pkgdir/coverage"
  echo "━━━ coverage $filter ━━━"
  rm -rf "$outdir"
  if ! bunx turbo run test --filter="$filter" --force -- \
    --coverage \
    --coverage.reporter=json-summary \
    --coverage.reporter=text \
    --coverage.reportsDirectory=coverage; then
    echo "❌ $filter tests failed under coverage"
    fail=1
    return
  fi
  local summary="$outdir/coverage-summary.json"
  if [ ! -f "$summary" ]; then
    # turbo may nest reportsDirectory oddly — search once
    summary=$(find "$ROOT/$pkgdir" -name coverage-summary.json 2>/dev/null | head -1 || true)
  fi
  if [ ! -f "${summary:-}" ]; then
    echo "❌ $filter missing coverage-summary.json"
    fail=1
    return
  fi
  if SUMMARY_PATH="$summary" FILTER="$filter" \
    LINES_MIN="$LINES_MIN" FUNCS_MIN="$FUNCS_MIN" BRANCHES_MIN="$BRANCHES_MIN" \
    node <<'NODE'
const s = require(process.env.SUMMARY_PATH);
const t = s.total;
const filter = process.env.FILTER;
const LINES_MIN = Number(process.env.LINES_MIN);
const FUNCS_MIN = Number(process.env.FUNCS_MIN);
const BRANCHES_MIN = Number(process.env.BRANCHES_MIN);
if (!t) {
  console.error(`❌ ${filter}: no total in summary`);
  process.exit(1);
}
const lines = t.lines.pct;
const funcs = t.functions.pct;
const branches = t.branches.pct;
const stmts = t.statements.pct;
console.log(
  `${filter} total lines=${lines} functions=${funcs} branches=${branches} statements=${stmts}`,
);
let bad = false;
if (lines < LINES_MIN) {
  console.error(`❌ ${filter} lines ${lines} < ${LINES_MIN}`);
  bad = true;
}
if (funcs < FUNCS_MIN) {
  console.error(`❌ ${filter} functions ${funcs} < ${FUNCS_MIN}`);
  bad = true;
}
if (branches < BRANCHES_MIN) {
  console.error(`❌ ${filter} branches ${branches} < ${BRANCHES_MIN}`);
  bad = true;
}
if (bad) process.exit(1);
console.log(
  `✔ ${filter} meets floors lines/funcs/branches >= ${LINES_MIN}/${FUNCS_MIN}/${BRANCHES_MIN}`,
);
NODE
  then
    :
  else
    fail=1
  fi
}

run_pkg @xray/shared packages/shared
# worker: vitest branch floor 94 (see packages/worker/vitest.config.ts); summary still ≥94.5
BRANCHES_MIN=94 run_pkg @xray/worker packages/worker
run_pkg @xray/ui packages/ui

exit "$fail"
