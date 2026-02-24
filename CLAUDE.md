README.md

## Retrospective

1. **JWT sessions don't persist users to SQLite** — NextAuth with JWT strategy stores user info in the token only, not in the `user` table. Business tables (`api_credentials`, `webhooks`) have FK constraints to `user(id)`, so INSERT fails with `SQLITE_CONSTRAINT_FOREIGNKEY`. Fix: `ensureUserExists()` in `requireAuth()` auto-creates the user row on first API call.

2. **E2E_SKIP_AUTH must bypass both middleware AND API auth** — The proxy middleware skip alone is insufficient. `requireAuth()` → `auth()` returns null without a real JWT cookie. Fix: `getAuthUser()` returns a deterministic `E2E_USER` when `E2E_SKIP_AUTH=true`.

3. **Non-JSON error responses crash client-side `res.json()`** — If a server route throws an unhandled exception, Next.js may return an empty body. Client code calling `await res.json()` on a non-ok response must be wrapped in try/catch to avoid cascading failures.
