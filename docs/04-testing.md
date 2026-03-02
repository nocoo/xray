# Testing

## 4-Layer Architecture

| Layer | Type | Requirement | Hook |
|-------|------|-------------|------|
| 1 | **Unit Tests** | ≥ 90% line + function coverage | pre-commit |
| 2 | **Lint** | Zero errors/warnings, strict rules | pre-commit |
| 3 | **API E2E** | 100% RESTful API route coverage | pre-push |
| 4 | **BDD E2E** | Core user flows via Playwright | pre-push |

## Running Tests

```bash
# Unit tests
bun test

# Unit tests + coverage (90% threshold enforced by bunfig.toml)
bun test --coverage

# API E2E tests (starts dev server on port 17027)
bun test src/__tests__/e2e/ --timeout 60000

# BDD E2E / Playwright (starts dev server on port 17028)
npx playwright test
```

## Git Hooks (Husky)

### pre-commit
Runs on every commit — catches quality issues early:
1. **Lint** (`bun run lint`) — zero tolerance
2. **Unit tests + coverage** (`bun test --coverage`) — 90% threshold

### pre-push
Runs before every push — validates integration:
1. **API E2E** — all RESTful endpoints against live server
2. **BDD E2E** — Playwright browser tests for core flows

## Coverage

Thresholds configured in `bunfig.toml`:
- **Line coverage**: ≥ 90%
- **Function coverage**: ≥ 90%

Excluded from coverage:
- Test files themselves (`coverageSkipTestFiles = true`)
- Generated UI components (sidebar, avatar, tooltip, badge)

## ESLint

Config: `eslint.config.mjs` (ESLint 9 flat config)

Base: `typescript-eslint/recommended` + additional strict rules:
- `no-explicit-any` — forbids `any` type
- `no-non-null-assertion` — forbids `!` operator (relaxed in test files)
- `no-dynamic-delete` — forbids `delete obj[key]` (relaxed in test files)
- `no-extraneous-class` — forbids empty/static-only classes
- `unified-signatures` — merges overload signatures
- `no-invalid-void-type` — restricts `void` usage

TypeScript itself runs in strict mode with `noUncheckedIndexedAccess`.

## E2E Test Server Conventions

### Port Mapping

| Port | Purpose |
|------|---------|
| 7027 | Development server (`bun run dev`) |
| 17027 | API E2E test server (auth bypassed) |
| 17028 | Playwright BDD E2E server |
| 17029 | Auth enforcement test server (no bypass) |

### Auth Bypass

E2E tests bypass authentication via `E2E_SKIP_AUTH=true` at two levels:
1. **Middleware** (`proxy.ts`) — skips session check
2. **API auth** (`getAuthUser()`) — returns deterministic `E2E_USER`

### Database Isolation

Each test tier gets its own SQLite database:

| Database | Used By |
|----------|---------|
| `database/xray.db` | Production/development |
| `database/xray.e2e.db` | API E2E tests (port 17027) |
| `database/xray.noauth.db` | Auth enforcement tests (port 17029) |
| `database/xray.playwright.db` | Playwright tests (port 17028) |

## Test File Conventions

| Pattern | Runner | Location |
|---------|--------|----------|
| `*.test.ts` | Bun | `src/__tests__/`, `tests/` |
| `*.pw.ts` | Playwright | `e2e/` |

Playwright files use `*.pw.ts` (not `*.spec.ts`) to prevent Bun's test runner from accidentally discovering them.
