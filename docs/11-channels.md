# Channels

## Accepted scope

Channels collect Markdown reports from authenticated producers. Channels appear below Groups in the sidebar. A key belongs to exactly one channel; a channel can have multiple named keys. Markdown and metadata are stored in D1. Images remain HTTPS links loaded directly by the reader; there is no upload, proxy, or image storage for channel content.

The browser uses Access authentication. Producers use the canonical `https://xray-ingest.worker.hexly.ai` host and Bearer authentication. This hostname change is local configuration until a separately authorized deployment switches the custom domain and producer configuration. Browser routes remain unavailable on the ingest host. Channel keys have only `articles:write`; existing watchlist keys retain their existing scopes.

## API contract

Browser responses use the existing `{ success: true, data: ... }` envelope. Identifiers are positive integers. All queries and mutations are tenant scoped.

| Method | Path | Request / data |
| --- | --- | --- |
| GET | `/api/channels` | `Channel[]` |
| POST | `/api/channels` | `{ name, description? }` / `Channel` |
| PUT | `/api/channels/order` | `{ ids: number[] }`, complete unique tenant-owned set / ordered `Channel[]` |
| DELETE | `/api/channels/:id` | `{ deleted: true }`; cascades reports and keys |
| PATCH | `/api/channels/:id` | `{ name, description? }` / `Channel` |
| GET | `/api/channels/:id/articles` | Query `date=YYYY-MM-DD`, `before=<article id>`, `limit` (default 30, max 100); `ArticlePage` |
| GET | `/api/channels/:id/articles/:articleId` | `ChannelArticle` |
| GET | `/api/channels/:id/keys` | `ChannelKey[]`, active keys only |
| POST | `/api/channels/:id/keys` | `{ label }` / `ChannelKey & { token: string }` |
| DELETE | `/api/channels/:id/keys/:keyId` | `{ revoked: true }` |
| POST | `/api/v1/ingest/articles` | `ArticleInput` / `{ id, channelId, url, duplicate }`; 201 new, 200 duplicate, 409 conflicting content |

```ts
type Channel = {
  id: number; name: string; description: string | null;
  createdAtMs: number; articleCount: number; sortOrder: number;
  activeKeyCount: number; latestReportDate: string | null; lastReceivedAtMs: number | null;
};
type ChannelKey = {
  id: number; channelId: number; label: string; tokenPrefix: string;
  createdAtMs: number; lastUsedAtMs: number | null;
};
type ArticleInput = {
  external_id: string; title: string; report_date: string;
  markdown: string; summary?: string; author?: string;
};
type ChannelArticleSummary = {
  id: number; channelId: number; externalId: string; title: string;
  reportDate: string; summary: string | null; author: string | null;
  sourceLabel: string; createdAtMs: number;
};
type ChannelArticle = ChannelArticleSummary & { markdown: string };
type ArticlePage = { items: ChannelArticleSummary[]; nextCursor: number | null };
```

The key, not request fields, determines the tenant and channel. Capture the source label at submission. Uniqueness is `(channel_id, external_id)`; an identical retry returns the original record, while different content returns 409 and never replaces a report. A different key must not impersonate the original source on a duplicate. Dates are valid calendar dates, independent of receipt timestamps and watchlist rolling windows. Sort by `report_date DESC, id DESC`; cursor lookup and date filters preserve that order. Required limits: title 240 characters, external ID 160, summary 1000, author 120, Markdown 512 KiB UTF-8, total body 1 MiB. Plaintext keys are one-time-only; hashes and revocation reuse existing token infrastructure.

## Management

`/channels` is the management page, linked immediately above Settings. Dynamic reading links remain below Groups. The page provides creation, search, report/token totals, latest report dates, and keyboard-accessible up/down ordering. Sort order is stored per tenant and applied to the sidebar. New channels append to the end; full-set ordering and its response run in a single D1 transaction, rejecting stale or cross-tenant sets without partial writes.

`/channels/:channelId/settings` contains the editable name/description, channel statistics, multiple named push tokens, copyable submission examples and individual revocation. Deleting a channel requires confirmation and cascades its reports and keys; revoking a key keeps existing reports. Global Settings contains account and AI configuration. Existing watchlist producer tokens retain their browser-authenticated API and scopes, with no global token UI.

## Reader

Routes: `/channels/:channelId`, `/channels/:channelId/articles/:articleId`. Entering a channel selects its first report after the matching list loads; explicit article links stay selected. The list and document scroll independently. On narrow screens, show one pane at a time. URL navigation preserves the channel, date filter and selection; session-local reading positions restore on back/forward and reload. New requests cannot overwrite a later navigation. Loading or errors must not erase an already open report.

Use Basalt controls and existing theme tokens. Render GFM with `react-markdown` and `remark-gfm`, without raw HTML or MDX. Images accept only HTTPS external URLs, retain aspect ratio, lazy load and show alternative text on failure. Tables and code scroll within the document. Links use safe protocols and new-tab isolation.

