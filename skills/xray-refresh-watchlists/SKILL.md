---
name: xray-refresh-watchlists
description: >
  Refresh xray watchlist timelines via the stable producer script
  (twitter-cli → cache → canonical → ingest push). Use for cron, "刷新 watchlist",
  "refresh 活跃用户", local/prod ingest, or any agent that must pull X posts into
  xray D1 without re-implementing the pipeline. Orchestrates only; never reimplements fetch/push.
---

# xray-refresh-watchlists

Thin agent skin around **`bun run refresh:watchlists`**.  
The script is the single source of truth for fetch pacing, cache, convert, and push.  
This skill only: **preflight → choose env/graph → run script → report**.

**Do not** invent alternate twitter loops, direct GraphQL, or raw ingest POSTs unless the script is broken and the human asks for a fix.

Canonical docs (read if behavior is unclear):

- `docs/09-local-producer-twitter-cli.md`
- `docs/10-refresh-schedule.md`
- Root `Claude.md` / `README.md` → Secrets / local producer

---

## 0. Cold-start assumptions

| Item | Value |
|------|--------|
| **Repo root (cwd)** | Absolute path to the **xray** monorepo (contains `package.json` with `"name": "xray"` and `scripts/refresh-watchlists.ts`) |
| **Runtime** | `bun` on PATH; `packageManager` in root `package.json` |
| **Twitter CLI** | `twitter` on PATH (or `TWITTER_BIN` / `--twitter-bin`) — install: `uv tool install twitter-cli` |
| **Secrets file** | `~/.config/xray/push.env` (`chmod 600`, **never commit**) |
| **Prod ingest host** | `https://xray-ingest.hexly.ai` |
| **Prod browser host** | `https://xray.hexly.ai` |
| **Local worker default** | `http://127.0.0.1:8787` (`wrangler dev --env development --port 8787`) |

If cwd is wrong, `cd` to repo root first. All commands below assume repo root.

---

## 1. What the script does (do not reimplement)

```
resolve graph (members file OR browser API)
  → unique x.com handles
  → twitter user-posts (paced; default 60m spread)
  → .cache/twitter-cli/raw/<handle>.json
  → map → canonical items → window filter
  → fan-out per watchlist id
  → POST {ingest}/api/v1/ingest/push  (Bearer XRAY_PUSH_TOKEN)
  → JSON plan + per-handle events + final refresh_done + report path
```

Auth roles (three different secrets):

| Secret | Purpose |
|--------|---------|
| **twitter-cli cookies / env** | Read X (GraphQL via CLI) |
| **`XRAY_PUSH_TOKEN`** | Write ingest only (`Authorization: Bearer …`) |
| **Browser session / CF Access / dev bypass** | List watchlists + members (graph). Push token **cannot** do this. |

---

## 2. Push token — how to obtain and store

### 2.1 Canonical storage

```bash
# File (required for unattended / cron)
~/.config/xray/push.env   # chmod 600

# Minimal contents (example shape — do not invent tokens).
# All of these are real assignments in a working prod file; only the token
# value is secret. XRAY_INGEST_BASE is required for prod cron (section 5.1
# sources this file and relies on it — do not leave it commented out).
XRAY_PUSH_TOKEN=xray_pt_<prefix>_<secret>
XRAY_INGEST_BASE=https://xray-ingest.hexly.ai
XRAY_MEMBERS_FILE=config/members.json
XRAY_WINDOW_HOURS=24
```

| Key | Required? | Notes |
|-----|-----------|--------|
| `XRAY_PUSH_TOKEN` | **Yes** (for push) | Full secret once from mint |
| `XRAY_INGEST_BASE` | **Yes for prod** | Default in script is prod URL if unset, but **set it explicitly** in `push.env` so cron/agent never guess |
| `XRAY_MEMBERS_FILE` | Optional | Default graph path if file exists (section 3) |
| `XRAY_WINDOW_HOURS` | Optional | Default 24 |

Load into the shell (every run):

```bash
set -a && source ~/.config/xray/push.env && set +a
# verify present without printing secret:
test -n "${XRAY_PUSH_TOKEN:-}" && echo "XRAY_PUSH_TOKEN=set" || echo "XRAY_PUSH_TOKEN=MISSING"
test -n "${XRAY_INGEST_BASE:-}" && echo "XRAY_INGEST_BASE=$XRAY_INGEST_BASE" || echo "XRAY_INGEST_BASE=MISSING"
```

**Never** write the full token into git, skill files, chat logs, or CI artifacts. Report only `tokenPrefix` (first segment after `xray_pt_`) if needed.

