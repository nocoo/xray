# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-02-28

### Added

- **Watchlist feature** — full CRUD for watchlist members with tag-based grouping, seed script with 15 AI/ML Twitter accounts, and comprehensive test coverage
- **AI settings** — provider registry (OpenAI, Anthropic, Google, GLM, DeepSeek, Grok, Ollama), settings page with sidebar nav, KV table for config persistence
- **Fetched posts pipeline** — POST `/api/watchlist/fetch` route with tweet dedup via UNIQUE index on `(user_id, tweet_id)`, batch insert with `onConflictDoNothing`, SQL `count()`
- **SSE streaming** — real-time fetch progress via Server-Sent Events with per-member status updates
- **AI translation** — 信达雅-style Chinese translation with editorial comment (锐评) from a world-class editor's perspective; per-card translate button for on-demand single-post translation
- **Quoted tweet support** — full quoted tweet display (avatar, verified badge, timestamp, text, media, metrics) and translation with `[引用翻译]` section; new `quoted_translated_text` DB column
- **Media proxy** — server-side proxy at `/api/media/proxy` to bypass Twitter CDN hotlink protection (Referer/Origin blocking)
- **Retention system** — `retentionDays` setting with auto-purge in fetch route, `purgeOlderThan` repository method
- **Fetch logs** — `fetch_logs` table with DB persistence, API route, and logs page
- **Test coverage** — translation service unit tests, fetched-posts repository tests, fetch-logs repository tests, API route tests (fetch, settings, posts, translate), E2E tests for auto-fetch lifecycle and media proxy endpoint, real LLM round-trip E2E tests for AI settings via GLM

### Changed

- **Row-first masonry layout** — replaced CSS `columns` (column-first fill) with `useColumns()` hook using `matchMedia` for responsive breakpoints (1/2/3/4 cols) and round-robin distribution
- **Posts tab** — renamed from previous tab name, constrained post cards to `max-w-2xl`, replaced translation overlay with inline text swap and zh/en toggle
- **Member card avatars** enlarged to 1.6x (90px)
- **Language toggle** moved from global to per-post card button; default post language is `zh`
- Posts sorted by `tweetCreatedAt` (newest tweet first) instead of `fetchedAt`
- Webhooks and AI prompt extracted into dedicated `/webhooks` page
- GLM model updated from `glm-4.5` to `glm-4.7`

### Fixed

- Twitter GIFs rendered as looping `<video>` instead of broken `<img>` tags; VIDEO click propagation fixed
- Card border unified across tweet/comment/action bar with subtle shadow
- Fade-out mask on metrics row when card width is narrow
- Sidebar pathname deferred to avoid SSR hydration mismatch
- Select dropdowns use `appearance-none` with custom chevron icon; padding adjusted to prevent arrow clipping
- Safe `ALTER TABLE` migrations for `fetch_interval_minutes`, `comment_text`, and `quoted_translated_text` columns on pre-existing databases
- vinext compatibility: use plain `Request` instead of `NextRequest` in route handlers (`new URL(req.url).searchParams`)
- Redundant AI prefix removed from watchlist tag names
- Tweet author and metrics corrected in watchlist report
- Stale `eslint-disable` comments for missing `react-hooks` plugin removed
- Husky hooks updated to include missing test files

## [1.1.0] - 2026-02-26

### Added

- **vinext migration** — replaced Next.js 16 with vinext 0.0.9 (Vite 7 + RSC), enabling faster builds and HMR
- **Explore API E2E tests** — 12 tests covering 4 explore routes with 400 validation
- **Usage API E2E tests** — 6 tests covering usage route with days parameter boundary testing
- **Auth enforcement E2E tests** — 16 tests using dedicated no-auth server (port 17029), verifying 13 API routes return 401 and 3 public routes remain accessible
- **Playwright functional E2E tests** — 10 browser tests for dashboard, analytics, usage, tweet detail, user profile, and settings
- **No-auth E2E server** — `setupNoAuthE2E()` / `teardownNoAuthE2E()` in setup.ts for testing 401 enforcement without auth bypass