Typography follows Kami and GeekHub: Chinese `TsangerJinKai02`, English Charter, 18px body, 1.65 line height, maximum prose width 1020px, or full available width. Interface text stays sans serif; code stays monospace. Reuse GeekHub's local WOFF2 subsets and preserve its font notice; these font assets are not MIT licensed. Provide serif/sans, size and width preferences. PageHeader places outlined Lucide controls for font, size, width and channel settings in one row at the top right; the reader has no floating toolbar or date picker. Keep the title and byline compact without reserved toolbar clearance. PageHeader supplies the page title and subtitle. Channel management and settings use the brightest Basalt surface for statistics and restrained Lucide accents for titles, metrics and sections.

Keyboard: J/K and list Up/Down select articles, Enter focuses the document, Escape returns focus to the list (and returns to it on mobile). Preserve native document scrolling. Ignore input fields, contenteditable, IME composition, modifier combinations, dialogs and menus. Background UI updates preserve selection and scroll.

## Delivery checklist

- [x] Shared contracts, D1 migration, channel/key/ingest routes and L1 tests.
- [x] Sidebar, management UI, Markdown reader, keyboard/position behavior and L1 tests.
- [x] Canonical ingest hostname across local configuration, scripts, tests and docs (`691dbe4`, pre-commit checks passed).
- [x] Mock channel reports with representative Chinese Markdown (two channels, seven reports, revoked fixture keys; idempotent seed check passed).
- [x] L2 real HTTP authorization, idempotency and pagination coverage (23 tests passed, 51/51 routes, local-only).
- [x] L3 isolated browser workflow, Chinese font, responsive layout and keyboard checks (14 tests passed, including three Channels journeys).
- [x] Review, quality gates, atomic commits and Caddy preview.
- [ ] Production domain/migration/deployment (authorized for v2.4.0; follow the cutover checks below).

## Management revision

- [x] Dedicated management/settings pages, named channel tokens, deletion, persistent ordering and statistics.
- [x] Automatic first-report selection, header-aligned reader preferences, 1020px/full-width control, shared page titles and aligned watchlist tabs.
- [x] Isolated L2/L3, desktop/mobile visual review, final commit gates and Caddy preview.

## Production cutover

The local implementation does not change DNS, Cloudflare Access, remote D1 or existing producer secrets. At deployment, apply migrations `0003_channels.sql` and `0004_channel_sort_order.sql`, bind the canonical machine hostname to the production Worker, verify that it does not require an interactive Access login, and verify its certificate. Browser Access protection and the ingest route allowlist must remain enforced. Update the existing producer's `XRAY_INGEST_BASE` and scheduled invocation together with deployment; the new Worker does not retain the old hostname as a compatibility path. Verify both-host health, one authenticated ingest request and browser-only route rejection before resuming producers.

## Verification

Run the existing lint, strict typecheck, coverage and build gates. L2 uses `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN bun run test:l2`; serialize it because its existing harness owns a fixed test directory and temporarily supplies test environment variables. Browser tests require a separate local Worker with fresh SQLite state and a verified `_test_marker`, plus a separate Vite port. Never point automated tests at Product or the daily Mock store. Preview the completed application in Chrome through `https://xray.dev.hexly.ai`.

Verified locally on 2026-09-22 after the management revision:

| Package | Tests | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: | ---: |
| Shared | 167 | 98.26% | 96.16% | 100% | 99.17% |
| Worker | 354 | 98.66% | 95.67% | 97.56% | 99.73% |
| UI | 146 | 99.54% | 97.12% | 99.53% | 99.86% |

All 667 unit tests passed with unchanged coverage configuration and thresholds. Removing the retired global token UI also removed its unused API/VM and three tests. Strict typecheck, lint and the complete production build passed. Biome reports an existing schema-version information message; Vite reports a bundle-size warning. Dependencies are unchanged from the original delivery, whose OSV scan found no issues across 496 packages.

L2 passed 28 real HTTP tests and the 53-route inventory. Coverage includes full-set ordering, concurrent creation, atomic failure, cross-tenant isolation, statistics, key revocation, and cascading channel deletion. The raw HTTP test helper now frames request bodies with Content-Length, including DELETE bodies.

L3 passed all 16 browser tests with explicit ports 17007/28787 and a verified temporary test-marked D1 store. Channels journeys exercise dedicated management, profile editing, persistent sorting, confirmation/cancellation, deletion, named tokens, clipboard examples, automatic first-report selection, Chinese font glyph rendering, Markdown safety, keyboard/focus, date filters, history restoration and width persistence. Desktop and 390px/320px reader geometry checks cover toolbar/title clearance and viewport overflow. Management/settings and watchlist headers were also visually inspected on desktop and mobile.

Implementation commit: `7fe7bd7`. Its pre-commit lint, strict types, all four coverage floors and staged secret scan passed. The test servers, verified temporary test store and task-owned panes were removed. The daily Mock stack was restarted with migration 0004, and Google Chrome opened `https://xray.dev.hexly.ai/channels`. A read-only Caddy smoke check confirmed management, automatic selection of the first report and channel settings with no page errors or mutation requests. Production remains unchanged until the cutover above.

### Visual refinement

The header icon row, bright statistics and Lucide accents passed all 16 isolated L3 tests on 2026-09-22. Checks include font family/size limits and persistence, full-width persistence, mobile return navigation, and consuming Tooltip Escape before the reader shortcut. A read-only Chrome preview through Caddy verified light/dark surfaces and 1440px/320px layouts with no page errors, horizontal overflow or API mutations. The management metrics remain aligned when their labels wrap.
