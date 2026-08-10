#!/usr/bin/env bash
# L1 coverage gate — fresh package summaries + domain ≥90% (docs/06)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Package floor (shared is tiny; worker package total may lag SPA shell)
PKG_LINES_MIN="${1:-50}"
PKG_FUNCS_MIN="${2:-50}"
# Domain floor (lib/middleware/repos/routes) — docs/06
DOMAIN_LINES_MIN="${3:-90}"
DOMAIN_FUNCS_MIN="${4:-90}"

run_cov() {
  local filter="$1"
  local pkgdir="$2"
  local outdir="$ROOT/$pkgdir/coverage"
  rm -rf "$outdir"
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
console.log('$name package coverage lines='+lines+' functions='+funcs);
if (lines < $PKG_LINES_MIN || funcs < $PKG_FUNCS_MIN) {
  console.error('❌ $name package below gate lines>=$PKG_LINES_MIN funcs>=$PKG_FUNCS_MIN');
  process.exit(1);
}
" || fail=1
done

# Domain gate on worker (lib|middleware|repos|routes) — docs/06; S45R-07 includes routes
if [ -f packages/worker/coverage/coverage-summary.json ]; then
  node -e "
const s=require('./packages/worker/coverage/coverage-summary.json');
const re=/[\\\\/](lib|middleware|repos|routes)[\\\\/]/;
let lc=0,lt=0,fc=0,ft=0;
const rows=[];
for (const [k,v] of Object.entries(s)) {
  if (k==='total') continue;
  if (!re.test(k)) continue;
  if (k.includes('.test.')) continue;
  lc+=v.lines.covered; lt+=v.lines.total;
  fc+=v.functions.covered; ft+=v.functions.total;
  rows.push([k.replace(process.cwd()+'/',''), v.lines.pct, v.functions.pct]);
}
const lines=lt? (lc/lt*100):0;
const funcs=ft? (fc/ft*100):0;
console.log('worker domain coverage lines='+lines.toFixed(2)+' functions='+funcs.toFixed(2));
for (const [f,l,fn] of rows.sort()) console.log('  '+f+' L'+l+' F'+fn);
if (lines < $DOMAIN_LINES_MIN || funcs < $DOMAIN_FUNCS_MIN) {
  console.error('❌ worker domain below gate lines>=$DOMAIN_LINES_MIN funcs>=$DOMAIN_FUNCS_MIN');
  process.exit(1);
}
" || fail=1
fi

exit "$fail"