### Changed

- **Unit test coverage raised to 97.72% lines / 94.46% functions** (up from ~70%), 731 tests with 1741 assertions
- **Total test count: 888** (731 UT + 132 API E2E + 25 Playwright browser E2E)
- Build system switched from `next build` / `next dev` to `vinext build` / `vinext dev`
- Dockerfile updated for vinext standalone output structure
- ESLint config migrated from `eslint-config-next` to standalone flat config
- `src/db/index.ts` uses top-level `await import()` instead of `require()` for vinext ESM compatibility
- Dynamic route pages use `useParams()` instead of `use(params)` prop for vinext null-prototype params compatibility
- `src/app/layout.tsx` uses default import for `next/font/google` to work with vinext's Proxy-based font shim
- Usage route handler uses `new URL(req.url).searchParams` instead of `req.nextUrl` for vinext compatibility

### Fixed

- `require()` crashes in vinext RSC environment — replaced with top-level `await import()`
- `next/font/google` named import fails for `DM_Sans` — switched to default import with Proxy resolution
- `next-auth` v5 route handler missing `nextUrl` — added `Request` → `NextRequest` wrapper
- Vite dev server blocks custom domains — set `server.allowedHosts: true`
- 8 stale `@next/next/no-img-element` eslint-disable comments removed after `eslint-config-next` removal
- Type errors in tweapi-provider tests resolved

## [1.0.1] - 2026-02-26

### Added

- **Playwright browser E2E** — 15 smoke tests covering all pages, sidebar navigation, tweet/user search flows, and settings rendering
- **Test coverage reporting** — `bun run test:coverage` with 70% line/function threshold via `bunfig.toml`
- **ViewModel hooks** — `useFetch`, `useSearch`, `useMutation` in `src/hooks/use-api.ts` for clean data-fetching patterns
- **Shared feedback components** — `ErrorBanner`, `EmptyState`, `LoadingSpinner`, `StatusMessage`, `SectionSkeleton` in `src/components/ui/feedback.tsx`
- **XRayAPIClient** — production API client for scripts using webhook key auth
- Unit tests for `normalizeCredits` and `normalizeCreditsUsage`

### Changed

- All 6 page components migrated from inline `useState`+`useEffect`+`fetch` to ViewModel hooks (`useFetch`/`useSearch`)
- Settings page uses shared feedback components instead of local duplicates
- ESLint coverage extended to `agent/` and `scripts/` directories (previously ignored); all 54 warnings fixed
- Credits API calls now routed through `normalizer.ts` anti-corruption layer (`normalizeCredits`, `normalizeCreditsUsage`)
- `TweAPIProvider.request()`/`requestGet()` deduplicated into shared `_fetch()` method
- `scripts/lib/types.ts` de-duplicated — now re-exports from `shared/types.ts`
- Playwright test files use `*.pw.ts` naming to avoid `bun test` discovery conflict
- Pre-push hook now runs Playwright browser E2E in addition to API E2E + lint

### Removed

- Legacy Hono server and unused `XRayClient`
- `TwitterAPIClient` and legacy TweAPI type files (scripts migrated to `XRayAPIClient`)
- Dead `server/` reference from Husky hooks

### Fixed

- Non-null assertion errors in `mock-provider.test.ts` and `normalizer.test.ts` (pre-existing TS strict mode violations)
- Husky hooks now include all test directories (`src/__tests__/twitter/`, `src/__tests__/components/`, `src/__tests__/version.test.ts`)

## [1.0.0] - 2026-02-25

### Added

- GitHub repository link in header toolbar
- README rewritten to match project standards (centered logo, badges, structured sections)

### Fixed

- Sidebar logo jitter on expand/collapse — aligned collapsed padding with expanded state

### Changed

- Version bumped to 1.0.0 (stable release)
- Removed stale files: `package-lock.json`, `.pre-commit-config.yaml`, `AGENT.md`, `data/analyze_output.json`

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
