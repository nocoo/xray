#!/usr/bin/env bash
# L1 coverage gate — lines/functions/branches ≥95% on non-View scopes (6DQ OBJECTIVE).
# Args (optional): LINES_MIN FUNCS_MIN BRANCHES_MIN (default 95 95 95)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LINES_MIN="${1:-95}"
FUNCS_MIN="${2:-95}"
BRANCHES_MIN="${3:-95}"

run_cov() {
  local filter="$1"
  local pkgdir="$2"
  local outdir="$ROOT/$pkgdir/coverage"
  rm -rf "$outdir"
  bunx turbo run test --filter="$filter" --force -- \
    --coverage \
    --coverage.reporter=json-summary \
    --coverage.reporter=text \
    --coverage.reportsDirectory=coverage
}

run_cov @xray/shared packages/shared
run_cov @xray/worker packages/worker
run_cov @xray/ui packages/ui

fail=0

check_summary() {
  local file="$1"
  local name="$2"
  local include_re="${3:-}"
  if [ ! -f "$file" ]; then
    echo "❌ missing coverage summary for $name ($file)"
    fail=1
    return
  fi
  node -e "
const s=require('./$file');
const re=$include_re ? new RegExp($include_re) : null;
let lc=0,lt=0,fc=0,ft=0,bc=0,bt=0;
const rows=[];
for (const [k,v] of Object.entries(s)) {
  if (k==='total') continue;
  if (k.includes('.test.')) continue;
  if (re && !re.test(k)) continue;
  // View shells / pure type files exempt
  if (/[\\\\/]views[\\\\/]/.test(k)) continue;
  if (/[\\\\/]components[\\\\/]ui[\\\\/]/.test(k)) continue;
  if (/types\\.ts\$/.test(k)) continue;
  if (/index\\.ts\$/.test(k) && k.includes('shared')) continue;
  lc+=v.lines.covered; lt+=v.lines.total;
  fc+=v.functions.covered; ft+=v.functions.total;
  bc+=v.branches.covered; bt+=v.branches.total;
  rows.push([k.replace(process.cwd()+'/',''), v.lines.pct, v.functions.pct, v.branches.pct]);
}
const lines=lt? (lc/lt*100):100;
const funcs=ft? (fc/ft*100):100;
const branches=bt? (bc/bt*100):100;
console.log('$name gated coverage lines='+lines.toFixed(2)+' functions='+funcs.toFixed(2)+' branches='+branches.toFixed(2));
for (const [f,l,fn,b] of rows.sort((a,b)=>a[1]-b[1]).slice(0,15)) {
  console.log('  weak '+f+' L'+l+' F'+fn+' B'+b);
}
if (lines < $LINES_MIN || funcs < $FUNCS_MIN || branches < $BRANCHES_MIN) {
  console.error('❌ $name below gate lines>=$LINES_MIN funcs>=$FUNCS_MIN branches>=$BRANCHES_MIN');
  process.exit(1);
}
" || fail=1
}

# shared: all non-test source
check_summary packages/shared/coverage/coverage-summary.json shared

# worker: lib|middleware|repos|routes (+ domain helpers); exclude pure types
check_summary packages/worker/coverage/coverage-summary.json worker \
  "'[\\\\\\\\/](lib|middleware|repos|routes)[\\\\\\\\/]'"

# ui: viewmodels + lib + hooks + api (not views/components shells)
check_summary packages/ui/coverage/coverage-summary.json ui \
  "'[\\\\\\\\/](viewmodels|lib|hooks|api)[\\\\\\\\/]'"

exit "$fail"
