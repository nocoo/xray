# 01 — Rewrite Charter

## 1. Why rewrite

Current X-Ray (v1.9.x) is vinext + Railway SQLite + TweAPI. Pain points: fragile auth under vinext, dead TweAPI, non-standard deploy vs CF fleet, tooling drift from bat-class (TS7 + Biome + Vite), Explore/My Account scope creep.

Rewrite = **clean cut**. Design/CSS stay; engine, auth, deploy, and ingest model change.

## 2. Product mission

> 用户维护 Watchlist，汇聚 **多类型 source** 的信息流（默认 x.com，也支持 custom / 外部 agent 注入），在统一时间线浏览，并用 AI 做 **翻译 + 自动总结**。

核心不是「平台去拉 X」，而是 **平台提供 push 接口**，由 CLI / hermes agent / 其他生产者把规范化条目写入；一个 watchlist 可 **mix** 多种来源。

## 3. Locked decisions (2026-08-10)

| ID | Decision |
|----|----------|
| D1 | **Auth = Cloudflare Access + Google IdP**（仿 bat/surety）；Worker 验 `Cf-Access-Jwt-Assertion` |
| D2 | **Ingest = push-first**；提供 API；CLI（twitter-cli 类）及其他 source 经同一 push 入口 |
| D3 | **Usage 删除；Webhooks 删除** |
| D4 | **AI Settings 独立页面保留**；复用 gecko / `@nocoo/next-ai` 类能力（Workers 侧用 server-safe 部分） |
| D5 | **Push token 管理页面**（创建/吊销/标注；仅 Access 会话可 mint，仿 bat cli_tokens） |
| D6 | **zhe.to 集成完整保留** |
| D7 | **不迁历史 posts**；只迁 watchlists/groups/members/tags |
| D8 | **直接在 `main` 上改**（接受过渡期不可部署） |
| D9 | **不要自动刷新**（无 CF Cron 扫 member interval；无平台主动 pull 调度） |
| D10 | 引入 **source 类型字段**；watchlist 管理 **同类或 mix** 信息流 |

### By design 补充（用户确认 2026-08-10，详见 [08](08-open-questions.md) BD-1…BD-9）

| ID | 一句话 |
|----|--------|
| BD-1 | main 直推；硬门禁 pre-push，CI 不拦 direct push |
| BD-2 | 限流 per-CF-location best-effort，不用 DO 全局 |
| BD-3 | 不迁历史 posts |
| BD-4 | 不迁 zhe.to 密钥，UI 重填 |
| BD-5 | 无自动刷新 / Cron pull |
| BD-6 | push 路径不跑 AI |
| BD-7 | staging 与 prod 共用 Access AUD |
| BD-8 | push 去重 insert-ignore |
| BD-9 | 冗余 user_id + 测试保证租户，不做 composite FK |

## 4. Scope — keep

| Area | Capability |
|------|------------|
| **Dashboard** | 总览：watchlist 数、近 24h 条目、待翻译等 |
| **Watchlists** | CRUD；members（可带 source 绑定）；**混合时间线**；手动相关操作（无 auto cron）；AI 翻译+总结；logs |
| **Groups** | CRUD；成员；批量导入；向 watchlist 输送成员 |
| **Integrations** | **zhe.to 完整保留** |
| **AI Settings** | 独立路由 `/ai-settings`（或 `/settings/ai` 独立页，导航单独一项） |
| **Settings** | 通用偏好；**Push tokens** 管理 |
| **Auth UX** | CF Access 登录墙；应用内可无自建 Google OAuth 页（或极简「未授权」页） |

## 5. Scope — delete (complete)

| Area | Removed |
|------|---------|
| Explore | `/tweets`, `/users`, explore APIs |
| My Account | `/analytics`, `/bookmarks`, `/likes`, `/lists`, `/messages` |
| Usage | `/usage`, credits UI/API |
| Webhooks | `/webhooks` 产品面与对外 webhook key（push tokens **不是** webhooks 产品） |
| TweAPI | 全部 provider/env/docs 非 legacy |
| Auto refresh | `fetch_interval` cron、平台 pull 调度 |
| vinext / NextAuth / Railway runtime | 整树替换 |

## 6. Non-goals (v2 MVP)

- Worker 出站 pull X API（可后期加 adapter，**非 MVP**）
- CF Cron 自动抓取
- 历史 posts 迁移与 TweAPI JSON 回填
- 多租户计费 / public SaaS
- 兼容 `/api/xauth` 与 vinext URL

## 7. Success criteria

1. **Prod browser** `https://xray.hexly.ai`：CF Access Google 登录后进 Dashboard。  
   **Dev** `https://xray.dev.hexly.ai`：Worker `AUTH_DEV_BYPASS`（仅 development/test）。
2. **Prod ingest** `https://xray-ingest.hexly.ai`：Bearer push 可达；browser host 不做 agent push。
3. 迁移后 sidebar 出现原 watchlists/groups（无 posts）。
4. Push token → `POST /api/v1/ingest/push` 写入 x.com + custom → 同一 watchlist mix 时间线。
5. AI Settings 可配；有界手动翻译+总结；密钥 AES-256-GCM 加密。
6. zhe.to **保存路径**（含从卡片保存）可用。
7. TweAPI 清零（排除 `docs/legacy/**` 与 `legacy/**`）；无 Usage/Webhooks/Explore/My Account。
8. 6DQ + **mandatory CI**；部署 CF Workers + D1。

## 8. Versioning

- First ship: **2.0.0** (major).
- Root `package.json` single source of truth.

## 9. References

| Ref | Use |
|-----|-----|
| `../bat` | monorepo, Biome, TS7, Vite→worker static, D1, **Access auth**, **cli_tokens** |
| `../surety` | Access middleware fail-closed |
| `../gecko` + `@nocoo/next-ai` design | AI Settings UI/provider model |
| X API v2 tweet | canonical shape for `source_type=x.com` payload |
| twitter-cli / hermes | external producers via push |
| `docs/legacy/*` | historical only |
