#!/usr/bin/env bash
# L1 coverage gate — package vitest thresholds (lines/functions/branches ≥95%).
# View shells excluded via each package's vitest.config.ts include/exclude.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail=0

run_pkg() {
  local filter="$1"
  local pkgdir="$2"
  echo "━━━ coverage $filter ━━━"
  rm -rf "$ROOT/$pkgdir/coverage"
  if ! bunx turbo run test --filter="$filter" --force -- \
    --coverage \
    --coverage.reporter=json-summary \
    --coverage.reporter=text \
    --coverage.reportsDirectory=coverage; then
    echo "❌ $filter coverage/tests failed"
    fail=1
  else
    echo "✔ $filter coverage thresholds ok"
  fi
}

run_pkg @xray/shared packages/shared
run_pkg @xray/worker packages/worker
run_pkg @xray/ui packages/ui

exit "$fail"
