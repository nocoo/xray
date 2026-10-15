# Query Tokens

Query tokens let an authenticated account owner give agents read-only access to
stored watchlist posts and channel reports. They reuse the existing `push_tokens`
credential store, cryptographic minting, SHA-256 hashes, Bearer authentication and
rate-limit binding. Plaintext appears only in the creation response.

## Capabilities And Hosts

| Credential | Allowed agent capability | Binding |
|---|---|---|
| Watchlist | `ingest:read`, `ingest:push` | Account producer graph and ingestion |
| Channel | `articles:write` | One channel |
| Query | `query:read` only | Account-wide or selected sources |

`GET /api/v1/query` and `GET /api/v1/query/sources` are available on `xray-ingest.worker.hexly.ai`, the staging
ingest hostname, and the managed local Worker. It is unavailable on browser
hosts, even with an Access JWT. Watchlist/channel credentials cannot query;
query credentials cannot ingest, obtain a producer graph, or administer tokens.
Mixed query/producer scopes fail closed. Unknown hosts are rejected.

Administration requires the browser owner's verified Cloudflare Access
identity. Mutations retain the normal browser Origin guard. Bearer authentication
never authorizes administration. Token lists, agent instructions and logs must
never contain stored hashes or plaintext credentials.

## Management Contract

All management responses use `{ success: true, data: ... }`. Validation and
ownership errors use the existing API error envelope. The shared contract is:

```ts
type TokenKind = "watchlist" | "channel" | "query";
type QueryTokenAccess = {
  mode: "all" | "selected";
  watchlistIds: number[];
  channelIds: number[];
};
type QueryTokenInput = { label: string; access: QueryTokenAccess };
```

| Endpoint | Request | Success |
|---|---|---|
| `POST /api/query-tokens` | Complete `QueryTokenInput` | 201, `ManagedToken & { token: string }` |
| `PATCH /api/query-tokens/:id` | Complete `QueryTokenInput` | 200, `{ updated: true }` |
| `DELETE /api/query-tokens/:id` | None | 200, `{ revoked: true }` |
| `GET /api/tokens` | None | All active account token metadata |

`ManagedToken` requires `kind` and `queryAccess`. Non-query tokens have
`queryAccess: null`; query tokens have `channelId: null`, `channelName: null`,
`tags: []` and `scopes: ["query:read"]`. Existing watchlist-only listing, renaming
and revocation cannot classify or modify query credentials. Query management
cannot modify producer credentials. Revoked and foreign credentials return 404
on management operations; revoked Bearer credentials return 401 on queries.

Labels are trimmed and must contain 1..64 characters. Grants reject unknown
fields, non-positive/unsafe integer IDs and unknown modes. IDs are deduplicated
and sorted. `all` requires empty ID arrays; it grants all current and future
watchlists and channels owned by the account. `selected` requires at least one
source, with at most 100 source IDs total in the submitted arrays. Watchlists and
channels may be combined freely. `selected` never means `all`, including after
a resource deletion. Deleted IDs can remain in metadata but match no content;
replacement grants must name existing owned resources. A label/grant edit
preserves the credential, creation time and scope.

Tenancy validation and each grant insert/update occur in one SQL statement.
A mixed owned/foreign selection changes nothing. Selection is stored as JSON;
`json_each` uses fixed bind counts rather than one bind per selected source.
There is no new credential/authentication infrastructure and no producer
checkpoint store.

## Read Contract

Starting with v2.8.1, callers must send a source selector and restart pagination;
v2.8.0 merged-feed cursors are not accepted. Existing token credentials and
grants remain valid. This correction requires no database migration.

Each content request **must select exactly one source**. Token grants define an
authorization ceiling, not the request's data selection. There is no merged-feed
mode, including for all-source tokens; a missing or ambiguous selector returns 400.

Discover IDs with `GET /api/v1/query/sources` using the same Bearer credential:

```json
{"success":true,"data":{"watchlists":[{"id":1,"name":"Research"}],"channels":[{"id":2,"name":"Reports"}]}}
```

The catalog contains only live, owned, authorized resources, ordered by ID within
each list. It exposes IDs and names, not members, posts, reports or credentials.
All-source grants discover future sources; selected-source grants do not expand.
This is not the producer graph. Both query endpoints send `Cache-Control: no-store`.

Query each source independently:

```http
GET /api/v1/query?watchlistId=1&limit=100&order=desc
GET /api/v1/query?channelId=2&start=2026-10-01T00:00:00Z&end=2026-11-01T00:00:00Z
```

The content request accepts only these parameters:

| Parameter | Meaning |
|---|---|
| `watchlistId` | Required unless `channelId` is supplied; positive safe integer, posts only |
| `channelId` | Required unless `watchlistId` is supplied; positive safe integer, articles only |
| `start` | Inclusive content-time lower bound |
| `end` | Exclusive content-time upper bound |
| `order` | `asc` or `desc`; default `desc` |
| `limit` | Integer 1..100; default 100 |
| `cursor` | Opaque continuation from the previous response |

