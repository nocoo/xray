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
  createdAtMs: number; articleCount: number;
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

## Reader

Routes: `/channels`, `/channels/:channelId`, `/channels/:channelId/articles/:articleId`. The list and document scroll independently. On narrow screens, show one pane at a time. URL navigation preserves the channel, date filter and selection; session-local reading positions restore on back/forward and reload. New requests cannot overwrite a later navigation. Loading or errors must not erase an already open report.

Use Basalt controls and existing theme tokens. Render GFM with `react-markdown` and `remark-gfm`, without raw HTML or MDX. Images accept only HTTPS external URLs, retain aspect ratio, lazy load and show alternative text on failure. Tables and code scroll within the document. Links use safe protocols and new-tab isolation.

Typography follows Kami and GeekHub: Chinese `TsangerJinKai02`, English Charter, 18px body, 1.65 line height, maximum prose width around 680px. Interface text stays sans serif; code stays monospace. Reuse GeekHub's local WOFF2 subsets and preserve its font notice; these font assets are not MIT licensed. Provide serif/sans and size preferences. Keep the title and byline compact above the document to avoid adding another column.

Keyboard: J/K and list Up/Down select articles, Enter focuses the document, Escape returns focus to the list (and returns to it on mobile). Preserve native document scrolling. Ignore input fields, contenteditable, IME composition, modifier combinations, dialogs and menus. Background UI updates preserve selection and scroll.

## Delivery checklist

- [ ] Shared contracts, D1 migration, channel/key/ingest routes and L1 tests.
- [ ] Sidebar, management UI, Markdown reader, keyboard/position behavior and L1 tests.
- [ ] Canonical ingest hostname across local configuration, scripts, tests and docs.
- [ ] Mock channel reports with representative Chinese Markdown.
- [ ] L2 real HTTP authorization, idempotency and pagination coverage.
- [ ] L3 isolated browser workflow, Chinese font, responsive layout and keyboard checks.
- [ ] Review, quality gates, atomic commits and Caddy preview.
- [ ] Production domain/migration/deployment (not authorized in this implementation run).
