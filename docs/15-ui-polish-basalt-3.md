# Basalt 3.1 UI polish

## Scope

X-Ray pins `@nocoo/basalt` to 3.1.0. Package metadata and the downloaded tarball
were checked against the published SHA-512 integrity; the local Basalt reference
was revision `2f00298da19cebfacba8909c58dda3b19ca42005`. The default corporate
mirror was stale, so installation used a temporary Yarn registry. The committed
lockfile keeps registry-neutral package entries and only updates Basalt's dependency
closure. No local tarball or sibling repository is required to install X-Ray.

## Composition

The visual reference is `../zhe/components/dashboard/feature-card.tsx` and its
statistic/empty-state compositions, not its application-specific wrappers.
`SectionLabel` adds a decorative 1.5-stroke Lucide icon in a compact semantic tile
to existing Basalt PageHeader and section slots. Watchlists use blue, groups and
integration use teal, tokens/tags use amber, channels use rose, and account chrome
uses neutral. Labels and accessible names remain textual; actions retain their
existing behavior. Empty states and repeated actions use matching Lucide symbols.

Primary statistics retain the bright surface in both themes. Basalt 3 now paints
StatCard through LayerCard's unlayered surface selectors, so explicit bright utility
priority is intentional for these cards and corresponding skeletons. Other card
surfaces continue to use the normal L1/L2/L3 cascade. Table numeric and action
columns use 3.1's logical `textAlign="end"` contract. Mobile channel readers retain
their existing compact AppHeader instead of gaining duplicate decorated chrome.

## Verification

Run the ordinary lint, typecheck, coverage, build and managed L3 commands in
AGENTS.md. `e2e/ui-polish.pw.ts` covers canonical management routes, decorative
heading semantics, bright statistics in both themes, 320px overflow and desktop
sidebar avatar containment. Existing reader/filter/focus tests remain mandatory.
Local Chrome acceptance uses the Caddy HTTPS endpoint and disposable E2E data,
never Prod. Screenshots are run artifacts under `reports/ui-3.1.0/`, not fixtures
or evidence of production deployment.

On 2026-10-14, lint and typecheck passed; 950 unit tests passed with all four
coverage metrics above 95% in each package. The native L2 suite passed 44/44 with
65/65 route inventory coverage. The managed Chromium/WebKit L3 suite passed
42/42, including the new page hierarchy checks in both engines. OSV reported no
issues in the 519-package lockfile scan. These are local results, not CI or
deployment claims.
Headful Google Chrome 155 acceptance at `https://xray.dev.hexly.ai` covered all
11 canonical page routes in light/dark themes at 1440px, 390px and 320px: no
document/island horizontal overflow and no page errors. Primary light-theme
statistics render white; mobile reading keeps its single compact header.
