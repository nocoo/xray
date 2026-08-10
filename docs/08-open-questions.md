# 08 — Decisions Log

原「Open Questions」已于 **2026-08-10** 全部关闭。本文档为决策存档；新问题追加在文末。

## Closed decisions

| ID | Topic | Decision |
|----|-------|----------|
| **D1** | Auth | **Cloudflare Access + Google IdP**；Worker 校验 `Cf-Access-Jwt-Assertion`（bat/surety 模式）。不做 app 内 NextAuth/Google OAuth 主会话。 |
| **D2** | Ingest | **Push-first**。提供 `POST /api/ingest/push`；CLI（twitter-cli 类）、hermes agent 等外部生产者推送。MVP **不做** Worker 出站 pull / X 官方 API 拉取。 |
| **D3** | Usage / Webhooks | **Usage 删除；Webhooks 删除。** |
| **D4** | AI Settings | **独立页面保留**。复用 gecko / `@nocoo/next-ai` 的 provider 与设置 UX 模式；Worker 侧用 server-safe AI helpers。 |
| **D5** | Push 认证 UI | **Settings 下 Push tokens 管理页**：创建（一次性展示 secret）/ 列表 / 吊销。仅 Access 会话可 mint（仿 bat `cli_tokens`）。 |
| **D6** | Integrations | **zhe.to 完整保留。** |
| **D7** | 历史 posts | **不迁移** `fetched_posts`。只迁 watchlists/groups/members/tags（+ 必要 users/AI settings）。 |
| **D8** | 分支 | **直接在 `main` 上改。** |
| **D9** | 自动刷新 | **不要** CF Cron / 平台定时 pull / member `fetch_interval` 调度。 |
| **D10** | Source 模型 | 引入 **`source_type`**（`x.com` \| `custom` \| …）。Watchlist 时间线支持 **单源或 mix**；外部可向平台主动注入信息。 |

## Product implications (summary)

```
CF Access (Google) → Dashboard SPA
                         │
External agents ──Bearer push token──► /api/ingest/push
                         │
                    items(source_type, …)
                         │
              watchlist mixed timeline + AI
                         │
                    zhe.to save (kept)
```

## Still flexible (non-blocking)

| Topic | Default if unspecified |
|-------|------------------------|
| Multi-user D1 row isolation | **Yes** (scoped by Access email → user id) |
| Prod host | `xray.hexly.ai` |
| Dev host | `xray.dev.hexly.ai` / port 7007 |
| AI default provider list | Match gecko multi-provider set; user configures |
| Encrypt AI keys at rest | MVP: server-only storage via Access API; encryption optional follow-up |
| Visual debt during port | **None** — full CSS/design retain |

## New questions (add below if any)

| ID | Question | Status |
|----|----------|--------|
| | | |
