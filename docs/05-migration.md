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

**Pre-cutover (no production DNS yet) — R5-01**

1. Create prod D1 `xray-db`; apply all migrations.  
2. Deploy Worker: bindings D1, `XRAY_INGEST_RL`, secrets (`CF_ACCESS_*`, `ALLOWED_EMAILS`, `XRAY_SECRETS_KEK`, `XRAY_SECRETS_KEK_PREV` empty, `XRAY_SECRETS_KEY_VERSION`).  
3. Access: browser host required; ingest host bypass.  
4. Add **staging hostnames** to Worker allowlist: `xray-staging.hexly.ai` (Access), `xray-ingest-staging.hexly.ai` (bypass) — for smoke only.  
5. **Full CI green including L3** on the release commit (**before** freeze/DNS).  
6. `wrangler d1 export` → store **pre-migrate D1 backup** artifact.

**Cutover**

7. **Freeze v1** writes.  
8. Final v1 sqlite snapshot + checksum.  
9. `migrate --dry-run` → review.  
10. `migrate --target remote` + full validation SQL (05 §5).  
11. Smoke on **staging hosts** (login + push) — not unknown Host.  
12. **Browser DNS** `xray.hexly.ai` → Worker → smoke login.  
13. **Ingest DNS** `xray-ingest.hexly.ai` → smoke push.  
14. **Unfreeze** / announce.  
15. Monitor 24h.

**Rollback**

1. **Disable ingest DNS first**.  
2. Browser DNS → previous target / Worker version pin.  
3. Restore D1 from **step-6 pre-migrate export** if needed.  
4. Re-enable v1 if required.  
5. Never leave ingest open during rollback.

## 4. Post-migration

Items empty; first Access login binds iss/sub (02 R3-01).

## 5. Validation SQL (R5-04)

Compare source sqlite vs D1 for each:

```sql
-- migrated counts (match source)
SELECT count(*) FROM users;
SELECT count(*) FROM watchlists;
SELECT count(*) FROM watchlist_members;
SELECT count(*) FROM tags;
SELECT count(*) FROM watchlist_member_tags;
SELECT count(*) FROM groups;
SELECT count(*) FROM group_members;
SELECT count(*) FROM settings;
SELECT count(*) FROM ai_configs;
-- expect 0 after fresh migrate
SELECT count(*) FROM items;
SELECT count(*) FROM push_tokens;
SELECT count(*) FROM ingest_logs;
SELECT count(*) FROM integration_secrets;
-- orphans / tenant integrity
SELECT count(*) FROM watchlist_members m
  LEFT JOIN watchlists w ON w.id=m.watchlist_id AND w.user_id=m.user_id WHERE w.id IS NULL;
SELECT count(*) FROM group_members gm
  LEFT JOIN groups g ON g.id=gm.group_id AND g.user_id=gm.user_id WHERE g.id IS NULL;
SELECT count(*) FROM watchlist_member_tags j
  LEFT JOIN watchlist_members m ON m.id=j.member_id WHERE m.id IS NULL;
SELECT count(*) FROM watchlist_member_tags j
  LEFT JOIN tags t ON t.id=j.tag_id WHERE t.id IS NULL;
```
