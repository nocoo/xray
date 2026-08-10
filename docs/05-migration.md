# 05 — Data Migration

## 1. In scope (locked)

| Source | Migrate? |
|--------|----------|
| users (real; skip e2e-test-user) | yes — email match; access_* NULL until first login |
| watchlists / members / tags | yes — members → source_type=`x.com`, normalized handle |
| groups / group_members | yes |
| AI settings | yes — secrets → encrypted `ai_configs` via KEK |
| zhe.to credentials | **no** — user re-enters |
| fetched_posts | **NO** |
| TweAPI / webhooks / usage | drop |

## 2. Tool

```bash
bun run scripts/migrate-v1-to-d1.ts \
  --sqlite path/to/xray.db \
  --target local|remote \
  --dry-run \
  --kek-env XRAY_SECRETS_KEK \
  --map email-map.json
```

### Idempotency & safety

| Requirement | Behavior |
|-------------|----------|
| Dry-run | counts + conflicts; no writes; never print raw keys |
| Mapping report | ids/emails; secrets `{migrated:bool}` only |
| Re-run | safe upsert by preserved PKs |
| Transactions | per-tenant; fail → no partial tenant |
| FK order | users → wl → members → tags → groups → gm → settings → ai_configs |
| AI secrets | require KEK; write ciphertext only |
| Tests | second run; email conflict; map; tenant rollback; kek required; dry-run |

## 3. Unique cutover runbook (R4-02) — single ordered list

**Pre-cutover (no traffic switch yet)**

1. Create prod D1 `xray-db`; apply all migrations.  
2. Deploy Worker with bindings: D1, `XRAY_INGEST_RL`, secrets (`CF_ACCESS_*`, `ALLOWED_EMAILS`, `XRAY_SECRETS_KEK`, key version).  
3. Configure Access: browser host **required**; ingest host **bypass**.  
4. Staged smoke against workers.dev or temporary route (optional).

**Cutover**

5. **Freeze v1** (maintenance / stop Railway writes).  
6. Final v1 sqlite snapshot + checksum.  
7. `migrate --dry-run` → review.  
8. `migrate --target remote` + validate SQL counts.  
9. Smoke on Worker with hosts still pointing old or temp: Access login path + internal push test.  
10. **Switch browser DNS** `xray.hexly.ai` → Worker.  
11. Smoke browser login + empty timeline.  
12. **Enable ingest DNS** `xray-ingest.hexly.ai` → Worker.  
13. Smoke `curl` Bearer push.  
14. **Unfreeze** / announce.  
15. Monitor logs 24h.

**Rollback**

1. **Disable ingest DNS first** (stop external writes).  
2. Point browser DNS back to v1 **or** previous Worker version.  
3. Restore D1 from pre-migrate export if data corrupt.  
4. Re-enable v1 Railway if needed.  
5. Do **not** leave ingest open while rolling back browser.

## 4. Post-migration

Items empty; first Access login binds iss/sub (02 R3-01).

## 5. Validation SQL

```sql
SELECT count(*) FROM watchlists;
SELECT count(*) FROM watchlist_members WHERE source_type='x.com';
SELECT count(*) FROM groups;
SELECT count(*) FROM items;  -- 0
```
