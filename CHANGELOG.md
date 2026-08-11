# Changelog

All notable changes to X-Ray are documented in this file.

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