### 2.2 Mint a **production** token

1. Open **https://xray.hexly.ai** → sign in (Cloudflare Access + app session).
2. **Settings → Push tokens** → create with a label (e.g. `cli-refresh` / `cron-refresh`).
3. UI returns the **full secret once** (`xray_pt_…`). Copy immediately.
4. Write/update `~/.config/xray/push.env`:
   ```bash
   umask 077
   cat > ~/.config/xray/push.env <<'EOF'
   # X-Ray prod push token — DO NOT COMMIT
   XRAY_PUSH_TOKEN=xray_pt_REPLACE_ME
   XRAY_INGEST_BASE=https://xray-ingest.hexly.ai
   XRAY_MEMBERS_FILE=config/members.json
   XRAY_WINDOW_HOURS=24
   EOF
   chmod 600 ~/.config/xray/push.env
   ```
5. Token is bound to the **minting user**. Ingest only accepts pushes for watchlists **owned by that user**. Wrong user → 404 / reject on WL id.

API equivalent (when already authenticated as that user in browser/devtools is awkward for agents — prefer UI). Programmatic mint on **local** only is easy (see below).

### 2.3 Mint a **local dev** token

Local worker must be up (`bun run dev:worker` or equivalent on **8787**). Dev env uses `AUTH_DEV_BYPASS`.

```bash
# List existing (prefixes only)
curl -sS -H 'Host: localhost' -H 'Origin: http://localhost:7007' \
  http://127.0.0.1:8787/api/push-tokens

# Mint (full token in response.data.token — once)
curl -sS -X POST \
  -H 'Host: localhost' -H 'Origin: http://localhost:7007' \
  -H 'Content-Type: application/json' \
  -d '{"label":"local-refresh"}' \
  http://127.0.0.1:8787/api/push-tokens
```

Export for this shell only (do not overwrite prod `push.env` unless intentional):

```bash
export XRAY_PUSH_TOKEN='xray_pt_…from_response…'
export XRAY_INGEST_BASE='http://127.0.0.1:8787'
```

### 2.4 Token failure symptoms

| Symptom | Cause |
|---------|--------|
| Ingest **401** | Missing/revoked/wrong `XRAY_PUSH_TOKEN` |
| Ingest **404** on watchlist | Token user ≠ WL owner, or snapshot **id** is from another env |
| Push works on prod, fails local | Using prod token against local D1 (or reverse) |

---

## 3. Graph source (which watchlists / which ids)

Script resolution order (see `scripts/refresh-watchlists.ts`):

1. If **members file path exists on disk** → use file (**browser base ignored**).
2. Else if `XRAY_BROWSER_BASE` / `--browser-base` set → live `GET /api/watchlists` + members.
3. Else → error.

Default file path: `XRAY_MEMBERS_FILE` or `config/members.json`.

### 3.1 Snapshot schema

```json
{
  "watchlists": [
    {
      "id": 9,
      "name": "活跃用户",
      "members": [
        { "handle": "sama", "sourceType": "x.com" }
      ]
    }
  ]
}
```

- **`id` must be the watchlist primary key in the target D1** (local ids ≠ prod ids).
- Only `sourceType === "x.com"` members are fetched.
- Handles: `^[A-Za-z0-9_]{1,15}$` (no leading `@` required; invalid skipped/fail graph parse).

### 3.2 Export snapshot from **local** API (safe pattern)

```bash
# Example: only 「活跃用户」 for local D1
bun -e '
const base = "http://127.0.0.1:8787";
const h = { host: "localhost", origin: "http://localhost:7007", accept: "application/json" };
const nameFilter = process.env.WL_NAME ?? ""; // empty = all non-empty x.com lists
const wls = (await (await fetch(base + "/api/watchlists", { headers: h })).json()).data ?? [];
const out = { watchlists: [] };
for (const wl of wls) {
  if (nameFilter && wl.name !== nameFilter) continue;
  const mem = (await (await fetch(base + `/api/watchlists/${wl.id}/members`, { headers: h })).json()).data ?? [];
  const members = mem.filter((m) => m.sourceType === "x.com").map((m) => ({
    handle: m.handle.replace(/^@/, ""),
    sourceType: "x.com",
  }));
  if (members.length === 0 && nameFilter) { out.watchlists.push({ id: wl.id, name: wl.name, members }); continue; }
  if (members.length === 0) continue;
  out.watchlists.push({ id: wl.id, name: wl.name, members });
}
if (!out.watchlists.length) throw new Error("no watchlists matched");
const path = process.env.OUT ?? "/tmp/xray-members-local.json";
await Bun.write(path, JSON.stringify(out, null, 2));
console.log(path, JSON.stringify(out.watchlists.map((w) => ({ id: w.id, name: w.name, n: w.members.length }))));
'
# WL_NAME='活跃用户' OUT=/tmp/xray-active-local.json bun -e '…'
```

