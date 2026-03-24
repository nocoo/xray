README.md

## Release

Version is managed in `package.json` (single source of truth). Versioning follows SemVer: X (major/breaking), Y (minor/feature), Z (patch/fix). Default bump is Z+1.

> **Full spec**: `search-memory "开发规范：版本号的维护"`

```bash
bun run release              # Z+1 patch (default)
bun run release -- minor     # Y+1 minor
bun run release -- major     # X+1 major
bun run release -- --dry-run # preview without side effects
```

The script auto-detects project name and CHANGELOG format, then: bumps version → syncs lockfile → generates CHANGELOG → commits → pushes → tags → creates GitHub release.

## Retrospective

1. **JWT sessions don't persist users to SQLite** — NextAuth with JWT strategy stores user info in the token only, not in the `user` table. Business tables (`api_credentials`, `webhooks`) have FK constraints to `user(id)`, so INSERT fails with `SQLITE_CONSTRAINT_FOREIGNKEY`. Fix: `ensureUserExists()` in `requireAuth()` auto-creates the user row on first API call.

2. **E2E_SKIP_AUTH must bypass both middleware AND API auth** — The proxy middleware skip alone is insufficient. `requireAuth()` → `auth()` returns null without a real JWT cookie. Fix: `getAuthUser()` returns a deterministic `E2E_USER` when `E2E_SKIP_AUTH=true`.

3. **Non-JSON error responses crash client-side `res.json()`** — If a server route throws an unhandled exception, Next.js may return an empty body. Client code calling `await res.json()` on a non-ok response must be wrapped in try/catch to avoid cascading failures.

4. **Railway DOCKERFILE builder treats startCommand as exec, not shell** — When using DOCKERFILE builder, Railway's custom `startCommand` is executed in exec mode (not shell). Inline env vars like `PORT=7027 HOSTNAME=0.0.0.0 bun server.js` fail because `PORT=7027` is parsed as the executable name. Fix: remove startCommand entirely and rely on Dockerfile's `CMD` + `ENV` directives. RAILPACK builder runs startCommand in a shell, masking this issue.

5. **Next.js standalone requires HOSTNAME=0.0.0.0 in containers** — Without `ENV HOSTNAME=0.0.0.0`, Next.js standalone `server.js` binds to the container's internal hostname (e.g., `6783221ac502`), making it unreachable by Railway's reverse proxy. Always set `HOSTNAME=0.0.0.0` in the Dockerfile.

6. **`next dev` runs Node.js workers, not Bun** — Even when launched via `bun run dev`, Next.js dev server internally spawns Node.js worker processes. `require("bun:sqlite")` fails there. Fix: runtime detection `const isBun = typeof globalThis.Bun !== "undefined"` with `better-sqlite3` fallback. Same pattern used in surety and life.ai projects. Keep `serverExternalPackages: ["bun:sqlite"]` in `next.config.ts` to prevent webpack from bundling it.

7. **Bun test runner discovers `*.spec.ts` files globally** — Bun has no `ignore` config for test discovery. If Playwright tests use `*.spec.ts` naming, `bun test` will load them and crash on `@playwright/test` imports. Fix: name Playwright files `*.pw.ts` and set `testMatch: "*.pw.ts"` in `playwright.config.ts`.

8. **`bunfig.toml` `coverage = false` overrides CLI `--coverage` flag** — Setting `coverage = false` in bunfig makes `bun test --coverage` silently skip coverage output. Fix: omit the `coverage` key entirely; bun defaults to off, and `--coverage` flag will work as expected.

9. **vinext RSC environment is pure ESM — `require()` is unavailable** — Unlike Next.js which supports CJS `require()` in server code, vinext's RSC runtime is strict ESM. Fix: use top-level `await import()` to eagerly load modules at module init time, keeping downstream functions synchronous.

10. **vinext passes params with null prototype across RSC boundary** — In Next.js 15+, dynamic route `params` is a `Promise` unwrapped via `use(params)`. vinext passes params as objects with null prototypes, which RSC serialization rejects ("Only plain objects can be passed to Client Components from Server Components"). Fix: use `useParams()` from `next/navigation` in `"use client"` components instead of receiving `params` as a prop.

11. **vinext `next/font/google` shim only exports ~20 common fonts** — Named imports like `import { DM_Sans } from "next/font/google"` fail because Rollup can't statically resolve names not explicitly exported. Fix: use default import `import googleFonts from "next/font/google"` then `const DM_Sans = googleFonts.DM_Sans` — the shim's Proxy default export handles any font name at runtime.

12. **vinext route handlers don't provide `nextUrl` on Request** — `next-auth` v5 expects `NextRequest` with a `nextUrl` property. vinext's route handlers pass plain `Request` objects. Fix: wrap handlers to convert `Request` to `NextRequest` before passing to next-auth.

