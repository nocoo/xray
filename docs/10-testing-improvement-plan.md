# 4-Layer Testing Improvement Plan

## Background

Audit against the 4-layer testing spec revealed 5 gaps in the current setup.

## Gap Analysis

| # | Gap | Severity | Current | Required | Status |
|---|-----|----------|---------|----------|--------|
| 1 | pre-commit missing Lint | High | Lint only in pre-push | pre-commit: UT + Lint + coverage | DONE |
| 2 | pre-commit missing coverage check | High | `bun test` without `--coverage` | `bun test --coverage` (90% threshold in bunfig.toml) | DONE |
| 3 | pre-push duplicates UT + Lint | Medium | Runs UT + Lint + E2E | Only API E2E + BDD E2E | DONE |
| 4 | ESLint not in strict mode | Medium | `recommended` preset | Add key strict rules manually | DONE |
| 5 | Playwright BDD coverage thin | Low | 2 files (smoke + functional) | Core watchlist lifecycle missing | DONE |

## Execution History

### Batch 1: Infrastructure (6 commits)

1. `ebb4b44` — `docs: add 4-layer testing improvement plan`
2. `37cb8d5` — `refactor: restructure husky hooks to match 4-layer spec`
3. `d4ea26b` — `chore: add strict lint rules to eslint config`
4. `37757b5` — `fix: remove non-null assertions in agent and scripts`
5. `3ab1013` — `fix: remove all non-null assertions from production code`
6. `78d9dc4` — `docs: update testing doc to reflect 4-layer architecture`

### Batch 2: Test Coverage Expansion (6 commits)

7. `2380d10` — `test: add full auth enforcement coverage for all routes and methods`
   - Added 9 missing session-auth routes (explore sub-routes, webhooks/rotate, settings/ai/test)
   - Added 18 non-GET mutation method tests (POST/PUT/DELETE on credentials, webhooks, watchlists, tags, members, settings)
   - Total auth enforcement tests: ~22 → ~50

8. `f526fb5` — `test: add smoke tests for watchlist, ai-settings, webhooks, login, connections`
   - Added 4 new pages to smoke test loop (watchlist, ai-settings, webhooks, login)
   - Added standalone smoke tests for watchlist empty state and user connections page
   - Total smoke pages: 10 → 14 + 2 standalone

9. `3efc271` — `test: add watchlist CRUD lifecycle tests to playwright`
   - Create watchlist with icon picker + auto-translate toggle
   - Edit watchlist name/description via hover-revealed button
   - Delete watchlist with confirmation dialog
   - `?new=1` query param auto-opens create dialog

10. `18a036f` — `test: add watchlist member CRUD and tag flow tests to playwright`
    - Add member with username + note
    - Add member with inline tag creation
    - Edit member note via hover-revealed edit button
    - Remove member via confirmation dialog

11. `7ad6080` — `test: add settings, AI config, and webhook CRUD tests to playwright`
    - Credentials: save + delete flow
    - AI settings: provider selection, model auto-fill, save, custom provider fields
    - Webhooks: create key (one-time display), delete key

12. `f2b6660` — `test: add watchlist fetch SSE flow test to playwright`
    - Create watchlist (translate off) → add member → click Fetch Now
    - Assert SSE progress (Fetching... → Done)
    - Assert mock posts render with deterministic content
    - Assert posts tab counter updates and Fetch Now re-enables

## Final Coverage Summary

| Layer | Before | After |
|-------|--------|-------|
| L1 (UT) | ~849 tests, 90% threshold | Same (no new UTs needed) |
| L2 (Lint) | recommended preset, not in pre-commit | 6 strict rules, runs in pre-commit |
| L3 (API E2E) | ~148 tests, 22 auth enforcement | ~148 tests + ~50 auth enforcement |
| L4 (Playwright) | 24 tests (smoke + basic functional) | ~45 tests (full CRUD + SSE + settings) |