### 3.3 Live graph from browser API

**Local:**

```bash
export XRAY_BROWSER_BASE=http://127.0.0.1:8787
# Ensure config/members.json is NOT used: either remove/rename it for the run,
# or pass an explicit missing path is wrong — file wins if it exists.
# Prefer: write a dedicated snapshot and --members-file (ids guaranteed).
```

**Prod:**

```bash
export XRAY_BROWSER_BASE=https://xray.hexly.ai
export XRAY_CF_AUTHORIZATION='<CF_Authorization cookie value after Access login>'
# Cookie value only, not the full "CF_Authorization=…" header line unless script expects raw value
# (script sets cookie: CF_Authorization=${cf})
```

If `config/members.json` exists and is pointed at by `push.env`, **prod cron will use those ids**. Keep that file in sync with **prod** D1 ids, or override with `--members-file` / unset `XRAY_MEMBERS_FILE` and use browser base.

---

## 4. Preflight (every run)

Run from repo root:

```bash
# 1) Identity
test -f package.json && rg -q '"name": "xray"' package.json

# 2) twitter-cli
twitter status --json
# Pass criterion: JSON has "ok": true and data.authenticated === true
# (see pitfall below for stderr WARNING)

# 3) Secrets (prod path)
set -a && source ~/.config/xray/push.env && set +a
test -n "$XRAY_PUSH_TOKEN"
test -n "$XRAY_INGEST_BASE"

# 4) Target health
# prod:
curl -sS -o /dev/null -w "%{http_code}\n" https://xray-ingest.hexly.ai/api/live
# local:
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/api/live
```

### 4.1 twitter-cli stderr WARNING (usually ignorable)

`twitter status --json` often prints on **stderr**:

```text
WARNING twitter_cli.client: Failed to init ClientTransaction: 'NoneType' object has no attribute 'group'
```

| Check | Action |
|-------|--------|
| stdout JSON: `"ok": true` and `data.authenticated: true` | **Ignore** the WARNING; continue preflight |
| `"authenticated": false` / missing cookies / exit non-zero | **Fail** preflight — re-login x.com in browser or set `TWITTER_AUTH_TOKEN`+`TWITTER_CT0` |

Do not treat the ClientTransaction WARNING alone as auth failure.

### 4.2 Script stdout shape (not NDJSON)

`bun run refresh:watchlists` writes a **mix** of:

1. **Pretty-printed multi-line JSON objects** (each starts with `{` on its own line, may span many lines) — e.g. `event: "plan"`, `event: "schedule_preview"`, per-handle events, `event: "refresh_done"`.
2. **Human lines** between them — e.g. `  @sama → WL 3 (selected)`, `report: /path/to.json`, `timeline source OK…`.

It is **not** one JSON value per line (not strict NDJSON). So `jq -c` on the whole stream fails. Extract with line filters or bun:

```bash
# Dry-run: print only the plan object (first pretty JSON whose .event == "plan")
bun run refresh:watchlists -- --dry-run 2>/dev/null | bun -e '
const t = await Bun.stdin.text();
const chunks = t.split(/\n(?=\{)/); // split before lines that start a new object
for (const c of chunks) {
  const s = c.trim();
  if (!s.startsWith("{")) continue;
  try {
    const j = JSON.parse(s);
    if (j.event === "plan") { console.log(JSON.stringify(j, null, 2)); break; }
  } catch { /* incomplete / human noise */ }
}
'

# Or quick greps for plan summary fields:
bun run refresh:watchlists -- --dry-run 2>/dev/null | rg -n '"event"|"watchlists"|"uniqueHandles"|"selectedHandles"|"ingestBase"|"refreshMode"|"dryRun"'
```

Optional dry-run (graph resolve + schedule preview; no twitter fetch if not needed beyond plan):

```bash
bun run refresh:watchlists -- --dry-run
# Prefer 4.2 extractors — full dry-run dumps every scheduled handle under schedule_preview (long).
```

---

## 5. Execution recipes

