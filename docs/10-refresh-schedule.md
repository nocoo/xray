# 10 — Refresh schedule (60‑minute epoch)

How `bun run refresh:watchlists` paces **x.com** fetches to finish a full pass inside a **60‑minute wall clock**, with room for future **incremental** epochs.

Related: [09 Local producer](09-local-producer-twitter-cli.md) (boundary, auth, push).  
Secrets: `~/.config/xray/push.env` (see CLAUDE.md / 09).

---

## 1. Why not “as fast as possible”

Observed on cookie + GraphQL `UserTweets` (twitter-cli), **not** official REST quotas alone:

| Fact | Implication |
|------|-------------|
| Real **HTTP 429** / `error.code: rate_limited` | Must pace requests |
| **No `x-rate-limit-reset`** exposed by twitter-cli | Cannot sleep until exact reset; use time-box + random pause |
| CLI already retries 429 **3×** (~5s+10s+20s ≈ **40s**/failure) | Outer layer must not thrash; defer handle instead |
| Official REST `GET /2/users/:id/tweets` is ~900/15min per user | Misleading for our path — GraphQL cookie limits are stricter and undocumented |
| Fixed **3s** gap caused mid-run 429 storms | Default is **spread over 60 minutes** |

Official X docs ([rate limits](https://docs.x.com/x-api/fundamentals/rate-limits), [errors](https://docs.x.com/x-api/fundamentals/response-codes-and-errors)): 429 = too many requests; prefer `x-rate-limit-reset`, caching, spreading load. We approximate reset with a **60‑minute epoch** (≈ 4× common 15‑minute windows).

---

## 2. Goals

1. **Finish one full graph refresh within ~60 minutes** (planned starts land in the epoch; last fetch duration may slightly overrun; **+5s start grace** for timer/event-loop slop).
2. **Randomized, non-burst** spacing (shuffle + jitter + min gap).
3. **429**: pause randomly, **re-queue once** later in the same epoch; if still failing → report, next epoch. If epoch already ended when 429 is seen → **no pause**, fail remaining.
4. **Incremental-ready**: same scheduler; only the **handle set** shrinks (`full` vs `incremental`).
5. **Debuggable**: structured logs + `.cache/twitter-cli/debug/*.json`.

Non-goals: parallel multi-handle fetch; parsing official REST headers from twitter-cli (not available today).

---

## 3. Epoch model

```
epochMs        = 60 * 60_000   (default; --spread-window-min)
minGapMs       = 12_000        (default; --min-gap-ms)
handles        = select(mode) then shuffle
idealSlotMs    = epochMs / N
at[i]          = start + i*idealSlot + U(-j,+j), then sort, enforce minGap
```

| Parameter | Default | CLI |
|-----------|---------|-----|
| Spread window | **60 min** | `--spread-window-min N` |
| Min gap | **12 s** | `--min-gap-ms N` |
| Jitter | ±30% of slot, cap 20s | (code constants) |
| Shuffle | on | (always for spread mode) |
| Mode | `full` | `--refresh-mode full\|incremental` |

**Capacity:** with minGap 12s, one epoch fits at most **301** starts because layout needs `(N-1)*minGap ≤ epochMs` (first at `start`, last may sit exactly on `start+epoch`). Rough operator rule of thumb: `floor(epoch/minGap)+1`. Current graphs (~50 handles) are well inside.

If `(N-1)*minGap > epoch`, the pure scheduler **expands** `epochMs` (`epochExpanded: true`) so minGap is never violated — log this; operators should raise window or lower gap.

**Start cutoffs (two layers):**

| Gate | Value | Used for |
|------|-------|----------|
| `epochEndMs` | `start + epochMs` | schedule build, 429 pause cap, rebase/defer fit |
| `epochStartDeadlineMs` | `epochEndMs + 5_000` | hard gate before **starting** a fetch (timer slack only) |

Rebase/defer stay on the stricter `epochEndMs`. A wake at 60:03 may still start; a wake past 60:05 will not.

### 3.1 Modes

| Mode | Handle set |
|------|------------|
| **full** | All unique x.com handles in the graph |
| **incremental** | Handles with no `last-success` or success older than **55 minutes** (under the 60m epoch) |

State file: `.cache/twitter-cli/last-success.json` — `{ [handle]: epochMs }`.

---

## 4. Runtime algorithm

```
load graph → selectHandlesForEpoch → buildRefreshSchedule
for each slot in time order:
  sleep_until(slot.atMs)
  fetchHandle (twitter-cli or --from-cache)
  on ok: cache raw + canonical; record last-success
  on rate_limited:
    pause = rateLimitPauseMs(120s..300s, capped by remaining epoch)
    sleep(pause)
    rebase remaining queue to now (minGap) — avoid past slots firing back-to-back
    if not yet deferred this epoch: re-insert handle later (deferHandleInSchedule);
      drop soft 429 from handleErrors while deferred so recovered runs exit 0
    else: permanent fail for this epoch
  on not_installed / not_authenticated: abort remaining
then: re-filter items by ingest window → batch push
write run-*.json report + handle_errors_summary
```

### 4.1 Legacy path

- `--no-spread` or explicit `--handle-delay-ms` → fixed delay between handles (old behaviour).
- `--from-cache` → no network pacing (spread skipped).

---

## 5. 429 policy (no reset header)

```
remaining = epochEndMs - now
pauseMs   = remaining <= 0 ? 0 : min( U(120s, 300s), remaining )
```

- Do **not** only cool 60s and continue at full density.
- At most **one defer** per handle per epoch (avoids infinite re-queue).
- If `pauseMs === 0` (epoch already over): mark handle + remaining queue failed; **no sleep**.
- Push path still uses existing ingest 429 backoff (`pushRetryDelayMs`) independently.

---

## 6. Logs & artifacts

| Event | Meaning |
|-------|---------|
| `plan` | Graph size, mode, spread params |
| `schedule` | first/last atMs, idealSlotMs |
| `schedule_wait` | sleeping until slot |
| `fetch_start` / `fetch_ok` / `fetch_error_debug` | per handle (+ CLI stderr/stdout heads) |
| `rate_limit_pause` / `schedule_defer` | 429 handling |
| `handle_errors_summary` | end of run |

| Path | Content |
|------|---------|
| `.cache/twitter-cli/run-<ts>.json` | Full report |
| `.cache/twitter-cli/debug/<handle>-<ts>.json` | Failure forensics |
| `.cache/twitter-cli/last-success.json` | Incremental watermark (atomic write after successful push / cache-only; failure → exit 1) |
| `.cache/twitter-cli/raw/<handle>.json` | Vendor raw |
| `.cache/twitter-cli/epoch.lock` | Singleton run lock (`fcntl.flock` via python3 helper; `{pid,at}` metadata) |

---

## 7. Operator commands

```bash
set -a && source ~/.config/xray/push.env && set +a

# Default: 60min spread, full graph
bun run refresh:watchlists --

# Preview schedule only
bun run refresh:watchlists -- --dry-run

# Incremental (only stale / never-ok handles)
bun run refresh:watchlists -- --refresh-mode incremental

# Tighter / looser pacing
bun run refresh:watchlists -- --spread-window-min 60 --min-gap-ms 15000

# Legacy sprint (not recommended for prod cookie path)
bun run refresh:watchlists -- --no-spread --handle-delay-ms 3000

# Offline convert + push
bun run refresh:watchlists -- --from-cache
```

Cron suggestion: every **60 minutes** start one full epoch; or every 60m **incremental** + nightly **full**. Prefer a scheduler that **skips if previous still running** (e.g. `flock` wrapper); the in-process lock is the safety net, not a substitute for non-overlapping cron.

**Concurrency:** `.cache/twitter-cli/epoch.lock` rejects overlapping runs (**exit 3**) via **OS advisory lock**:

1. Helper: `python3` + `fcntl.flock(LOCK_EX|LOCK_NB)` on the lock file (true held lock — not rename/CAS).
2. Writes `{ pid, at }` metadata for operators; contention → busy exit 3.
3. Holder stays alive for the whole epoch; releases on stdin EOF **or** parent pid death (2s poll).
4. **Never delete** the lock file while debugging overlaps — the path is permanent; only the flock is released. Unlink-after-unlock causes inode split (two processes can both hold “a” lock).
5. Requires `python3` on PATH (macOS/Linux). Handshake timeout 5s → exit 3.

---

## 8. Code map

| Module | Role |
|--------|------|
| `packages/shared/src/producer-schedule.ts` | Pure schedule / defer / select / 429 pause |
| `packages/shared/src/producer-schedule.test.ts` | Unit tests |
| `scripts/refresh-watchlists.ts` | Orchestrator loop + logs + push |
| `packages/shared/src/producer-spawn.ts` | twitter-cli spawn + structured `debug` on errors |

---

## 9. Future increments

1. **Per-handle priority** (failed last epoch first).
2. **Adaptive minGap**: after 429, multiply remaining gaps ×1.5 until epoch end.
3. **Surface reset**: if twitter-cli ever logs/forwards `x-rate-limit-reset`, prefer that over random pause.
4. **Official API adapter**: swap `XTimelineSource` implementation; same scheduler.

---

## 10. Acceptance

- [ ] Default run plans `spreadWindowMin: 60` and prints `schedule` with N slots.
- [ ] Consecutive `atMs` gaps ≥ `minGapMs`.
- [ ] 429 produces `rate_limit_pause` + at most one `schedule_defer` per handle.
- [ ] `handle_errors_summary` + debug files on failure.
- [ ] `--refresh-mode incremental` skips fresh last-success handles.
- [ ] L1: `producer-schedule` tests green under monorepo coverage gate.
