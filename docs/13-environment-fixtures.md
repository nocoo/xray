# Environment fixtures

Contract: [local environments](12-local-environments.md) and
[system0-envs](../../workflow/tasks/system0-envs/SKILL.md).
Fixture version: **1**. Source baseline: `9b4e775bd65658c559e8ab1f72563dc5cdfa2a08`.
Presentation anchor: **2026-09-27T04:00:00.000Z**, timezone **UTC**.
Authentication uses real current time; the presentation anchor is never a JWT clock.

## Lifecycle and exports

- `fixtures/demo.sql`: initial-only rich catalog, after production migrations.
  The launcher owns the fresh-state check and explicit reset. Ordinary restarts
  do not execute this SQL. Plain inserts intentionally fail on replay; no upsert,
  old-name mutation, import from `.wrangler/state-mock`, or compatibility path.
- `fixtures/empty.sql`: no users or content, only `SELECT 1`. Normal verified
  authentication creates the run user. Empty states do not require deleting Demo.
- `fixtures/primitives.ts`: `FIXTURE_VERSION`, `FIXTURE_ANCHOR_ISO`,
  `FIXTURE_ANCHOR_MS`, `DEMO_IDENTITY`, `OTHER_IDENTITY`, `fixtureIdentity(runId, role)`,
  `canonicalPost(externalId?, text?)`, `canonicalArticle(externalId?, text?)`,
  `MEDIA_URLS`, `AI_BASE_URL`, `AI_MODEL`, `ZHETO_WEBHOOK_URL`.
- `fixtures/demo.ts`: `DEMO_CATALOG`, stable IDs for reading, CJK typography,
  tagged/untagged reports, revoked sources and watchlists.
- `fixtures/e2e.ts`: `e2eCatalog(runId)` returns fresh identity/input objects for
  real API setup; it does not write storage. `canonicalArticle` means a custom
  ingest item; `e2eCatalog().report` is a channel submission. Tests must create
  resources and issue tokens through the actual application. `installExternalMedia(page)` installs only the approved browser media routes.
  `EXTERNAL_MEDIA_FIXTURES` lists exact external URL, root-relative file path and MIME type for browser
  media interception. It contains no application `/api` routes.
- `fixtures/protocol.ts`: `PROVIDER_SCENARIOS`, `ProviderScenario`,
  `FixtureProviderEnv`, `PREVIEW_DOCUMENTS`, and re-exported provider URL constants.
- `fixtures/providers.ts`: **only** the default `{ fetch(request, env) }` Worker
  export. Configure it as the native `XRAY_EXTERNAL` service. Workerd interprets
  named exports as entrypoints, so constants live in the separate protocol module.
  The provider has no network fallback, database, secrets, or outbound `fetch`.
- `bun run capture:demo` runs `scripts/capture-demo.ts` with a disposable E2E
  runtime seeded from the rich Demo catalog. It uses `installExternalMedia`, waits
  for loaded images and captures only the product surface at 1440×1000, `en-US`,
  UTC. Dashboard, timeline, reader, channels, tags and settings PNGs plus a manifest
  go under `reports/captures/<timestamp>/`. The manifest records revision, dirty
  state, fixture version, anchor, viewport, locale, timezone, routes and media mode.
  The runtime is closed afterward; daily Demo state is untouched. This command's
  existence is not evidence that its captures have been reviewed.

Demo owner: `xray-demo-user`, issuer `https://identity.xray.test`, subject
`demo-owner`, email `owner@xray.test`. The second account is `xray-demo-other`,
subject `demo-other`, email `other@xray.test`; it starts without resources.
E2E subjects/emails contain a validated run ID and owner/other role.
Live E2E ingest submissions set `created_at` to the actual request time to exercise
the unchanged freshness validator; catalog/presentation dates remain anchored. Signed token
issuance and local public JWKS belong to the launcher, not fixtures.

The rich catalog contains 13 watchlists, 108 members, 13 groups, 106 group
members, 239 canonical items, 59 coherent ingest logs, 15 channels, 145 reports,
45 tags and 51 named source keys (33 active-looking, 18 revoked). Source key rows
are non-authenticating display fixtures. Issue a real local key through the
browser API for ingest. The SQL contains no provider settings; the launcher saves
`fixture-local-key` and the fixed fixture webhook through the real AI and integration
settings APIs and normal encryption.
Never submit these inputs to Prod.

## External protocols

