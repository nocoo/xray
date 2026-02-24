# X-Ray Web — Full-Stack Next.js Migration Plan

## Overview

Transform the X-Ray project from a CLI-based tool with a standalone Hono API server into a **full-stack Next.js web application** with multi-tenant user management.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth Strategy | NextAuth v5 + Drizzle Adapter | Multi-tenant: users/accounts/sessions persisted to SQLite |
| Access Control | Email Allowlist (`ALLOWED_EMAILS`) | Private deployment, invite-only |
| Auth Session | Database sessions (not JWT) | Need server-side user lookups for API credential association |
| Existing Code | Preserve in place during Phase 1 | server/, scripts/, agent/ untouched until Phase 2-3 |
| Port | 7027 (replaces Hono server) | Single port, Next.js is the successor |
| Reference Project | `../surety` | Next.js 16 + Drizzle + SQLite + NextAuth + Tailwind 4 |
| Runtime | Bun | Consistent with existing project |
| UI | Tailwind 4 + shadcn/ui (new-york) | Consistent with surety/basalt design system |
| ORM | Drizzle ORM + SQLite (bun:sqlite) | Consistent with surety |
| Validation | Zod | Request validation and type safety |

## Database Schema

### NextAuth Tables (managed by Drizzle Adapter)

```
users              - id, name, email, emailVerified, image
accounts           - userId, provider, providerAccountId, access_token, etc.
sessions           - userId, sessionToken, expires
verificationTokens - identifier, token, expires
```

### X-Ray Business Tables (new)

```
api_credentials    - id, userId, tweapiKey (encrypted), twitterCookie (encrypted), createdAt, updatedAt
webhooks           - id, userId, keyHash (SHA-256), keyPrefix (first 4 chars), createdAt, rotatedAt
usage_stats        - id, userId, endpoint, requestCount, lastUsedAt, date
```

### Existing Tables (preserved, Phase 2 adds userId FK)

```
watchlist, tweets, processed_tweets, classifications, analytics
```

## Webhook Security Design

- **Generate**: `crypto.randomBytes(32).toString('hex')` → 64-char hex key
- **Store**: Only SHA-256 hash + 4-char prefix (`xk_a1b2...`) in database
- **Verify**: External request sends `X-Webhook-Key` header → hash and compare
- **Rotate**: Generate new key → replace hash → return plaintext (shown once only)

## File Structure (Phase 1)

```
xray/
├── src/                              # NEW - Next.js source
│   ├── app/                          # App Router
│   │   ├── layout.tsx                # Root layout (AuthProvider)
│   │   ├── globals.css               # Tailwind 4 + design tokens
│   │   ├── page.tsx                  # Dashboard (post-login home)
│   │   ├── login/page.tsx            # Google login page
│   │   ├── settings/page.tsx         # API Key/Cookie + Webhook management
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── live/route.ts
│   │       ├── credentials/route.ts
│   │       ├── webhooks/route.ts
│   │       └── webhooks/rotate/route.ts
│   ├── auth.ts                       # NextAuth v5 config
│   ├── proxy.ts                      # Route protection (Next.js 16)
│   ├── db/
│   │   ├── schema.ts                 # All Drizzle table definitions
│   │   ├── index.ts                  # DB connection (bun:sqlite)
│   │   └── repositories/
│   │       ├── credentials.ts
│   │       ├── webhooks.ts
│   │       └── usage-stats.ts
│   ├── lib/
│   │   ├── utils.ts                  # cn() utility
│   │   ├── api-helpers.ts            # Auth helpers for API routes
│   │   └── crypto.ts                 # Webhook key gen/hash
│   ├── components/
│   │   ├── auth-provider.tsx
│   │   ├── loading-screen.tsx
│   │   └── ui/                       # shadcn/ui components
│   └── hooks/
├── server/                           # PRESERVED - Phase 2 migration
├── scripts/                          # PRESERVED - Phase 3 migration
├── agent/                            # PRESERVED
├── shared/                           # PRESERVED
├── tests/                            # PRESERVED (existing 475 tests)
├── src/__tests__/                    # NEW - Next.js layer tests
├── next.config.ts
├── drizzle.config.ts
├── components.json
├── postcss.config.mjs
└── .env.example
```

## Implementation Plan

### Phase 1: Scaffold + Auth + Core Management (this phase)

| # | Commit | Description | Status |
|---|--------|-------------|--------|
| 1 | `feat: scaffold next.js project with bun and tailwind 4` | Install Next.js 16, Tailwind 4, TypeScript config, adapt to existing project | ✅ |
| 2 | `feat: add drizzle orm schema with nextauth and business tables` | schema.ts + drizzle.config.ts + DB connection + initSchema | ✅ |
| 3 | `feat: add nextauth v5 with google provider and drizzle adapter` | auth.ts, proxy.ts, [...nextauth] route, email allowlist | ✅ |
| 4 | `feat: add login page with google sign-in` | Login page UI (surety badge card style) | ✅ |
| 5 | `feat: add app shell layout with sidebar and user info` | Root layout, AuthProvider, AppShell, Sidebar | ✅ |
| 6 | `test: add auth and database unit tests` | Schema, DB connection, auth config tests | ✅ |
| 7 | `feat: add credentials repository and api routes` | credentials repo + GET/PUT /api/credentials | ✅ |
| 8 | `feat: add webhook generation with crypto key management` | crypto.ts + webhooks repo + POST/GET /api/webhooks | ✅ |
| 9 | `feat: add webhook key rotation endpoint` | POST /api/webhooks/rotate | ✅ |
| 10 | `feat: add settings page for credentials and webhook management` | Settings page UI | ✅ |
| 11 | `feat: add dashboard page with usage overview` | Dashboard with basic stats | ✅ |
| 12 | `test: add repository and api route unit tests` | credentials/webhooks/usage-stats repo tests | ✅ |
| 13 | `test: add e2e tests for auth flow and settings management` | E2E login, settings, webhook rotation | ✅ |
| 14 | `feat: add health check and live endpoint` | /api/live | ✅ |
| 15 | `chore: update husky hooks for next.js test structure` | pre-commit/pre-push hooks + lint fixes | ✅ |

### Phase 2: Migrate Hono Routes (future)

- Migrate 10 Hono API routes to Next.js API routes
- Add userId scoping to all data operations
- Multi-tenant credential lookup per webhook request
- Migrate existing 5 DB tables with userId foreign key

### Phase 3: Convert CLI Scripts (future)

- Convert scripts to call Next.js API instead of direct execution
- Agent workflow migration
- Retire Hono server

## Tech Stack Reference

```json
{
  "next": "16.x",
  "next-auth": "^5.0.0-beta.30",
  "@auth/drizzle-adapter": "latest",
  "drizzle-orm": "^0.45.x",
  "drizzle-kit": "^0.31.x",
  "tailwindcss": "^4",
  "@tailwindcss/postcss": "^4",
  "tw-animate-css": "^1.4.x",
  "react": "19.x",
  "react-dom": "19.x",
  "zod": "^4.x",
  "lucide-react": "latest",
  "class-variance-authority": "^0.7.x",
  "clsx": "^2.x",
  "tailwind-merge": "^3.x",
  "radix-ui": "^1.x"
}
```