`start` and `end` must be real RFC3339 UTC timestamps ending in uppercase `Z`,
with seconds and zero to three fractional-second digits. Date-only values,
offsets, more than three fractional digits, nonexistent calendar dates,
24:00 and leap-second values are rejected. If both bounds are supplied,
`start < end` is required. Unknown or duplicate parameters and invalid cursors
return 400. IDs use canonical positive decimal notation (no signs, leading zeroes,
fractions or exponent notation). Requesting a source outside a selected token's
grants returns 403. Missing/deleted sources, or another tenant's source under an
all-source grant, return 404. An existing authorized source with no matching
content returns an empty page, not 404.

Posts use their original `created_at_ms`. Reports use `report_date` at UTC
midnight, never submission time. Each page contains only posts from the requested watchlist or articles from the
requested channel. The stable sort key within that source is `(timeMs, id)`. All authorization and time predicates apply before pagination.

```ts
type QueryPage = { items: QueryItem[]; nextCursor: string | null };
type QueryItem =
  | { kind: "post"; timeMs: number; post: QueryPost }
  | { kind: "article"; timeMs: number; article: QueryArticle };
```

Success is `{ success: true, data: QueryPage }`. `QueryPost` includes
`id`, `watchlistId`, `sourceType`, `externalId`, `authorUsername`, `title`,
`text`, `createdAtMs`, the stored canonical `payload`, `translatedText`,
`quotedTranslatedText` and `summaryText`. `QueryArticle` includes `id`,
`channelId`, `externalId`, `title`, `reportDate`, `summary`, `author`, full
`markdown`, historical `sourceLabel` and `createdAtMs`. Neither projection
contains tenant identifiers, hashes or secret configuration. Article read
status is not part of this export.

The query materializes a bounded page of skinny IDs/timestamps before
joining and serializing content. At most `limit + 1` records are hydrated for
lookahead; whole-source Markdown/payloads are not serialized for sorting.
Both content rows and their parent resources must belong to the authenticated
tenant. The same SQL statement requires the token to remain active and its
stored access to match the authenticated grants, preventing an intervening
revocation/grant edit from exposing content under stale permissions.

Cursors are versioned and HMAC-authenticated, bound to the token, grants,
source kind and ID, normalized time range and order. A cursor from one watchlist
or channel cannot be used with another, even when both are authorized. Each query token has an independent random
256-bit signing key stored only in `push_tokens.query_cursor_key`, never returned
in credential creation or metadata responses. It is not derived from the Bearer
credential, so credential holders cannot re-sign invented positions or contexts.
Changing any bound context requires starting a
new traversal. Changing the page size is allowed. Cursors contain a position,
not a row lookup, so deleting the previously returned row does not break
continuation. No offset pagination is used. Concurrent insertions/deletions or
content-date edits are not a snapshot: an insertion behind the position may
appear on a later page, while an insertion ahead requires restarting the query.
Consumers needing a fixed export should set an explicit `end` and avoid editing
content while traversing it.

Reading never marks reports read, deletes content, changes AI state, adds
ingest logs, or writes a consumer checkpoint. Successful reads update only the
existing token `lastUsedAtMs` metadata and rate-limit accounting. Clients own
continuation storage, separately for each source. The server makes no automatic AI calls.

## Verification

L1 exercises real SQLite migrations and HTTP handlers with signed fixture
identities, all/selected future-source behavior, single-source tie pagination in
both directions, source discovery/isolation, required selectors, date boundaries, grant ownership/atomicity, deletion behavior,
metadata secrecy, scope/host isolation, cursor tampering/context changes and
revocation. SQL assertions verify unchanged unread state, AI state and ingest
logs. Shared tests validate grant/input/time parsing; cursor tests cover malformed
signed positions as well as HMAC binding.

`packages/worker/test/e2e/query-tokens.http.test.ts` exercises the same critical
flows over the managed native Worker/D1 HTTP runtime. The route inventory
includes content queries, source discovery and all three management endpoints. Production is never a test target.

Browser coverage in `e2e/query-tokens.pw.ts` creates a credential through the UI,
queries both content kinds independently, discovers authorized sources, edits
mixed-source grants, follows a source-bound cursor, rejects cross-source reuse, checks
unchanged unread state and write rejection, copies all three credential-free
guides, reloads the saved selection, and revokes the credential. The journey runs
in Chromium and WebKit. Existing token tests retain channel/global synchronization,
responsive table alignment, keyboard focus, error recovery and narrow dialogs.

The v2.8.0 baseline acceptance on 2026-10-15 used Chrome 155 through
`https://xray.dev.hexly.ai` with the isolated E2E environment: light/dark layouts
at 1440, 1024, 768, 390 and 320 pixels, actual clipboard reads for all three
guides, and persisted mixed-source editing. No horizontal table/page overflow or
uncaught browser errors was observed. Full managed L3 passed 45/45 tests; L1
passed 177 shared, 503 Worker and 286 UI tests, with all four package coverage
metrics above 95%. These are local checks, not production deployment evidence.

The v2.8.1 correction passed fresh local verification on 2026-10-15: 178 shared,
504 Worker and 286 UI tests, with all four coverage metrics above 95%; native L2
47/47 with 70/70 routes; full managed Chromium/WebKit L3 45/45. The regression
suite also exercises stale authenticated grants after edit/revocation directly
against real SQLite. Independent source review found no actionable defects.
Chrome 155 through Caddy verified the single-source/discovery contract, actual
credential-free guide clipboard content, and light/dark 1440px/390px layouts in
the disposable E2E environment, with no page errors or horizontal overflow.
