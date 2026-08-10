# 05 — Data Migration

## 1. In scope (locked)

| Table | Migrate? |
|-------|----------|
| `user` (real only; skip e2e-test-user) | yes |
| `watchlists` | **yes** |
| `watchlist_members` | **yes** |
| `tags` / `watchlist_member_tags` | **yes** |
| `groups` / `group_members` | **yes** |
| AI-related `settings` | yes (remap keys) |
| `twitter_profiles` | optional warm cache |
| **`fetched_posts` / posts** | **NO** (D7) |
| `fetch_logs` | no |
| TweAPI `api_credentials` / credits / usage | **drop** |
| `webhooks` | **drop** |
| NextAuth sessions/accounts | drop (Access replaces) |

## 2. Tool

```
scripts/migrate-v1-to-d1.ts
  --sqlite path/to/xray.db
  --local | --remote (explicit)
```

Steps: read v1 → map users by email → insert watchlists/members/tags/groups → apply AI settings remap → validate counts.

Preserve integer PKs for watchlists/groups/members where possible.

## 3. Post-migration empty timeline

Expected: WL/groups present, **items empty**. User/agents start pushing.

UI empty state: explain push token + sample curl.

## 4. Validation

```sql
SELECT count(*) FROM watchlists;
SELECT count(*) FROM watchlist_members;
SELECT count(*) FROM groups;
SELECT count(*) FROM group_members;
-- items must be 0 after fresh migrate
SELECT count(*) FROM items;
```

## 5. Rollback

Immutable backup `backups/xray-v1-YYYYMMDD.db`; D1 export before remote load.
