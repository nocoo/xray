# Changelog

All notable changes to X-Ray are documented in this file.

## v2.1.3

### Fixed
- Restore worker static gitkeep for l2
- Lengthen l2 wrangler startup and log

## v2.1.2

### Added
- Restore media proxy for images and video
- 60m spread schedule for watchlist refresh
- Structured debug logs for refresh failures
- Real-http l2 harness and route gate
- Extract page viewmodels for mvvm

### Changed
- Flock lock and 429 retry wording
- Align refresh lock, 429, capacity contracts
- Note last-success written after push
- Point agents at ~/.config/xray/push.env
- Document global push token path
- Harden l3 tokens settings flow
- Lock l1 denom and 95% branch floors
- Lift worker l1 to 95% three metrics
- Raise ui vm and api coverage
- Raise shared package branch coverage
- Enforce l1 95/95/95 coverage gate
- Assert zheto dual-tenant isolation
- Tighten dual-tenant item and token checks
- Complete dual-actor l2 isolation matrix
- Expand l3 flows and align husky 6dq
- Raise l1 coverage gate to 95%

### Fixed
- Reject zhe.to nondefault port; fresh clock
- Parse zhe.to urls before path allowlist
- Harden media proxy redirects and mime
- Accept zhe.to link/create webhook urls
- Capture video poster frame like x.com
- Live relative time from post vs now
- Map tweet media and prefer post created_at
- Keep flock inode; bound lock handshake
- Hold epoch lock with python flock
- Content-verified lock takeover and age bound
- Return 0 pause when epoch already ended
- Rename-based lock takeover; epoch start slack
- Safe stale lock unlink; recheck epoch after wait
- Exclusive-create epoch lock (wx)
- Atomic epoch lock and hard epoch cutoff
- Epoch lock and cache-only watermarks
- Watermark after push; noop empty incremental
- Min-gap on actual starts; live-only watermark
- Return dropped handles from schedule rebase
- Report rebase drops and late window drops
- Address codex p1/p2 refresh schedule issues
- Restore default jwt verifier for tests
- Dual-actor l2 isolation and l3 docs
- Address codex p1 coverage ci l2 isolation
- Skip l3 when worker unreachable
- Translate cards without full page reload
- Ai settings test ui and kek errors

### Removed
- Remove unused worker static keepfile

## v2.1.1

### Added
- Wire card translate to real api
- Add worker ai client for translate

## v2.1.0

### Added
- Member edit dialog with tags
- Custom zheto save and member tags
- Ai test connection and summary fill
- Ingest logs list and dashboard recent
- Group bulk import and copy to watchlist
- Twitter export member import parse
- Add refresh:watchlists producer script
- Map twitter-cli json to canonical
- Polished create dialogs for new entities
- Dynamic watchlist group sidebar items

### Changed
- Add release script for monorepo
- Product gap routes and docs honesty
- P5 mentions member edit tags
- Note member edit tags path
- Summary batch persist and member retag
- Note product-gap route harness coverage
- Route harness for product gap apis
- Mark product gaps p1-p5 done
- Isolate twitter-cli behind timeline source
- Inject push batch orchestration
- Inject spawn for producer orchestration
- Ignore twitter-cli producer cache
- Bump wrangler to 4.120.1
- Bump @cloudflare/workers-types to 5.20260811.1
- Bump @playwright/test from 1.55.1 to 1.62.1
- Sync readme s4-s5 status
- Bind xray.hexly.ai as worker custom domain

### Fixed
- Copy chunk 14 rows for d1 binds
- Bulk batch and ai host validation
- Draft ai test and tag load errors
- Reject over-limit import seeds
- Multi-row group bulk and copy select
- Shared ai endpoint validator bounds
- Zheto save uses shared api client
- Harden ai test connection bounds
- Fail translate when summary fails
- Integer-only ingest log limit
- Batch group import/copy and empty ids
- Scrapeable-only twitter export parse
- Clearer twitter-cli missing/login errors
- Import pushIngestBatch in refresh script
- Whitelist twitter child env
- Producer r2 scrub env and strict cli
- Address producer review p1-p3
- Harden producer map and url utils
- Run gitleaks CLI instead of action artifact path
- Horizontal compact member cards
- Caddy host hmr and origin allowlist
- Compact uniform member cards
- B05 l3 controls, me footer, live health
- Trust access jwt without email allowlist

### Removed
- Drop useless catch in bunSpawn
