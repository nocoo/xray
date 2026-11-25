#!/usr/bin/env bash
# L1 coverage gate — enforce lines/functions/branches/statements floors from CLI args.
# Usage: bash scripts/check-coverage.sh [LINES] [FUNCS] [BRANCHES] [STATEMENTS]
# Default: 80 80 80 80
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LINES_MIN="${1:-80}"
FUNCS_MIN="${2:-80}"
BRANCHES_MIN="${3:-80}"
STATEMENTS_MIN="${4:-$LINES_MIN}"

echo "L1 coverage floors: lines>=${LINES_MIN} functions>=${FUNCS_MIN} branches>=${BRANCHES_MIN} statements>=${STATEMENTS_MIN}"

LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/xray-coverage-XXXXXX")"
trap 'rm -rf "$LOG_DIR"' EXIT

echo "━━━ build @xray/shared ━━━"
bunx turbo run build --filter=@xray/shared

fail=0

run_pkg() {
  local filter="$1"
  local pkgdir="$2"
  local outdir="$ROOT/$pkgdir/coverage"
  echo "━━━ coverage $filter ━━━"
  rm -rf "$outdir"
  if ! (
    cd "$ROOT/$pkgdir" &&
      "$ROOT/node_modules/.bin/vitest" run \
        --coverage \
        --coverage.reporter=json-summary \
        --coverage.reporter=text \
        --coverage.reportsDirectory=coverage
  ); then
    echo "❌ $filter tests failed under coverage"
    return 1
  fi
  local summary="$outdir/coverage-summary.json"
  if [ ! -f "$summary" ]; then
    summary=$(find "$ROOT/$pkgdir" -name coverage-summary.json 2>/dev/null | head -1 || true)
  fi
  if [ ! -f "${summary:-}" ]; then
    echo "❌ $filter missing coverage-summary.json"
    return 1
  fi
  SUMMARY_PATH="$summary" FILTER="$filter" \
    LINES_MIN="$LINES_MIN" FUNCS_MIN="$FUNCS_MIN" BRANCHES_MIN="$BRANCHES_MIN" STATEMENTS_MIN="$STATEMENTS_MIN" \
    node <<'NODE'
const s = require(process.env.SUMMARY_PATH);
const t = s.total;
const filter = process.env.FILTER;
const LINES_MIN = Number(process.env.LINES_MIN);
const FUNCS_MIN = Number(process.env.FUNCS_MIN);
const BRANCHES_MIN = Number(process.env.BRANCHES_MIN);
const STATEMENTS_MIN = Number(process.env.STATEMENTS_MIN);
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
if (stmts < STATEMENTS_MIN) {
  console.error(`❌ ${filter} statements ${stmts} < ${STATEMENTS_MIN}`);
  bad = true;
}
if (bad) process.exit(1);
console.log(
  `✔ ${filter} meets floors lines/funcs/branches/statements >= ${LINES_MIN}/${FUNCS_MIN}/${BRANCHES_MIN}/${STATEMENTS_MIN}`,
);
NODE
}

launch_pkg() {
  local idx="$1"
  local filter="$2"
  local pkgdir="$3"
  (
    run_pkg "$filter" "$pkgdir" >"$LOG_DIR/$idx.log" 2>&1
    echo $? >"$LOG_DIR/$idx.exit"
  ) &
}

launch_pkg 1 @xray/shared packages/shared
launch_pkg 2 @xray/worker packages/worker
launch_pkg 3 @xray/ui packages/ui

wait

for idx in 1 2 3; do
  cat "$LOG_DIR/$idx.log"
  rc=$(cat "$LOG_DIR/$idx.exit" 2>/dev/null || echo 1)
  if [ "$rc" -ne 0 ]; then
    fail=1
  fi
done

exit "$fail"
