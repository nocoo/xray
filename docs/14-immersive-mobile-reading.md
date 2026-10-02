# Immersive mobile reading

## Objective and boundary

Make Channels a reference consumer for Basalt's mobile document layouts without
turning the shared library into an article-specific framework. Mobile reading
uses the page scroll, one compact navigation bar, accessible action disclosure,
and a continuous bright reading surface. Desktop retains its bounded list,
document, and related-link panes.

Basalt owns shell geometry, scroll ownership, safe areas, surfaces, generic header
mechanics, and reusable examples. X-Ray owns routes, action priority, reading
preferences, read state, filters, focus, and reading-position persistence.

## Agreed library contract

- `AppShell layout="responsive"`: document scroll below 768px; bounded desktop
  workspace. `document` and `workspace` are explicit alternatives.
- `AppMain` and `Sidebar` derive their geometry from the shell contract.
- `ContentIsland mobileSurface="edge-to-edge"`: no mobile island inset or rounded
  frame; the desktop island and surface-root semantics remain.
- The application removes its own mobile island-wrapper padding. The library
  never reaches outside its components to override application markup.
- The shell owns safe areas; the HTML document opts into `viewport-fit=cover`.
  Bottom protection belongs to the trailing document, not a fixed empty strip.
- One mobile `AppHeader` may replace the normal framework/page-header pair.
  Desktop can retain `PageHeader`. Sticky navigation must respect the shell's
  top safe area without double-insetting.
- Existing buttons and popovers provide disclosure. Touch targets are at least
  44 CSS pixels; the application chooses primary and secondary actions.

The compact sticky header uses `AppHeader sticky density="compact"` (52px).
`ConfirmDialog.onCloseAutoFocus` lets applications restore the current responsive
action when a layout change has disconnected the original trigger. Ordinary
nonmodal Popover dismissal retains the library's outside-focus behavior.

The final installed release's documentation and declarations are authoritative.
No unpublished API is treated as an installed dependency.

## X-Ray behavior

On mobile channel routes, the shell delegates its navigation bar to the channel
page. Reading shows return-to-reports, a truncated channel name, reading settings,
and more actions. The list substitutes global navigation for the return control.
Global navigation, theme, local environment switching, copying, editing,
deleting, related links, and channel settings remain accessible through disclosure.

The article title, tags, metadata, Markdown, and related links form one document.
Channel description belongs to the list/information context rather than a second
permanent reading header. No content is removed by guessing duplicate Markdown
headings. Filtering, automatic selection, browser history, unread behavior, and
confirmation dialogs retain their existing semantics.

Root scrolling and desktop pane scrolling must both restore the account- and
environment-scoped reading/list positions. Route changes reset unrelated page
scroll; overlays must not overwrite saved reading positions during scroll locks.
The mobile/desktop transition must not strand focus or leave a clipped document.

## Delivery

1. Consolidate mobile reading controls using the currently installed Basalt.
2. Integrate the published generic layout release, update shell/reader scroll
   ownership, and remove the retired mobile header/CSS path.
3. Extend isolated browser journeys to document scrolling, navigation/history,
   menus, dialogs, short/long content, resize, and desktop regression.
4. Run required lint/types/coverage/build, isolated L2/L3, browser acceptance,
   and an independent review. Record commands and remaining evidence gaps.

Basalt publication waits for the owner's 2FA. Prepublication tarball inspection
does not replace verification of the exact published artifact. The owner subsequently authorized an X-Ray patch release after integration
acceptance; release verification is tracked separately from candidate validation. Both repositories keep atomic verified commits.

## Published integration evidence

Published `@nocoo/basalt@2.2.0` is installed and accepted on 2026-10-02. Official
exact-version/latest and allowed-mirror metadata match the frozen archive from
Basalt revision `ac93bca576adc13f4af383250a5a068a0538756d`:

- SHA-1: `0aee32c8bd78c580e6fba156fadaf530550d5a12`.
- SHA-512: `BCaRT0J9Wc8txbzRAj47S/4+zvy99QkiWUX38RD/R+voTtDHKJKVOAKU/sE5gQ8OzHzbF10taBJfZH94TE6iJA==`.
- All 395 installed files byte-match the archive. Only Basalt changes in the
  dependency lock; no temporary registry URLs or unrelated transitive updates.
- Bun 1.3.14 frozen installation passes. Integration commit: `07ff9a7`;
  isolated-runtime banner-check fix: `685c9a9`.

| Check | Installed-version evidence |
| --- | --- |
| Static/build | Normal pre-commit lint and typecheck pass; production build passes (existing Vite chunk-size advisory remains) |
| Unit/coverage | 923 tests; all four metrics exceed 95% in shared, Worker and UI |
| L2 | 41/41 tests and all 62 declared routes pass; owned state cleaned |
| L3 | 36/36 pass in 4.8 minutes: Chromium full application plus WebKit channel/filter/link journeys |
| Chrome/Caddy | Chrome 154, `https://xray.dev.hexly.ai`, disposable E2E demo catalog; light/dark at 390px and 1440px; zero page errors or horizontal overflow |
| Root geometry | One 52px mobile header; main/island/page/panes retain intrinsic long-document height; short article fills the reading surface |
| Interaction | Typography, secondary actions, outside-focus dismissal, modal cancellation, responsive trigger replacement, history and paginated list restoration |
| Scanners | Published dependency lock passes OSV; repository history and staged changes pass gitleaks |
| Review | Independent source, installed-file/lock comparison and runtime follow-up reviews have no remaining P0-P3 findings |

Coverage percentages (statements / branches / functions / lines):

| Package | Coverage |
| --- | --- |
| Shared | 98.34 / 96.28 / 100 / 99.21 |
| Worker | 98.62 / 96.21 / 97.22 / 99.70 |
| UI | 98.86 / 96.67 / 99.03 / 99.46 |

Scoped Chrome captures and their manifest are in the ignored local evidence
folder `reports/immersive/2026-10-02/`. Earlier candidate tests were repeated
against the installed published package; candidate success alone was not used
as publication proof.

The first installed-version L2 attempt timed out after Wrangler logged successful
local migrations. The installed CLI's banner update-check kept a registry socket
open. `isolatedEnv` now sets its supported `WRANGLER_HIDE_BANNER=true`, with a
regression test; the existing timeout, database/authentication guards and quality
gates are unchanged. This suppresses that banner request, not every possible
Wrangler network request. Native L2 and the scoped Chrome capture pass afterward.

## Remaining acceptance

The owner authorized an X-Ray Z+1 release (`2.5.6` to `2.5.7`) after integration
acceptance. Exact-revision CI, deployment and both-host health evidence must be
recorded by the release workflow; local checks do not prove remote execution.

The supplied iPhone Safari screenshot remains baseline evidence. WebKit automation
does not replace physical iPhone acceptance for dynamic browser chrome, rotation,
text enlargement, bottom-of-document reachability, keyboard and back navigation.
No live content mutation or physical-device verification is claimed here.