### 5.1 Production cron (default pacing — preferred)

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /ABSOLUTE/PATH/TO/xray
set -a && source ~/.config/xray/push.env && set +a
# Default: 60m spread, min-gap 12s — see docs/10. Do NOT add --no-spread on prod cron.
bun run refresh:watchlists --
```

Suggested schedule: at most **once per hour** (matches default epoch spread). Overlap → exit **3** (`epoch.lock` flock); **do not delete** the lock file.

### 5.2 Production incremental

```bash
set -a && source ~/.config/xray/push.env && set +a
bun run refresh:watchlists -- --refresh-mode incremental
```

### 5.3 Local full refresh (fast sprint — local only)

```bash
cd /ABSOLUTE/PATH/TO/xray
export XRAY_PUSH_TOKEN='…local mint…'
export XRAY_INGEST_BASE='http://127.0.0.1:8787'
# Snapshot with LOCAL ids (section 3.2)
bun run refresh:watchlists -- \
  --members-file /tmp/xray-members-local.json \
  --ingest-base http://127.0.0.1:8787 \
  --no-spread \
  --handle-delay-ms 2500 \
  --window-hours 48 \
  --max 20
```

**Never** use `--no-spread` / low `--handle-delay-ms` against **prod** cookies — recreates 429 storms (`docs/09` §7).

### 5.4 Offline re-push from cache

```bash
set -a && source ~/.config/xray/push.env && set +a
bun run refresh:watchlists -- --from-cache
```

### 5.5 Single watchlist

Filter the members snapshot to one `{ id, name, members }` entry (correct env id), then `--members-file` that file. There is no `--watchlist-id` flag on the script today.

---

## 6. Exit codes

| Code | Meaning | Agent action |
|------|---------|--------------|
| **0** | Success (incl. empty graph no-op; recovered single 429 defer in-epoch) | Report green |
| **1** | Partial failure (handle errors, push errors, rejects, zero ok handles, fatal push) | Report red + summary; do not retry blindly in a tight loop |
| **2** | Preflight / config (no twitter, not authenticated, bad flags, missing token for push) | Fix env; human may need browser re-login |
| **3** | `epoch.lock` busy or lock error | Another run holds flock — wait; **never rm** lock |
| **130 / 143** | SIGINT / SIGTERM | Interrupted |

Lock path: `.cache/twitter-cli/epoch.lock` (under `XRAY_CACHE_DIR` / `--cache-dir`).

---

## 7. Reporting (required agent output)

After the script finishes, parse stdout/stderr (see **§4.2** for stream shape):

1. Find line: `report: <path>` → read that JSON file (full runs).
2. Capture JSON objects by `event` (`plan`, `refresh_done`, `cache_only_done`, …).
3. Dry-run has **no** `report:` file — use `event=plan` (+ optional human `@handle → WL` lines).

### 7.1 Map script fields → report lines

| Report line | Source |
|-------------|--------|
| **ingest** | Env `XRAY_INGEST_BASE` after source, **or** `plan.ingestBase` / `refresh_done.ingestBase` if present |
| **graph** | Not a single JSON field. Infer: if members file path exists and was used → `members-file <abs-or-rel path>`; else if browser base set → `browser <base>`. Dry-run: `plan.watchlists` = list count; human lines `@handle → WL <id>` show assignment. Confirm path via env `XRAY_MEMBERS_FILE` / `--members-file` you passed |
| **mode** | `plan.refreshMode` + flags: `plan.dryRun` / `fromCache` / `cacheOnly` / `noSpread` |
| **handles selected** | `plan.selectedHandles` (or `uniqueHandles`) |
| **handles ok / errors** | Full run: `refresh_done` / report — `handleErrors`, `permanentlyFailed`; count ok from summary or handlesPlanned semantics |
| **mapped / windowDropped / skipped** | `refresh_done.totalMapped`, `totalWindowDropped`, `totalSkipped` (names as in report JSON) |
| **per watchlist** | `refresh_done.summary[]` or report file `summary[]`: `watchlist_id`, `name`, `items`, `accepted`, `deduped`, `rejected` |
| **pushErrors** | `refresh_done.pushErrors` |
| **report file** | stdout line `report: …` |
| **debugDir** | `refresh_done.debugDir` |

### 7.2 Human report template

```markdown
## xray refresh report
- **when**: <ISO time>
- **cwd**: <repo root>
- **target**: prod | local
- **ingest**: <from env or plan.ingestBase>
- **graph**: members-file <path> | browser <base>  (inferred — see §7.1; dry-run: plan.watchlists=N)
- **mode**: full | incremental | from-cache | dry-run | cache-only  (from plan.*)
- **exit**: <code>
- **handles**: selected=<plan.selectedHandles> ok=<…> errors=<handleErrors|permanentlyFailed>
- **mapped / windowDropped / skipped**: <refresh_done totals>
- **per watchlist**:
  - WL <id> <name>: items=… accepted=… deduped=… rejected=…
