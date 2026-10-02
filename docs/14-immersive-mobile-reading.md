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

## Verification status

The source implementation and published Basalt 2.2.0 installation are complete;
final installed-version acceptance is in progress.
Prepublication checks use an owned snapshot and an integrity-verified draft
tarball, never a replacement of the live consumer's installed dependency.

| Check | Prepublication evidence (2026-10-02) |
| --- | --- |
| Static | X-Ray source lint passes; isolated draft typecheck passes |
| Unit/coverage | 922 tests; all four metrics exceed 95% in shared, Worker and UI |
| L2 | 41 tests and all 62 declared routes pass; owned state cleaned |
| L3 | 36/36 pass: Chromium full application plus WebKit channel/filter/link journeys |
| Chrome/Caddy | Real Chrome 154, `https://xray.dev.hexly.ai`, disposable E2E demo catalog; light/dark at 390px and 1440px; zero page errors or horizontal overflow |
| Root geometry | One 52px mobile header; main/island/page/panes retain intrinsic long-document height; short article fills the reading surface |
| Interaction | Typography, secondary actions, outside-focus dismissal, modal cancellation, responsive trigger replacement, history and paginated list restoration |
| Scanners | Baseline lockfile OSV and history gitleaks pass; recheck the final dependency lock |
| Review | Independent source findings resolved; final installed revision review remains pending |

This is draft evidence, not publication or exact-release acceptance. The supplied
iPhone Safari screenshot is baseline evidence; fixed-size Chromium screenshots
are not proof of Safari's dynamic browser chrome. WebKit automation supplements,
but does not replace, iPhone acceptance with expanded/collapsed browser chrome,
rotation, text enlargement, bottom-of-document reachability, keyboard, and back
navigation. CI execution and production deployment are not claimed.

The frozen final 2.2.0 candidate at Basalt revision
`ac93bca576adc13f4af383250a5a068a0538756d` was subsequently verified in the same
isolated consumer: build, typecheck, all 922 unit tests/coverage, and all 36 L3
journeys passed (5.7 minutes). Its archive SHA-1 is
`0aee32c8bd78c580e6fba156fadaf530550d5a12`.

After the owner completed npm authentication, official exact-version/latest and
allowed-mirror metadata confirmed 2.2.0 with matching SHA-1 and SHA-512. X-Ray
installed the published version using Bun 1.3.14 and verified all 395 package
files against the frozen archive. Only Basalt changes in the dependency lock;
temporary mirror resolutions are removed. Frozen installation and production
build pass. The full final gates and the authorized v2.5.7 release follow.