Scenario selection is a startup binding, `XRAY_FIXTURE_SCENARIO`, default `success`.
There is no browser scenario header or application endpoint that bypasses policy.
Unknown scenarios fail with 500; unknown host/path/method/query combinations fail
with 502 and `Fixture egress denied`. Requests are not forwarded anywhere.

| Boundary | Accepted protocol | Deterministic response |
|---|---|---|
| AI | POST `https://api.openai.com/v1/chat/completions`, Bearer header, model and message array | OpenAI-compatible `choices[].message.content`; `ping` connection test returns `ok`; translation, quoted translation markers and summary use distinct text |
| Profile | GET `https://lizheng.blog/api/authors/profile?hash=<64 lowercase hex>` | `{name:"Demo Owner",avatar:MEDIA_URLS.avatar}`; synthetic profile independent of private identity data |
| zhe.to | POST `https://zhe.to/api/link/create/00000000-0000-4000-8000-000000000001`, JSON URL plus optional note/folder | 201 `{data:{shortUrl,slug,originalUrl}}`; `existing` returns 200 |
| DNS | GET `https://cloudflare-dns.com/dns-query?name=<catalog host>&type=A|AAAA` | DNS JSON `Status:0`, A/AAAA answers; only catalog hosts allowed |
| HTML | Exact public documentation URLs in `PREVIEW_DOCUMENTS` | HTML title and Open Graph metadata, external HTTPS image |
| Missing HTML | `https://example.com/xray-demo-preview-unavailable-v1` and `/xray-demo-missing-N-N` | 404 |
| Media | GET/HEAD exact `MEDIA_URLS` | Local synthetic SVG/MP4 bytes, byte ranges with 206/416 and length headers |

`upstream-error` returns 503; `rate-limit` returns upstream 429 + `Retry-After: 1`;
`malformed` returns invalid JSON; `private-dns` returns loopback A/AAAA records;
`redirect-private` sends HTML requests to `https://127.0.0.1/private`; `oversized`
exceeds the actual AI/HTML response limits. The application's URL validation,
public-address checks, redirect checks, size limits, parsers and error handling
remain active. Provider 429 is not evidence of the application's native rate
limiter; that must be tested separately with the launcher binding.

## Provenance and media

The SQL text is synthetic material carried forward from the baseline
`scripts/mock-data.sql`. The first 28 legacy payloads were converted to the current
canonical schema. Gallery and quoted-image states from `scripts/seed-debug-feed.ts`
were consolidated as three new canonical items; that script's real-person names,
third-party image-generation requests and direct SQLite-file discovery were removed.
Neither old script remains an executable seeding path.

Demo browser media remain **direct external HTTPS URLs**:

