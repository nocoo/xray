# 4-Layer Testing Improvement Plan

## Background

Audit against the 4-layer testing spec revealed 5 gaps in the current setup.

## Gap Analysis

| # | Gap | Severity | Current | Required |
|---|-----|----------|---------|----------|
| 1 | pre-commit missing Lint | High | Lint only in pre-push | pre-commit: UT + Lint + coverage |
| 2 | pre-commit missing coverage check | High | `bun test` without `--coverage` | `bun test --coverage` (90% threshold in bunfig.toml) |
| 3 | pre-push duplicates UT + Lint | Medium | Runs UT + Lint + E2E | Only API E2E + BDD E2E |
| 4 | ESLint not in strict mode | Medium | `recommended` preset | Add key strict rules manually |
| 5 | Playwright BDD coverage thin | Low | 2 files (smoke + functional) | Core watchlist lifecycle missing |

## Execution Plan

### Commit 1: `docs: add 4-layer testing improvement plan`
- This file.

### Commit 2: `refactor: restructure husky hooks to match 4-layer spec`
- `.husky/pre-commit`: add Lint + `--coverage` flag
- `.husky/pre-push`: remove duplicated UT + Lint, keep only E2E

### Commit 3: `chore: add strict lint rules to eslint config`
- `eslint.config.mjs`: add key rules from `strict` preset
- Run `bun run lint` and fix any new errors

### Commit 4: `docs: update testing doc to reflect 4-layer architecture`
- `docs/04-testing.md`: replace with full 4-layer spec documentation

## Future Work (not in this batch)
- Add Playwright tests for watchlist lifecycle (create -> add members -> fetch -> view)
- Add Playwright tests for settings CRUD flows
- Add explicit 401 auth enforcement tests for ~17 uncovered routes
