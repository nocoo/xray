# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2026-02-25

### Fixed

- Credits API returns 503 with red error when user has no TweAPI key — now shows friendly "Configure your TweAPI Key" empty state
- Docker build fails on `better-sqlite3` native module — added `python3 make g++` build tools and `trustedDependencies` in `package.json`
- Credits page crashes with `toLocaleString() of undefined` — added three-layer defense: provider fallback defaults, data type validation, render-time nullish coalescing

## [0.2.1] - 2026-02-25

### Added

- **Dashboard API full integration** — all 20 TweAPI endpoints (18 Twitter + 2 Credits) now accessible from the dashboard
- **Sidebar navigation** — reorganized into "Explore World" (public, API-key-only) and "My Account" (cookie-required) groups
- **Tweets module** — `/tweets` search page, `/tweets/[id]` detail page with reply thread, shared `TweetCard` component
- **Users module** — `/users` search page, `/users/[username]` profile page with 5 tabs (Recent, Timeline, Replies, Highlights, Search), `/users/[username]/connections` page with Followers/Following/Affiliates tabs, `UserCard` component
- **My Account pages** — `/bookmarks`, `/likes`, `/lists` pages with existing provider methods; `/messages` inbox and `/messages/[conversationId]` conversation thread pages
- **Credits integration** — credits balance card on Settings page, credits usage breakdown panel on Usage page
- **Provider layer** — 11 new `ITwitterProvider` methods: `getTweetReplies`, `getUserTimeline`, `getUserReplies`, `getUserHighlights`, `getUserFollowers`, `getUserFollowing`, `getUserAffiliates`, `getInbox`, `getConversation`, `getCredits`, `getCreditsUsage`
- **API routes** — 18 webhook-auth routes (`/api/twitter/`), 16 session-auth routes (`/api/explore/`), 2 credits routes (`/api/credits/`)
- **Testing** — 315 tests (99 E2E, 22 mock-provider, 16 sidebar), 945 assertions, 0 failures
- **Deployment** — Dockerfile for standalone deployment, Railway support with volume-mounted SQLite, `XRAY_DATA_DIR` env var
- **Version management** — `src/lib/version.ts` reads from `package.json`, displayed in sidebar badge and `/api/live` endpoint

### Changed

- Sidebar restructured from flat `navItems` to grouped `navSections`
- `TweAPIProvider` now supports both POST (`request()`) and GET (`requestGet()`) methods

### Removed

- Legacy `/explore` and `/explore/user/[username]` page routes (replaced by `/tweets`, `/users`, `/users/[username]`)

### Fixed

- `bun:sqlite` module resolution in E2E tests (use `bun --bun next dev`)
- `next dev` crashes with `Cannot find module 'bun:sqlite'` — added `better-sqlite3` fallback with `isBun` runtime detection (aligned with surety/life.ai pattern)
- Explore route `GET /api/explore/users/tweets` now correctly handles the `q` query parameter
- Next.js standalone `HOSTNAME=0.0.0.0` binding for container deployments
- Railway DOCKERFILE builder exec-mode `startCommand` issue

## [0.2.0] - 2026-02-25

### Added

- Version management with sidebar badge and `/api/live` version field
- Logo with resize script, favicon, sidebar/login/loading screen branding
- My Analytics page with time-series charts and metric overview cards
- User lookup page with profile card, tweets, and explore mode toggle
- Tweet explorer with search, rich cards, and session-based provider access
- Usage stats dashboard with daily trend and endpoint breakdown charts
- Twitter API routes (webhook-auth): tweets search/details, user info/tweets/search, me/analytics/bookmarks/likes/lists
- Shared Twitter route handler with webhook auth and error mapping
- Multi-tenant provider factory with user credential lookup
- Twitter provider layer with TweAPI client, mock provider, and normalizer
- E2E test infrastructure with mock provider on port 17027
- API documentation and AI agent prompt section in Settings page
- Dockerfile for standalone deployment with static assets
- `XRAY_DATA_DIR` support for Railway volume-mounted SQLite

### Fixed

- JWT sessions now persist users to SQLite via `ensureUserExists()`
- E2E auth bypass in both middleware and API auth layer
- Empty response body handling in credentials save
- `better-sqlite3` removed in favor of `bun:sqlite` exclusively
- `HOSTNAME=0.0.0.0` for container deployments
