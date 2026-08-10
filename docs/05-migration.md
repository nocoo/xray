# 05 — Data Migration

## 1. In scope (locked)

| Source | Migrate? |
|--------|----------|
| users (real; skip e2e-test-user) | yes — match email → bind access on first login |
| watchlists / members / tags | yes — members → source_type=`x.com` |
| groups / group_members | yes — same source_type map |
| AI settings keys | yes — **secrets → encrypted `ai_configs`** (R3-02) |
| zhe.to credentials | **no auto-migrate** — user re-enters in UI (safer) |
| fetched_posts | **NO** |
| TweAPI credentials, webhooks, usage | **drop** |
| NextAuth accounts/sessions | drop |

## 2. Tool

```bash
bun run scripts/migrate-v1-to-d1.ts \
  --sqlite path/to/xray.db \
  --target local|remote \
  --dry-run \
  --map email-map.json   # optional conflicts
```

### Idempotency & safety (XR-12, R3-02, R3-11)

| Requirement | Behavior |
|-------------|----------|
| Dry-run | print counts + conflicts; no writes; **never print raw API keys** |
| Mapping report | JSON: v1_user_id→email, wl/group id preservation; secrets only `{migrated:true\|false}` |
| Re-run | upsert by preserved PKs / natural keys; safe second run |
| Transactions | per-tenant batch; fail → no partial tenant |
| FK order | users → watchlists → members → tags → groups → group_members → settings → ai_configs |
| Email conflict | stop with report unless `--map` provides winner |
| access_iss/sub | both NULL on migrate; first Access login binds (R2-01 / R3-01) |
| AI secrets | require `--kek-env XRAY_SECRETS_KEK` (or file); write **only** `ai_configs.api_key_ciphertext`; never plaintext settings |
| zhe.to | skip secrets; UI empty → user reconfigure |
| Automated tests | L1/L2: second run idempotent; email conflict; map file; tenant rollback; kek required for secret rows; dry-run no D1 writes |

## 3. Cutover runbook (with 07 M8)

1. **Freeze** v1 writes (maintenance banner / stop Railway traffic).  
2. Final `wrangler d1 export` backup of prod D1 (if any).  
3. Final sqlite snapshot from v1.  
4. `--dry-run` on snapshot → review report.  
5. Apply migrations on prod D1.  
6. `--target remote` migrate.  
7. Validate SQL counts vs snapshot.  
8. Smoke Access login + empty timeline.  
9. Unfreeze; enable ingest host DNS.  
10. If fail: rollback Worker version; restore D1 from export; re-enable v1.

## 4. Post-migration

- Items empty; empty-state documents push + ingest host.  
- First Access login: upsert user by email, set access_iss/sub.

## 5. Validation SQL

```sql
SELECT count(*) FROM watchlists;
SELECT count(*) FROM watchlist_members WHERE source_type='x.com';
SELECT count(*) FROM groups;
SELECT count(*) FROM group_members;
SELECT count(*) FROM items;  -- expect 0
```
