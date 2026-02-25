README.md

## Retrospective

1. **JWT sessions don't persist users to SQLite** — NextAuth with JWT strategy stores user info in the token only, not in the `user` table. Business tables (`api_credentials`, `webhooks`) have FK constraints to `user(id)`, so INSERT fails with `SQLITE_CONSTRAINT_FOREIGNKEY`. Fix: `ensureUserExists()` in `requireAuth()` auto-creates the user row on first API call.

2. **E2E_SKIP_AUTH must bypass both middleware AND API auth** — The proxy middleware skip alone is insufficient. `requireAuth()` → `auth()` returns null without a real JWT cookie. Fix: `getAuthUser()` returns a deterministic `E2E_USER` when `E2E_SKIP_AUTH=true`.

3. **Non-JSON error responses crash client-side `res.json()`** — If a server route throws an unhandled exception, Next.js may return an empty body. Client code calling `await res.json()` on a non-ok response must be wrapped in try/catch to avoid cascading failures.

4. **Railway DOCKERFILE builder treats startCommand as exec, not shell** — When using DOCKERFILE builder, Railway's custom `startCommand` is executed in exec mode (not shell). Inline env vars like `PORT=7027 HOSTNAME=0.0.0.0 bun server.js` fail because `PORT=7027` is parsed as the executable name. Fix: remove startCommand entirely and rely on Dockerfile's `CMD` + `ENV` directives. RAILPACK builder runs startCommand in a shell, masking this issue.

5. **Next.js standalone requires HOSTNAME=0.0.0.0 in containers** — Without `ENV HOSTNAME=0.0.0.0`, Next.js standalone `server.js` binds to the container's internal hostname (e.g., `6783221ac502`), making it unreachable by Railway's reverse proxy. Always set `HOSTNAME=0.0.0.0` in the Dockerfile.

6. **`next dev` runs Node.js workers, not Bun** — Even when launched via `bun run dev`, Next.js dev server internally spawns Node.js worker processes. `require("bun:sqlite")` fails there. Fix: runtime detection `const isBun = typeof globalThis.Bun !== "undefined"` with `better-sqlite3` fallback. Same pattern used in surety and life.ai projects. Keep `serverExternalPackages: ["bun:sqlite"]` in `next.config.ts` to prevent webpack from bundling it.
