# X-Ray

Tenant-scoped watchlists, channels, and content ingestion: React/Vite (`packages/ui`), Hono Worker/D1 (`packages/worker`), pure DTOs (`packages/shared`) in a Bun/Turbo monorepo.
Docs: [README](README.md) · [Index](docs/README.md) · [Charter](docs/01-rewrite-charter.md) · [Arch](docs/02-architecture.md) · [Envs](docs/12-local-environments.md) · [Retrospective](Retrospective.md)

## Commands

From root (Bun 1.3.14, Node, `gitleaks`, `osv-scanner`); prod secret names in [.env.example](.env.example).

```sh
bun install --frozen-lockfile
bun run dev # https://xray.dev.hexly.ai -> :7007 (Demo/E2E/Prod)
bun run preview -- --mode demo # packages/worker/static via :7007
bun run env:db -- init --mode demo # migrate|seed|reset (stop Demo)
bun run build:shared && bun run build
bun run typecheck && bun run lint # S1 + S2 (0 warn)
bun run test:coverage # L1 >=80% all 4 metrics
bun run test:release # release CI-gate unit tests (scripts/release.test.ts)
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN bun run test:l2 # L3+routes
bun x --no-install playwright install chromium
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN bun run test:l3 # L4 E2E
bun run capture:demo # Demo captures
bun run login:prod # local Prod CF Access login
bun run refresh:watchlists -- # producer (~/.config/xray/push.env, 600)
gitleaks detect --no-banner --source . && osv-scanner scan --lockfile=bun.lock
```

Route inventory alone: `bun run gate:routes`. `test:l3` runs `scripts/test-l3.ts` (isolated stack, fixture JWTs, cleanup); unmanaged Playwright and inherited CF prod creds fail.

## Invariants

- **Hosts**: `xray.hexly.ai` needs CF Access; `xray-ingest.worker.hexly.ai` allows only `/api/live`, ingest graph/push, channel articles, queries. Keep hosts distinct in routes/tests.
- **Tenant & auth**: Derive `user_id` from verified auth, never client fields; scope queries, keep Access `iss`/`sub` binding and Origin checks, fail closed on conflicts.
- **No auth bypass**: Demo/E2E verify signed fixture JWTs; local JWKS, presentation time, `XRAY_EXTERNAL` require `ENVIRONMENT=development|test` and fail closed in prod.
- **Secrets**: Tokens are one-time plaintext (hashes stored); Bearer cannot manage tokens. Encrypt AI keys/webhooks via versioned AES-256-GCM + tenant/field AAD; never log secrets.
- **Ingest & AI**: Ingest validates, dedupes, and logs without triggering AI; keep manual AI runs, deadlines, bounded batches, and tenant state transitions.
- **Channels**: 1 key/channel (`articles:write`), dedupe `(channel_id, external_id)`, browser-only edits/deletes keeping source/external ID, external HTTPS images only ([11](docs/11-channels.md)).
- **Read & previews**: D1 read state defaults unread (glowing dots, no counts; browser-only). Link previews are browser-only, public HTTPS HTML, tenant/Markdown-verified.
- **Query tokens**: `query:read` only, no side effects; 1 `watchlistId` or `channelId` per call, atomic grants (no broadening on delete), context-bound HMAC cursors ([16](docs/16-query-tokens.md)).
- **UI & tags**: Routes `/channels`, `/channels/:channelId/settings`, `/tokens` (3 tables, credential-free guides), `/tags`, `/settings`. Article tags = live channel+source union below title.
- **Basalt UI**: Use `PageHeader`, dialogs, tag Popover, `TagBadge` (6-color hash), `--basalt-bright` (`LayerCard.Well`) for primary reading, dimmer chrome in both themes.
- **Mobile**: Responsive doc scroll, edge-to-edge island, sticky `AppHeader`, 44px targets, shell `viewport-fit=cover` safe areas—no JS viewport hacks ([14](docs/14-immersive-mobile-reading.md)).
- **Packages**: `@xray/shared` pure; `@xray/ui` ViewModels avoid View/DOM; `@xray/worker` has no React. Root `package.json`/`bun.lock` use bare SemVer (`v` display prefix).
- **Producers**: Run `refresh:watchlists` via [refresh skill](skills/xray-refresh-watchlists/SKILL.md) with `~/.config/xray/push.env` (600; [09](docs/09-local-producer-twitter-cli.md)); keep checkpoints.
- **Release**: Authorized only via `bun run release` from `main` (patch default, `-- minor`/`-- major`); requires an authenticated `gh` and waits for a successful CI run on `main` for the exact pushed commit before creating/pushing the tag; deploy/migrations in `.github/workflows/release.yml` and [07](docs/07-implementation-plan.md); the `base-ci` pins and the release-source contract are audited by `scripts/release.test.ts`.

## Quality & Local Gates

Follows `system1-quality`; CI slots live in `.github/workflows/quality-slots.yml` (`quality / Z1: Gate` on `main`). Status: `enforced`, `planned`, `manual`, `N/A`.

- **Slots**: `B1: Build` (`bun run build`) is `enforced`; `test:coverage` enforces `L1` (`>=80%` all 4 metrics via `scripts/check-coverage.sh`, non-View scopes in package Vitest configs; `packages/ui/dev/**` excluded as local dev helper); `test:l2` backs `L3: Integration`; `test:l3` backs `L4: E2E`.
- **Exceptions**: `L2 Runtime` (`N/A`, Worker in L3/L4), `P1 Package` (`N/A`, not on npm); physical iPhone Safari checks are `manual`.
- **Hook gaps (`planned`)**: Pre-commit `G1` skips if `gitleaks` is absent; pre-push runs `L3` + `G1`/`G2` serially on history instead of parallel pushed-ref scans.
- **Local hooks**: `bun run prepare` (`.husky/`), check-only. `pre-commit`: staged index snapshot (`S1/S2/L1` + optional `G1`); `pre-push`: `L3` + required `G1/G2`.

## Resources & Isolation

State under `packages/worker/.wrangler/environments/` via `scripts/envs.ts` & `packages/worker/dev/local-runtime.ts` (per-run config/`.dev.vars`, 1 owner; [Fixtures](docs/13-environment-fixtures.md)).

| Lane | Endpoint / State                               | Boundary                                              |
| ---- | ---------------------------------------------- | ----------------------------------------------------- |
| Demo | `xray.dev.hexly.ai` (`:7007`), `demo/`         | Persistent D1; keep stack & `.wrangler/state-mock`    |
| E2E  | Dynamic ports, `e2e-*`                         | Disposable; `owner.json` + `_test_marker`; auto locks |
| Prod | `xray.hexly.ai`, `xray-ingest.worker.hexly.ai` | Real Access/Bearer; never test target; auth writes    |

## Retrospective

Log incidents in [Retrospective.md](Retrospective.md) (v1 NextAuth/vinext/SQLite entries do not apply); promote recurring rules to `Invariants` and checks to tests/hooks.