- Existing approved Unsplash desk photo,
  `https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80`
  and the existing `w=960` variant. Source is the already-approved project fixture;
  usage is subject to [Unsplash's license](https://unsplash.com/license).
  No author attribution is invented. The same image supplies the synthetic
  account avatar, avoiding a real person's portrait.
- Existing MDN flower sample,
  `https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4`,
  from MDN's explicitly labeled CC0 video directory.
- Public documentation/repository links remain references, not copied articles.
  Provider HTML titles/descriptions are original synthetic summaries, not fetched
  page snapshots or a claim about current upstream content.

Channel Markdown and preview images are never uploaded, stored or proxied by the
application. Ordinary Demo image availability depends on those external hosts.
E2E alone may intercept the **exact three URLs** in `EXTERNAL_MEDIA_FIXTURES`, using
original project-created geometric SVGs and a generated two-second silent MP4 in
`fixtures/media/`. The same bytes are embedded in `fixtures/media.ts` for native
Worker responses, with byte-for-byte tests preventing drift. These are test assets,
not a storage feature or a substitute external URL in Demo. No downloaded private
media or production dump is involved.

The MP4 was generated with FFmpeg `color`/`drawbox`/`fade`, 320×180, 12 fps,
H.264/yuv420p, no audio. SVG geometry and MP4 contain no third-party source imagery.

## Feature matrix

`Prepared` means a dataset or reproducible input exists. `Passed` identifies executed
checks, with their scope stated in each cell. `Unverified` is not inferred from source
or counts. Browser geometry/color assertions are action evidence, not human visual
review. The complete managed L3 suite passed **25/25** on 2026-09-27; cells still
mark actions outside those assertions as unverified.

| Feature / route | Data or reproducible scenario | Data | Action / API evidence | Visual evidence |
|---|---|---|---|---|
| `/` dashboard | Counts, 59 ingest logs, successful/rejected activity, fixed dates | Passed SQL totals/coherence | Passed signed browser shell and Dashboard/Watchlists rendering; aggregate correctness unverified here | Reviewed light-mode totals, source mix and anchored charts (`dashboard.png`) |
| Account menu, `/api/me` | Signed Demo owner, other tenant, synthetic name/avatar | Prepared; profile protocol passed | Passed signed browser session; profile rendering/expiry cases unverified here | Unverified |
| `/watchlist` list/create/edit/delete | 13 topics, varied icons, preferences; E2E watchlist input | Passed SQL relationships | Passed dialog creation, detail navigation and activity panel; edit/delete UI unverified | Unverified |
| `/watchlist/:id` members | Both source types, missing/multiple tags, notes | Passed schema and relationships | Add/edit/remove/filter unverified | Unverified |
| Timeline content | 239 canonical items; short/long EN/CJK, metrics, links, custom titles | Passed all payloads and timestamps | Passed actual 60-item ingestion, 50→60 pagination and earlier card position stability; delete/expand UI unverified | Reviewed EN/CJK cards, hierarchy and image layout (`timeline.png`) |
| Timeline references and media | Quotes, replies, repost metadata, 1/2/4 photos, quoted image, video/GIF | Passed canonical variants; media protocol passed | Player/gallery/quote interaction unverified | Unverified |
| Manual AI | Not requested/pending/succeeded/failed; quoted translation and summary | Passed state coherence | Real client + native service passed; UI manual batch/retry unverified | Unverified |
| `/groups` | 13 source libraries, 78 shared handles for copy deduplication | Passed SQL overlap | Passed API creation and list rendering; edit/delete, bulk import and copy overlap/error unverified | Unverified |
| `/channels` and sidebar | 15 ordered channels, long names, read/unread inbox | Passed SQL | Passed create/edit/delete, persisted ordering, refresh and management failure retries | Reviewed channel management names and rows (`channels.png`) |
| `/channels/:id` reports | 145 reports, 34 in daily channel, dated backlog, tagged and untagged | Passed SQL; latest day 2026-09-27 | Passed date/keyword/multi-tag filtering before pagination, history and empty-search behavior | Unverified |
| Channel reader | Markdown tables, code, tasks, CJK emphasis, long body, direct image | Prepared | Passed open/edit/delete, retry deduplication, loaded history and reading-position persistence; unsafe embedded URLs rejected | Reviewed Markdown, image and reading surfaces (`reader.png`) |
| Reading state | Inbox has 3 unread and 1 read report | Passed SQL | Passed read-on-open across two browser contexts, new arrival refresh and channel-wide all-read despite active filter | Unverified |
| Related links | Rich, missing, malformed, oversized, private DNS, unsafe redirect | Native DNS + fetch + HTML parser + failure limits passed | Passed actual preview fetch, deduplication, loaded external images, close/reopen cache reuse, full-width/mobile layout, theme, focus and reduced-motion assertions; ownership/membership denial cases unverified here | Unverified |
| `/channels/:id/settings` | 51 named keys, never-used and revoked, overlapping tags | Passed SQL | Passed one-time key creation, revocation and rejected subsequent ingest | Unverified |
| `/tags` | 45 varied names, long/unbroken/CJK/Japanese, untagged content | Passed associations | Passed create/edit/delete, assignment, live deduplicated union and stable palette assertions; cross-tenant atomicity unverified here | Reviewed long/CJK names and six-color badges (`tags.png`) |
| `/settings` account and AI | Launcher saves `e2eCatalog().ai` through real API | Prepared; completion connection protocol passed | Passed account/AI shell and absence of global token controls; draft/save/reset/preferences UI unverified | Reviewed synthetic account and configured AI form (`settings.png`) |
| `/integrations/zheto` | Launcher saves local webhook/folder through real API | Protocol 201/200 passed | Passed integration page/field rendering; save/error UI unverified | Unverified |
| Global producer API | Focused canonical X/custom payloads and a fresh browser-issued key | Passed canonical parse | Passed browser key issue and Bearer ingest-to-timeline; scope/graph/limits unverified here | Unverified |
| Channel producer API | Stable external ID, report date and Markdown from E2E catalog | Prepared | Passed submit/retry deduplication and revoked-token rejection; remaining policy cases unverified here | Unverified |
| Auth/permissions/host policy | Distinct run-specific owner/other; fresh real issued tokens | Passed identity input isolation | Passed signed browser and Bearer ingest journeys; full cross-tenant/Origin/host denial matrix unverified here | Unverified |
| Empty states | `empty.sql`, first-login identity, create an empty list/channel/group | Passed no inserted data | Passed empty channel after deleting final report and empty filter result; empty-scenario onboarding unverified | Unverified |
| Loading/error/limits | Provider failure scenarios; pending AI rows; native limiter setup | Native upstream errors passed | Passed offline report retry, failed draft retention, management retry and delayed real deletion navigation; native limiter reached 429 through bounded real L2 requests | Unverified |
| Theme/responsive/accessibility | Long names/text/media; light/dark, narrow/wide viewports | Prepared | Passed 320/390/430px reading/navigation, compact headers, overlays/filter keyboard handling, focus restoration, light/dark checks, 1280/1366/1440px panel geometry and reduced motion; full accessibility audit unverified | Unverified |
| Local mode lifecycle | Separate Demo/E2E inputs and initial-only seed | Passed replay rejection/determinism | Passed automated E2E UI/server lock, instance-bound API routing, rejected stale instance/switch requests, preserved interactive preference and hosted capture controls; Chrome/Caddy Demo restart persistence, dirty-form cancellation/confirmation, fresh remembered E2E passed; manual switching follows the owner clarification in [12](12-local-environments.md) | Unverified |
| Uploads, comments, attachments, exports | No such application feature; channel images are external links | N/A | N/A | N/A |

## Verification record

Checks on 2026-09-27:

- `bun run --cwd packages/worker test src/test/mock-data.test.ts`: **9 passed**.
  Includes in-memory SQL with production migrations, canonical parsing of every
  row, deterministic replay refusal, pure E2E inputs, exact media bytes/ranges,
  and real workerd service bindings through the application's AI/preview clients.
  Workerd has an explicit outbound deny handler and no D1 binding in provider tests.
- Targeted Biome check: passed. Fixture TypeScript check: passed.
- Managed L3 first run: **18 passed, 5 failed** across the nine adapted spec files.
  The failures were the related-link heading geometry, 320px channel header,
  instance-prefixed filter response matching, ambiguous watchlist heading locator,
  and masonry positions measured relative to the viewport.
- After correcting the three spec issues, the focused managed run of
  `channel-filters.pw.ts posts-columns-pages.pw.ts watchlists-flow.pw.ts` passed
  **4/4**. Both runs used
  `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN bun scripts/test-l3.ts`
  with explicit spec arguments, one Playwright worker, fresh isolated state and
  managed cleanup. These were interim results. The UI owner then corrected the
  two layout failures without changing assertions; its focused run passed **4/4**.
- Final combined managed L3: **25 passed, 0 failed, 0 skipped**, **2.4 minutes**,
  including `environments.pw.ts` and all nine adapted specs. Executed after the
  UI owner's successful full build:

  ```sh
  env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN bun scripts/test-l3.ts --output=/tmp/xray-fixture-l3-final
  ```

  The runner exited 0 after cleanup. It used one Playwright worker and fresh native
  state, never the daily Demo store. `bun run test:l3` adds a full build before
  calling this same runner. Final artifacts are in `/tmp/xray-fixture-l3-final`;
  the first failing run was preserved in `/tmp/xray-fixture-l3-first-run`.
- The adapted specs never intercept application APIs. Known external media use
  `installExternalMedia`; transport-error tests use browser offline/online or
  scoped CDP latency with cleanup. All successful API responses come from actual
  application execution and the native external provider service.
- Fixture unit tests use only in-memory SQL and a native provider without a D1
  binding. Managed L3 uses its fresh per-run native store. Neither uses production
  identity, external credentials or real provider writes. This is not full
  L1/L2/L3 certification.
- Capture execution and scoped visual review: **passed** on 2026-09-27. Full build
  plus `bun scripts/capture-demo.ts` produced six light-mode PNGs in
  `reports/captures/2026-09-27T06-44-05.035Z/`. Dashboard, timeline, reader, channels,
  tags and settings were reviewed; images were loaded and visible content was
  synthetic. The manifest records revision `d63f238` with `dirty: true`, fixture
  version 1, 1440×1000 viewport, `en-US`, UTC, exact routes and deterministic media.
  The run completed owned cleanup without changing daily Demo. A separate Google
  Chrome pass through `https://xray.dev.hexly.ai` loaded direct Unsplash images;
  evidence is in `reports/environment-acceptance/`.
- This is scoped visual evidence, not approval of every row, theme or interaction.
  Video playback, full accessibility, CI and real Production remain unverified.