13. **`CREATE TABLE IF NOT EXISTS` won't add columns to existing tables** — When adding new columns (e.g., `comment_text`) to `initSchema()`'s DDL, pre-existing SQLite databases silently skip the entire CREATE statement. Fix: add an explicit `ALTER TABLE ... ADD COLUMN` wrapped in try/catch after the CREATE block. SQLite lacks `ADD COLUMN IF NOT EXISTS`, so catching the "duplicate column" error is the standard pattern.

14. **TweAPI `userRecent20Tweets` endpoint was removed (404)** — The `/v1/twitter/user/userRecent20Tweets` endpoint documented in TweAPI returns 404 Not Found. It was used as a fallback when `userRecentTweetsByFilter` returned 400 for certain users. Fix: use `/v1/twitter/user/timeline` as the fallback instead — it accepts the same `{ url }` body and is a stable endpoint.

15. **vinext `useRouter()` returns a new object every render** — Unlike Next.js where `useRouter()` returns a stable reference, vinext creates a new router object each render. Putting `router` in `useCallback` deps causes the callback to rebuild every render, and if that callback is in a `useEffect` dep array, it triggers an infinite fetch loop → `ERR_INSUFFICIENT_RESOURCES`. Fix: store `router` in a `useRef` and read from `routerRef.current` inside callbacks. Same pattern applies to any rapidly-changing state (`members`, `fetching`) used inside `useCallback` that feeds into `useEffect` deps.

16. **`safeAddColumn` catch-all silently swallows migration failures** — The `try { sqlite.exec(alter) } catch {}` pattern intended to ignore "duplicate column" errors also swallows genuine failures (e.g., FK constraint issues, missing referenced tables). Fix: catch the error, check if `message.includes("duplicate column")`, and `console.error` anything else.

17. **NextAuth without adapter generates a new random UUID on every OAuth sign-in** — `@auth/core` intentionally sets `user.id = crypto.randomUUID()` in `getUserAndAccount()`, expecting an adapter to resolve identity via `getUserByAccount()`. Without an adapter, the same Google account gets a different `user.id` in each browser, after cookie expiry, or after sign-out/sign-in. The `user.email UNIQUE` constraint then causes `SQLITE_CONSTRAINT` on INSERT. Fix: `ensureUserExists()` resolves identity by email (which is UNIQUE and stable from Google), returns the canonical user with the database's original ID, so all sessions for the same email share one user record.

18. **ScopedDB migration: adapter + scoped pattern eliminates the root cause** — The proper fix for #17 is a NextAuth SQLite adapter (`auth-adapter.ts`) that resolves identity via the `account` table JOIN on `(provider, providerAccountId)`. Combined with `session: { strategy: "jwt" }` (must be explicit when adapter is present, or NextAuth defaults to database sessions), this gives stable user IDs across browsers. The `ScopedDB` class then binds `userId` at construction time, making row-level security "correct by construction" — every method auto-injects the `WHERE user_id = ?` constraint. The old `ensureUserExists()` and per-repository `userId` parameter passing are both eliminated.

19. **Middleware can't import bun:sqlite — lazy-load the adapter** — `proxy.ts` (middleware) imports `auth.ts`, and middleware runs in an edge-like environment that can't access `bun:sqlite`. Fix: lazy-load the adapter in `auth.ts` with `try { adapter = (await import("./auth-adapter")).SqliteAdapter(); } catch {}`. The adapter is only needed for sign-in/sign-up flows, not for session validation in middleware.

20. **Test variable naming: avoid `db` clash with drizzle instance** — When migrating tests to ScopedDB, using `const db = new ScopedDB(userId)` clashes with the drizzle `db` import from `@/db`. Fix: use `scopedDb` as the variable name in tests. For cross-user test scenarios, create separate instances like `const otherDb = new ScopedDB("other-user")`.

21. **E2E_SKIP_AUTH + ScopedDB needs `seedUser` with prior `getDb()`** — After replacing `ensureUserExists()` with the adapter pattern (#18), `requireAuth()` in E2E mode creates `ScopedDB("e2e-test-user")` but no user row exists (OAuth never runs). All writes fail with `SQLITE_CONSTRAINT_FOREIGNKEY`. Fix: call `getDb()` first (initializes the raw sqlite driver), then `seedUser(E2E_USER_ID)` before returning the ScopedDB. `seedUser` uses the module-level `sqlite` variable which is only set after `getDb()`/`createDatabase()`.

22. **Playwright strict mode + sidebar: locators match both sidebar link and main content** — `page.locator("a", { hasText: "To Edit" })` matches sidebar navigation links AND card links in main content (2 elements → strict mode violation). Fix: scope card locators to `page.locator("main a", { hasText: "..." })`. Similarly, `getByRole("link", { name: "Settings" })` matches "AI Settings" too → use `{ exact: true }`.

23. **Playwright tests sharing DB across files lose test isolation** — Playwright uses a single worker and a shared database (`xray.playwright.db`). Tests in `functional.pw.ts` create watchlists that persist into `smoke.pw.ts`, so "empty state" assertions fail. Fix: avoid fragile empty-state checks in smoke tests; check for always-present elements (header + "New" button) instead.