- **pushErrors / permanentlyFailed**: …
- **report file**: <path or n/a on dry-run>
- **debugDir**: <if present>
```

### 7.3 Fields to highlight

| Field | Meaning |
|-------|---------|
| `summary[].accepted` | New rows written |
| `summary[].deduped` | Already present (ok) |
| `summary[].rejected` | Server rejected (investigate) |
| `handleErrors` / `permanentlyFailed` | twitter-cli failures |
| `pushErrors` | ingest transport/API failures |
| `watermarkPersist` | `ok` expected on successful push path |

On exit ≠ 0, include last ~40 lines of script output and the report JSON `event` block.

### 7.3 Cron logging suggestion

```bash
LOG_DIR="${HOME}/.local/log/xray"
mkdir -p "$LOG_DIR"
bun run refresh:watchlists -- 2>&1 | tee -a "$LOG_DIR/refresh-$(date -u +%Y%m%dT%H%M%SZ).log"
```

---

## 8. Failure playbook (short)

| Symptom | Fix |
|---------|-----|
| `twitter` missing | `uv tool install twitter-cli`; ensure `~/.local/bin` on PATH |
| Cookie expired | Login x.com in browser; re-run `twitter status --json` |
| `ClientTransaction` WARNING on `twitter status` | **Ignore** if `authenticated: true` (§4.1) |
| `XRAY_PUSH_TOKEN required` | source `push.env` or export token |
| Ingest 401 | Re-mint token; update `push.env` |
| Wrong/empty posts on a named WL | Snapshot **id** mismatch — re-export graph from **that** env |
| Mass 429 | Prod: use default spread only; wait; do not tighten delay |
| exit 3 lock | Wait for other run; check no crashed holder still alive |
| `config/members.json` overrides browser | Expected — file wins if path exists |
| `jq` fails on full dry-run log | Stream is multi-line JSON + human lines, not NDJSON (§4.2) |

---

## 9. Anti-patterns

- Reimplementing fetch/push in Python/TS “just this once”
- Committing tokens or full `push.env`
- Using **prod** token against **local** D1 (or reverse) without explicit intent
- Using **prod** `config/members.json` ids against **local** (or reverse)
- Prod cron with `--no-spread` / `--handle-delay-ms 3000`
- Raising `--max` to “fill the window” (burns quota; docs forbid)
- Deleting `epoch.lock` to “unblock” cron
- Printing full `XRAY_PUSH_TOKEN` in reports

---

## 10. Agent checklist (copy)

```
[ ] cwd = xray repo root
[ ] twitter status OK
[ ] secrets loaded (push.env or explicit export)
[ ] ingest base matches intent (prod https://xray-ingest.hexly.ai | local http://127.0.0.1:8787)
[ ] graph ids match that ingest DB
[ ] pacing: prod default spread | local may --no-spread
[ ] ran: bun run refresh:watchlists -- <flags>
[ ] recorded exit code + report JSON summary
[ ] no secrets in the report
```

---

## 11. Quick reference commands

```bash
bun run refresh:watchlists -- --help
bun run refresh:watchlists -- --dry-run
# dry-run plan only (see §4.2) — avoid drowning in schedule_preview slots:
bun run refresh:watchlists -- --dry-run 2>/dev/null | rg '"event"|"watchlists"|"uniqueHandles"|"selectedHandles"|"ingestBase"'
bun run refresh:watchlists -- --cache-only
bun run refresh:watchlists -- --from-cache
bun run refresh:watchlists -- --refresh-mode incremental
bun run refresh:watchlists -- --members-file /path/to.json
bun run refresh:watchlists -- --ingest-base http://127.0.0.1:8787
bun run refresh:watchlists -- --browser-base http://127.0.0.1:8787
bun run refresh:watchlists -- --window-hours 24 --max 20
bun run refresh:watchlists -- --spread-window-min 60 --min-gap-ms 12000
# local sprint only:
bun run refresh:watchlists -- --no-spread --handle-delay-ms 2500
```

Env keys: `XRAY_PUSH_TOKEN`, `XRAY_INGEST_BASE`, `XRAY_MEMBERS_FILE`, `XRAY_BROWSER_BASE`, `XRAY_CF_AUTHORIZATION`, `XRAY_WINDOW_HOURS`, `XRAY_TWITTER_MAX`, `XRAY_CACHE_DIR`, `XRAY_REFRESH_MODE`, `TWITTER_BIN`.
