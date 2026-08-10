# 08 — Decisions Log

原 Open Questions 已于 **2026-08-10** 关闭。  
**2026-08-10 Codex design review**：P0–P3 已并入 02–07（见下表）。

## Product decisions (D1–D10)

| ID | Decision |
|----|----------|
| D1 | CF Access + Google；Worker 验 JWT |
| D2 | Push-first；无 Cron pull |
| D3 | Usage/Webhooks 删除 |
| D4 | AI Settings 独立页；gecko/next-ai 模式 |
| D5 | Push tokens 管理页；Access-only mint |
| D6 | zhe.to 完整保留（含卡片保存契约） |
| D7 | 不迁 posts |
| D8 | 直接 main |
| D9 | 不要自动刷新 |
| D10 | source_type + mix timeline；members source-aware |

## Review locks (Codex XR-01…28)

| ID | Level | Resolution summary |
|----|-------|-------------------|
| XR-01 | P0 | Dual host: `xray.hexly.ai` Access；`xray-ingest.hexly.ai` bypass push only |
| XR-02 | P1 | users UNIQUE(access_iss, access_sub)；email 展示/迁移 |
| XR-03 | P1 | S2 即 users migration；禁止临时 DB 分叉 |
| XR-04 | P1 | Discriminated CanonicalItem + 完整 XTweet 子集 |
| XR-05 | P1 | members/groups source_type+handle |
| XR-06 | P1 | AI 仅手动有界同步 batch；ai_status 状态机 |
| XR-07 | P1 | envelope encryption + KEK |
| XR-08 | P1 | body/rate limits + markdown sanitize |
| XR-09 | P1 | cursor pagination (created_at_ms, id) |
| XR-10 | P1 | S5 M0 Watchlist CRUD |
| XR-11 | P1 | zhe.to 行为契约 + save e2e |
| XR-12 | P1 | migration dry-run/idempotent/cutover freeze |
| XR-13 | P1 | tenant isolation L2 matrix |
| XR-14 | P1 | CI mandatory required checks |
| XR-15 | P1 | normative SQL constraints in 03 |
| XR-16 | P2 | insert-ignore dedupe；partial 200+errors |
| XR-17 | P2 | UTC ms storage |
| XR-18 | P2 | window priority；no null unlimited default |
| XR-19 | P2 | `/api/v1/ingest/push` canonical only |
| XR-20 | P2 | ai_status；logs/settings in modules |
| XR-21 | P2 | AUTH_DEV_BYPASS only；ports locked |
| XR-22 | P2 | ALLOWED_EMAILS mandatory；Origin on mutations |
| XR-23 | P2 | M8 cutover/rollback checklist |
| XR-24 | P2 | observability minimum |
| XR-25 | P3 | token CRUD vs push auth wording split |
| XR-26 | P3 | prod host xray.hexly.ai only in success criteria |
| XR-27 | P3 | items naming not posts |
| XR-28 | P3 | DELETE /api/push-tokens/:id；rg excludes |
| R2-01 | P0 | users access_* nullable pair + partial unique (migration OK) |
| R2-02 | P1 | ingest never enqueues AI |
| R2-03 | P1 | full SQL for all MVP tables in 03 |
| R2-04 | P1 | pre-push hard gate; CI post-push + release gate |
| R2-05 | P1 | token_prefix + SHA-256 hash format locked |
| R2-06 | P1 | CF Rate Limiting binding for ingest |
| R2-07 | P1 | AES-256-GCM envelope format locked |

## Flexible defaults

| Topic | Default |
|-------|---------|
| Multi-user row isolation | yes |
| AI providers | multi, user-configured |
| Visual debt | none — full CSS retain |
