# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.8] - 2026-06-12

### Added
- Upgrade /api/live to surety standard
- Add /api/live liveness check endpoint (#15)
- Add fade-up entry animations with staggered delays
- Add base skeleton.tsx component

### Changed
- Revert "chore(deps): upgrade vinext to 0.1.1 and vite to 8.0.16"
- Upgrade shadcn to 4.11.0
- Upgrade radix-ui to 1.5.0
- Upgrade vinext to 0.1.1 and vite to 8.0.16
- Upgrade lucide-react to 1.17.0
- Extract Github icon from lucide-react 0.577
- Upgrade @radix-ui/react-collapsible to 1.1.13
- Upgrade @types/react to 19.2.17
- Upgrade eslint to 10.4.1
- Upgrade react and react-dom to 19.2.7
- Upgrade @vitest/coverage-v8 to 4.1.8
- Upgrade vitest to 4.1.8
- Upgrade typescript-eslint to 8.61.0
- Upgrade @ai-sdk/anthropic to 3.0.82
- Upgrade @ai-sdk/openai to 3.0.69
- Upgrade hono to 4.12.25
- Upgrade next to 16.2.9
- Upgrade ai to 6.0.200
- Upgrade next to 16.2.8
- Upgrade next to 16.2.7
- Rebuild better-sqlite3 native binding after --ignore-scripts
- Pass --ignore-scripts to bun install (Shai-Hulud defense)
- Add L2 API E2E to pre-push gate
- Explicitly enable security scanning in base-ci
- Update bun test references to vitest equivalents
- Update test command from bun test to vitest
- Enforce L1 coverage gate in hook and CI
- Use vitest via bun run test
- Raise thresholds to 95/90/95/95 with targeted excludes
- Scope vitest coverage to imported files
- Fix vitest module resolution and bun-only API usage
- Migrate tests/ from bun:test to vitest
- Migrate src/__tests__ from bun:test to vitest
- Replace Bun.file with fs.readFileSync
- Add @ alias resolution for vitest
- Migrate fetch-tweets.test from bun:test to vitest
- Switch test/test:coverage scripts to vitest run
- Add vitest.config.ts mirroring bunfig coverage targets
- Add vitest and @vitest/coverage-v8 as devDependencies
- Fix HTML title language to match UI (xray - Twitter Analytics Dashboard)
- Unify HTML title to "xray - Twitter 数据分析面板"
- Upgrade base-ci to v2026.1
- Add G2 security scanning (gitleaks + osv-scanner)
- Exclude auth-enforcement from L2 runner (needs dual-server = L3 scope)
- Align live-check schema and isolate watchlist suite state
- Use custom L2 job with Node 22 for vinext compatibility
- Enable L2 API E2E using run-e2e-api runner
- Refactor e2e setup.ts to verify-only
- Add scripts/run-e2e-api.ts and test:e2e:api script
- Add coveragePathIgnorePatterns to exclude UI components
- Cover fetch retention/cancel and translate error/retry branches
- Cover seedUser, db proxy, and scripts watchlist helpers
- Cover auth branches and retention/provider fallbacks
- Cover invalid JSON, missing id, and tag ownership branches
- Replace coveragePathIgnorePatterns with coverageInclude
- Add typecheck script + lint-staged
- Retrigger
- Ignore GHSA-458j-xx4x-4375 hono medium CVE
- Upgrade eslint to tseslint strict config
- Brand tracking-tight → tracking-tighter
- Strengthen pre-commit and pre-push hooks
- Migrate to nocoo/base-ci@v2026
- Skip e2e tests in CI (too slow without local server)
- Retrigger CI
- Trigger CI
- Add .gitleaks.toml to allowlist test fixtures
- Fix reusable workflow inputs
- Add GitHub Actions CI workflow
- Migrate dev port 7027 → 7007

### Fixed
- Override qs to >=6.15.2 (CVE)
- Bump hono to 4.12.21 (CVE)
- Resolve transitive CVEs via overrides
- Resolve typecheck errors in test files
- Upgrade dependencies to fix CVEs and clean osv ignores
- Override postcss>=8.5.10 for CVE GHSA-qx2v-qp2m-jg93
- Run vinext via bunx in L2 E2E runner
- Replace border-input with border-border
- Update /api/live test assertions for new response format
- Upgrade hono to fix GHSA-458j-xx4x-4375
- Remove bg-input/border-input from button outline variant (#14)
- Add non-null assertions for noUncheckedIndexedAccess
- Migrate remaining L3 controls in ai-settings and watchlist
- Migrate Input from bg-input to bg-secondary + border-border
- 迁移到 base-ci@v2026，禁用 L2 E2E
- Regenerate lockfile for bun latest
- Complete OSV ignore list for all indirect CVEs
- Ignore hono + minimatch indirect CVEs
- Ignore minimatch + next indirect CVEs
- Ignore remaining indirect next CVEs
- Ignore remaining indirect CVEs via vinext
- Update deps + ignore indirect CVEs
- Split e2e and unit test runs to avoid global state pollution
- Add config file mock setup for CI
- Ensure database is initialized before auth adapter queries
- Remove duplicate closing brace in dashboard JSX
- Add tabular-nums and font-display to stat card values
- Add aria-sort attribute to sortable table headers
- Remove card border+shadow anti-pattern, use bg-secondary
- Dashboard group labels, chevron size, collapsible, and breadcrumb aria per basalt B-2 spec
- Overhaul login page to match basalt spec

### Removed
- Remove stale hono CVE ignores from osv-scanner.toml

## [1.9.4] - 2026-03-24

### Changed
- Add superset run config and tweet export script
- Update retrospective #24 with correct root cause and fix
- Add retrospective #24 — ReadableStream lock in vinext auth

### Fixed
- Exclude all api routes from proxy to prevent body consumption
- Clone request in auth route handler to avoid ReadableStream lock

## [1.9.3] - 2026-03-24

### Changed
- Add superset run config and tweet export script
- Update retrospective #24 with correct root cause and fix
- Add retrospective #24 — ReadableStream lock in vinext auth

### Fixed
- Exclude all api routes from proxy to prevent body consumption
- Clone request in auth route handler to avoid ReadableStream lock

## [1.9.2] - 2026-03-24

### Added
- Add automated release script

### Fixed
- Remove non-null assertions in release script
- Resolve all 21 eslint errors for zero-tolerance L2 lint

## [1.9.1] - 2026-03-15

### Refactored

- **Remove dead code** — deleted unused `auth-context.ts`, `useMutation` hook, `createE2EDb()`, and 4 dead chart/palette exports
- **Extract shared utilities** — consolidated duplicate functions into single shared implementations:
  - `formatCount` (4 copies → 1 in `utils.ts`)
  - `formatTimeAgo` (4 copies → 1 in `utils.ts`, with `compact`/`long`/`coarse` style variants)
  - `estimateTweetHeight` (2 copies → 1 in `utils.ts`)
  - `pMap` (2 copies → 1 in `utils.ts`)
  - `sseMessage` (2 copies → 1 in `api-helpers.ts`)
  - `maskSecret` (2 copies → 1 in `crypto.ts`, with `prefix`/`tail` mode parameter)
  - `formatDate` (2 copies → 1 in `utils.ts`)

### Fixed

- **AI key masking security** — restored conservative tail-only masking for API keys in AI settings (only last 4 chars visible), preventing the prefix exposure introduced by the maskSecret consolidation

### Tests

- 35 new tests covering all extracted shared utilities (`formatCount`, `formatTimeAgo` × 3 styles, `formatDate`, `estimateTweetHeight`, `pMap`, `maskSecret` × 2 modes)

### Docs

- Removed stale `useMutation` references from README, CHANGELOG, and architecture docs

## [1.9.0] - 2026-03-09

### Added

- **Remove button on post cards** — each post card now has a trash icon button (right-aligned, red hover) that deletes the post via `DELETE /api/watchlists/[id]/posts?postId=N` and removes it from the UI instantly
- **90-day retention option** — watchlist settings now support 90-day post retention in addition to the existing 1/3/7/15/30-day options
- **Rich translation progress** — translation pipeline rewritten with sliding-window concurrency and live SSE previews; new `start` and `translating` events provide real-time feedback before each translation completes

### Fixed

- **"Translating 0/0" flash** — eliminated the brief zero-count display that appeared at the start of batch translation
- **`getDb()` test conflict** — resolved module-level database initialization conflict that caused test failures when importing from `@/db`

### Tests

- 8 new `parseSSEBuffer` unit tests covering chunked streaming and edge cases
- 5 new DELETE endpoint API tests (success, 404, 400, cross-watchlist rejection)
- 3 new `deleteById` DB repository tests
- 90-day retention acceptance test
- 7 new route tests for settings and posts endpoints

## [1.8.0] - 2026-03-06

### Documentation

- **Architecture doc rewritten** — reflects current vinext + ScopedDB stack with updated module structure
- **Overview doc updated** — web dashboard as primary purpose, refreshed feature descriptions
- **Run & scripts doc rewritten** — web app workflow as primary, scripts as secondary
- **Config doc rewritten** — environment variables as primary configuration method
- **Deployment doc updated** — vinext build/start commands, TWEAPI_API_KEY env var, fixed version reference
- **API doc updated** — added 8 missing webhook API endpoints (lists, messages, conversation, credits, usage, analytics, bookmarks, likes)
- **README refreshed** — added missing features (lists, AI settings, webhooks, usage), test scripts, and docs reference
- **Project structure tree updated** — all pages, services, and directories reflected
- Removed obsolete migration plan (`07-xray-web.md`)
- Fixed playwright port, eslint version, and pre-push status in testing doc
- Added TWEAPI_API_KEY to `.env.example` and README env vars section
- Fixed Docker volume mount path and added required env vars to deployment doc

## [1.7.0] - 2026-03-06

### Added

- **vinext 0.0.21 upgrade** — 12 versions of fixes from vinext 0.0.9, improving RSC compatibility, font handling, and route handler stability

### Changed

- **ESLint 9 → 10** — major ESLint upgrade with typescript-eslint bumped to 8.56.1
- **AI SDK upgraded** — `ai` and `@ai-sdk/openai` bumped to latest patch versions
- **lucide-react 0.575.0 → 0.577.0** — icon library patch upgrade
- **Semver ranges tightened** — `typescript` narrowed from `^5.0.0` to `^5.9.3`, `vite` from `^7.0.0` to `^7.3.1` to match installed versions
- **Unused dependencies removed** — `@auth/drizzle-adapter`, `zod`, and `@vitejs/plugin-rsc` dropped from package.json

### Fixed

- **TweAPI key leak** — removed hardcoded API key from source; now reads exclusively from `TWEAPI_API_KEY` env var

### Documentation

- README updated with new preview image and refreshed feature list
- TweAPI acknowledgement added to README

### Housekeeping

- Removed one-time migration script (`migrate-profiles.ts`)
- Cleaned up `.bfg-report/` artifacts and added pattern to `.gitignore`

## [1.6.1] - 2026-03-05

### Fixed

- **Masonry column breakpoints** — evenly spaced 3/4/5-col breakpoints at 512px intervals (1024/1536/2048) for balanced coverage across screen sizes; raised tall-screen bonus threshold to 5+ base cols so that the 4-column range is no longer skipped

## [1.6.0] - 2026-03-05

### Added

- **Unified TweetCard action bar** — every tweet card now displays a consistent bottom bar with Open (external link), Translate (inline 信达雅), and zhe.to Save buttons; replaces per-page ad-hoc actions
- **Generic `/api/translate` endpoint** — standalone translation route for any tweet by ID, decoupled from the watchlist pipeline
- **Linkify tweet text** — URLs in tweet text (t.co and other https links) are now clickable with external link styling
- **Photo hover zoom overlay** — magnifying glass icon appears on hover over photo grid items
- **Quoted tweet author clickable** — quoted tweet author name and avatar now link to the user's X profile with external link icon
- **Masonry layout for bookmarks & likes** — bookmarks and likes pages now use the shared `MasonryGrid` component for responsive column layout
- **Batch edit mode for groups** — group detail page supports multi-select members with batch delete
- **`followers.js` export format** — twitter export parser now supports `followers.js` in addition to `following.js`
- **User-paced batch resolution** — import dialog uses cooldown timer between batches and deduplicates by `twitterId` to avoid redundant API calls

### Changed

- **`(dashboard)` route group** — all authenticated pages moved into `src/app/(dashboard)/` with a shared `layout.tsx` and `useBreadcrumbs` hook, replacing per-page `<AppShell>` wrappers
- **WatchlistPostCard simplified** — delegates rendering and action bar entirely to `TweetCard`, reducing the component to a thin wrapper
- **Tweet type badges relocated** — Reply, Quote, and Retweet badges moved from inline to the card's top-right corner
- **Author row streamlined** — external link icon removed from the tweet card author row (now available in the action bar)
- **Watchlist header compressed** — 5-zone header consolidated into a single toolbar row

### Fixed

- **Route group import paths** — 15 TypeScript errors across 10 files from the `(dashboard)` migration; all `shared/types` relative imports updated for the extra nesting level, and `@/app/watchlist/` alias corrected to `@/app/(dashboard)/watchlist/`
- **Watchlist member CRUD reactivity** — member add/edit/delete now uses local state updates instead of triggering a full page reload
- **Twitter export parser** — handles unquoted JS keys, trailing commas, and numeric IDs (resolves to real usernames before import)
- **Import dedup** — pre-filters export IDs against existing group members to skip already-imported users
- **Batch resolve stability** — reduced batch size to 10, added `AbortController` for instant cancel, removed drop zone opacity flash

## [1.4.0] - 2026-03-04

### Added

- **Activity assessment columns** — Groups detail table now displays Likes, Last Tweet (relative time), and Activity badge (🟢 Active / 🟡 Low / 🔴 Inactive / — Unknown) computed from tweet recency and frequency
- **Enhanced Tweets column** — shows tweet count with average tweets/day calculated from account age
- **Last tweet tracking** — `last_tweet_at` column added to `twitter_profiles` table; populated during profile refresh by fetching the user's most recent tweet via `fetchUserTweets`
- **Add Members page** — dedicated `/groups/[id]/add` page with 3-tab import flow: From Account (fetch following list), Manual (paste usernames), and Import File (drag-and-drop `following.js`)

### Changed

- **Groups detail table enriched** — profile avatars link to X profiles; @username and display name are clickable; Added column right-aligned; User header left-aligned
- **Streaming profile refresh** — refresh button now resolves members one-by-one with live progress instead of batch-then-render
- **Inline add form removed** — replaced by dedicated Add Members page accessible via header button

## [1.3.0] - 2026-03-04

### Added

- **Groups feature** — full CRUD for user-defined groups (`groups` + `group_members` tables), with `/groups` list page and `/groups/[id]` detail page featuring sortable table, search filter, and Twitter export import (drag-and-drop `following.js`)
- **Twitter profile cache** — shared `twitter_profiles` table with `ProfilesRepo` for global caching of Twitter user data; auto-upserts on every `getUserInfo` and batch resolve call
- **Profile refresh** — `POST /api/profiles/refresh` for manual profile snapshot updates; per-member refresh buttons on both Watchlist cards and Groups table rows with spinning indicator
- **Batch user resolution** — `POST /api/explore/users/batch` for bulk username lookup (up to 500); powers import dialogs and profile refresh flows
- **Profile linking** — `link-profiles` API for both watchlists and groups; automatically resolves `twitter_id` FK from cached profiles
- **Import from Twitter export** — drag-and-drop or file picker for `following.js` data export files on both Following and Groups pages; `parseTwitterExportFile()` extracted to shared lib
- **Zhe.to integration** — settings page at `/integrations/zheto` with API key management, and save-to-zheto button in watchlist post-card action bar
- **Quote count metric** — `quote_count` added to tweet card stats row
- **71 new unit tests** — 48 for GroupsRepo/GroupMembersRepo, 23 for ProfilesRepo

### Changed

- **Sidebar restructured** — Watchlists and Groups promoted to top-level collapsible sections (matching `NavGroupSection` style); Following page replaced by Groups; Integrations added as new nav group
- **MemberCard enriched** — displays profile avatar, display name, verified badge, follower count, bio snippet, and tags from cached `twitter_profiles` data
- **Batch resolve limit** raised from 100 to 500 usernames per request

### Fixed

- **TweAPI domain** — migration script corrected from `tweapi.com` to `api.tweapi.io` with proper camelCase field name mapping
- **Batch import errors** — error messages now expose actual server response instead of generic failure text
- **Sidebar section styling** — icons removed from Watchlists/Groups section headers; padding aligned with NavGroupSection

## [1.2.4] - 2026-03-03

### Added

- **ScopedDB class** — user-scoped database access layer (`ScopedDB`) that binds `userId` at construction time, making row-level security correct by construction; eliminates per-repository `userId` parameter passing
- **SQLite adapter for NextAuth** — custom adapter (`auth-adapter.ts`) resolves user identity via `account` table JOIN on `(provider, providerAccountId)`, providing stable user IDs across browsers and sessions
- **Auth context with React.cache** — `getAuthUser()` uses `React.cache` for per-request session deduplication, avoiding redundant `auth()` calls within a single request
- **Full Playwright E2E suite** — smoke tests, auth enforcement for all routes/methods, watchlist CRUD lifecycle, member CRUD with tag flows, settings/AI config/webhook CRUD, and watchlist fetch SSE flow

### Changed

- **Repository → ScopedDB migration** — all API routes, translation service, and 10+ test files migrated from the old repository pattern to ScopedDB
- **Tweet card author row** — split into two lines for improved readability
- **Husky hooks** — restructured to match 4-layer test architecture spec; BDD E2E removed from pre-push hook (run on-demand)
- **Playwright port** — changed L4 playwright port from 17028 to 27028
- **Strict ESLint rules** — added stricter lint rules to eslint config
- Old repository modules deleted (superseded by ScopedDB)

### Fixed

- **Watchlist card instability** — stabilized post cards during fetch/translate pipeline: `pipelinePhaseRef` replaces `pipelinePhase` in useEffect deps, removed `hadCleanup` loadPosts trigger, excluded dynamic fields from masonry height estimation, added post-pipeline reconciliation fetch, and `id DESC` tiebreaker on DB queries
- **User identity resolution** — resolve user by email to prevent cross-browser auth failures caused by NextAuth generating random UUIDs without an adapter
- **Legacy users without account rows** — handle `OAuthAccountNotLinked` error for users created before the adapter migration
- **E2E FK constraint** — seed E2E user row to satisfy foreign key constraints on write operations
- **8 Playwright failures** — strict locators and test isolation fixes for sidebar link ambiguity and cross-file state leaks
- **Non-null assertions** — removed all `!` assertions from production code, agent, and scripts
- **Single video/GIF layout** — render single video or GIF full-width instead of horizontal scroll
- **Container SIGTERM** — bypass bun script runner to avoid SIGTERM error message on container stop

### Documentation

- 4-layer testing improvement plan and batch 2 completion status
- ScopedDB migration retrospective entries (18–23)
- README updated with preview image, vinext badge, and ScopedDB architecture

## [1.2.3] - 2026-03-02

### Added

- **Smart photo grid layout** — tweet media now uses intelligent grid layouts based on photo count: 1 photo full-width, 2 photos side-by-side, 3 photos left-large + right-two-small, 4 photos 2×2 grid; horizontal scroll only kicks in at 5+ photos or mixed media types (video/GIF)
- **Image lightbox** — clicking any photo opens a fullscreen popup with the high-res image, dark overlay (`bg-black/80`), close button, ESC key support, and click-outside-to-close
- **E2E test coverage** — new tests for watchlist detail pages, logs API, AI settings, webhooks pages, and auth enforcement across watchlist/settings/tags routes

### Fixed

- **SSE post overwrite** — `loadPosts` no longer overwrites posts that were injected mid-stream by SSE events
- **Auto-translate on zero new posts** — translation now triggers after fetch even when all posts are deduplicated (`newPosts=0`)
- **E2E stability** — increased pre-push hook timeout to 60s, added port cleanup and server reuse to E2E setup
- Removed unused `totalNewPosts` variable and stale `eslint-disable` comment for undefined `react-hooks` rule

## [1.2.2] - 2026-03-02

### Added

- **Translation concurrency pool** — batch translation now processes up to 3 posts concurrently via `Promise.allSettled`, applied to both SSE stream and `translateBatch()` paths
- **Load-more pagination** — posts page renders 100 posts initially with a "load more" button, reducing DOM bloat and scroll jank on large watchlists
- **Wide-screen column layout** — `useColumns()` hook supports 5 columns (≥1536px) and 6 columns (≥1920px), with a height bonus (+1 col on ≥1200px tall screens, capped at 6)

### Fixed

- **Auto-translate on JSON fallback** — `translateEnabledRef` now synced immediately in `loadData()` (not deferred to useEffect); JSON fallback path in `doFetch` also triggers auto-translate
- **Infinite re-render under vinext** — watchlist list page uses `routerRef` pattern to prevent `useRouter()` instability from causing re-render loops
- **SSE mid-stream loadPosts** — `loadPosts()` deferred until SSE stream completes instead of firing during cleanup
- **25k redundant renders during SSE** — `WatchlistPostCard`, `TweetCard`, and `MemberCard` wrapped in `React.memo`; `displayTweet` IIFE replaced with `useMemo` for referential equality
- **Polling timer rebuilds** — removed `doFetch` from polling timer deps to prevent unnecessary timer teardown/setup
- **useColumns resize overhead** — switched from `resize` event listener to `matchMedia` change listeners for fewer callbacks
- **Filtered members recomputation** — memoized filtered members array to avoid re-computing on unrelated state changes
- **Font size inconsistency** — unified quoted tweets and AI insight to `text-sm`
- **Legacy DB migration** — moved `watchlist_id`-dependent indexes after `safeAddColumn` to fix missing-column errors on pre-existing databases
- **fetch_logs DDL** — removed premature `watchlist_id` from CREATE TABLE and relocated its index after `safeAddColumn`

### Changed

- **Shortest-column masonry layout** — replaced round-robin distribution with shortest-column-first algorithm using estimated card heights for visually balanced columns
- Removed diagnostic `console.log` statements from `initSchema`

## [1.2.1] - 2026-03-01

### Security

- **Cross-tenant data leak** — `findByMemberId` now scoped to `watchlistId`, preventing member posts from leaking across watchlists
- **Cross-watchlist access** — member update/delete and single-post translate routes now validate `watchlistId` ownership
- **SQL injection** — `seedUser()` switched from string interpolation to parameterized queries
- **Tag ownership bypass** — tag assignment on member create/update now validates tags belong to the authenticated user

### Added

- **Auto-translate toggle** — watchlist create/edit dialogs include a `translateEnabled` switch; fetch pipeline respects this setting and skips translation when disabled
- **Page Visibility API** — polling timer pauses when the browser tab is hidden and resumes on focus
- **AbortController** — all in-flight `fetch()` requests are cancelled on component unmount, preventing state updates on destroyed components
- **Settings error feedback** — interval and retention save failures now revert the optimistic UI update and show a 3-second error banner
- **SSE disconnect detection** — fetch and translate SSE streams detect client disconnection and abort expensive server work early
- **Database indexes** — added performance indexes on `fetched_posts(member_id, user_id, tweet_created_at)`, `watchlist_members(user_id, watchlist_id)`, and `fetch_logs(watchlist_id)`
- **Unique constraint** — `(watchlist_id, twitter_username)` uniqueness enforced at DB level to prevent duplicate members

### Fixed

- **Infinite re-render loop** — stabilized `useRouter()` and `members` refs to break `useCallback` → `useEffect` dependency cascade (vinext compatibility)
- **N+1 tag queries** — replaced per-member `getTagsForMember()` with batch `batchGetTagsForMembers()` using `inArray()`
- **JSON.parse crashes** — wrapped 5 locations parsing `tweetJson`/`errors` fields in try-catch to prevent 500 on corrupted data
- **Transaction atomicity** — `setTags()` (delete+insert) and `insertMany()` (batch insert) now wrapped in SQLite transactions
- **Schema ordering** — `fetch_logs` table creation moved before `safeAddColumn` and `migrateToMultiWatchlist` to prevent "no such table" errors on fresh databases
- **safeAddColumn** — non-duplicate-column errors are now surfaced via `console.error` instead of silently swallowed
- Stale `eslint-disable` comments removed; unused variables cleaned up
- Husky hooks updated to include `ui/` test directory

### Changed

- E2E tests rewritten for multi-watchlist API routes
- Watchlist monolith decomposed into listing, detail, and logs pages
- API routes migrated to `/api/watchlists/[id]/*` nested structure
- Dynamic watchlist group added to sidebar with icon picker (24 curated Lucide icons)
- Repository layer migrated to `watchlistId` scoping

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
- **ViewModel hooks** — `useFetch`, `useSearch` in `src/hooks/use-api.ts` for clean data-fetching patterns
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
- E2E test infrastructure with mock provider on port 17007
- API documentation and AI agent prompt section in Settings page
- Dockerfile for standalone deployment with static assets
- `XRAY_DATA_DIR` support for Railway volume-mounted SQLite

### Fixed

- JWT sessions now persist users to SQLite via `ensureUserExists()`
- E2E auth bypass in both middleware and API auth layer
- Empty response body handling in credentials save
- `better-sqlite3` removed in favor of `bun:sqlite` exclusively
- `HOSTNAME=0.0.0.0` for container deployments
