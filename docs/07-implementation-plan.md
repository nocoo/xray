# 07 — Implementation Plan（执行细化）

**分支：`main`（D8）。** 原子 commit；S3 后强制 hooks + **mandatory CI**。  
决策：[08](08-open-questions.md)。Codex review 修复项已并入 02–06。

---

## 进度（2026-08-10）

| 阶段 | 状态 | 说明 |
|------|------|------|
| **S1** | **完成** | v1 归档 + monorepo + `/api/live` + UI 可启动 |
| **S2** | **进行中（壳子已过检）** | AppShell + v2 sidebar + CSS 已落地；Access / users / 全 mock 未做 |
| **S3** | 未开始 | hooks 仍为 S1 bootstrap（仅 gitleaks）；完整 L1/L2/CI 待建 |
| **S4** | 未开始 | |
| **S5** | 未开始 | |

### 已落地（代码）

| 项 | 证据 / 位置 |
|----|-------------|
| v1 → `legacy/v1/` | commit `c347626` |
| bun workspaces + Biome + Turbo + TS7 | root `package.json`, `biome.json`, `turbo.json` |
| `@xray/shared` | version、`V2_NAV_*`、nav unit tests |
| `@xray/worker` | Hono + `GET /api/live`（`packages/worker`） |
| `@xray/ui` Vite SPA | port **7007**，Caddy `xray.dev.hexly.ai` |
| CSS tokens / palette 移植 | `packages/ui/src/index.css`（自 v1 `globals.css`） |
| AppShell + v2 sidebar | Dashboard / Watchlists / Groups / zhe.to / AI Settings / Settings / Push Tokens；无 Explore/Usage/Webhooks |
| sidebar 几何微调 | logo/avatar 不抖；右侧 inset 单层 `pr-3`（`9e937fc`, `5606ba9`） |
| 路由占位页 | 各 nav 路径有 Placeholder，非业务 mock |
| 本地 dev | `bun run dev` → UI `:7007` + worker `:8787`；`/api` 代理到 worker |

### 未做（相对 S2 出口 / 后续阶段）

| 项 | 对应 |
|----|------|
| CF Access 中间件、`ALLOWED_EMAILS`、`AUTH_DEV_BYPASS` 真接线 | S2.3–S2.5 |
| D1 `0000_users` + `/api/me` upsert | S2.3a / S2.4（XR-03） |
| 全路由丰富 mock（WL/Groups/AI/tokens 列表数据） | S2.6–S2.7 |
| Tweet / custom card shell | S2.8 |
| 完整 6DQ hooks + CI | S3 |
| 全 schema、迁移、业务 API、E2E、cutover | S4–S5 |

### 相关 commit（实现段，新→旧）

```
5606ba9 fix(ui): tighten sidebar right inset to single band
9e937fc fix(ui): align sidebar chrome to v1 geometry
cd2b703 chore: drop root logo after ui public move
cae0d76 feat(ui): port shell sidebar with v2 nav
f247059 chore: scaffold monorepo with shared and worker
c347626 chore: archive vinext app under legacy/v1
```

### S12 实现审查（Codex 2026-08-10）

已修复并提交：S12-01…S12-10（build 图、dev 先编 shared、production env、layout/a11y、字体、geometry tokens、compat date、dev 版本、biome migrate）。

**当前停点**：本地可运行 sidebar 壳子，供人工检查；下一步从 **S2.3**（users migration + Access middleware）继续。

---

## 总览 S1–S5

| 阶段 | 目标 | 出口 | 状态 |
|------|------|------|------|
| **S1** | v1→`legacy/v1/` + monorepo 骨架 | live + 空 UI | **done** |
| **S2** | Access + sidebar + mock 页 + **最小 users 表** | 可登录浏览 mock | **partial**（shell done） |
| **S3** | L1/G1 pre-commit；L2/G2 pre-push；**CI required** | hook+CI 绿（无 L3） | todo |
| **S4** | 全 schema + 迁移 WL/Groups | 真名单、空 items | todo |
| **S5** | 模块 + 递增 E2E → 2.0.0 | 全功能 + L3 CI | todo |

```
S1 ✓ → S2 ◐ → S3 → S4 → S5(M0…M8)
```

---

## S1 — 存档 + 新结构

| # | 内容 | 状态 |
|---|------|------|
| S1.1 | vinext 树归档 `legacy/v1/`（保留 `docs/`、`database/`） | **done** `c347626` |
| S1.2 | root workspaces + Biome + Turbo + TS7 | **done** `f247059` |
| S1.3 | `@xray/shared` stub（version / nav） | **done** |
| S1.4 | `@xray/worker` + wrangler + `GET /api/live` | **done** |
| S1.5 | `@xray/ui` Vite React 占位 / 可启动 | **done** |
| S1.6 | README banner + root `dev` scripts | **done** |

**出口**：`bun install`；worker `/api/live`；ui 可开 — **已满足**。

---

## S2 — 可登录架子 + Mock 页

### XR-03 锁定

- **S2.3a** 落地 migration `0000_users.sql`（仅 `users` 表，含 access_iss/sub/email）。
- `/api/me` **写入 D1 users**（upsert by access identity）—— **禁止** 内存/临时 sqlite 分叉。
- 其余业务表仍在 S4。

### 原子提交

| # | Commit | 内容 | 状态 |
|---|--------|------|------|
| S2.1 | `feat(ui): port css palette shadcn` | CSS tokens / shadcn 子集 | **done**（合入 `cae0d76` + primitives） |
| S2.2 | `feat(ui): app shell sidebar nav` | v2 菜单 only | **done** `cae0d76`（几何 follow-ups `9e937fc` `5606ba9`） |
| S2.3 | `feat(worker): users migration and access middleware` | 0000_users + verifyAuth + ALLOWED_EMAILS | **todo** |
| S2.4 | `feat(worker): api me upsert user` | | **todo** |
| S2.5 | `feat(ui): session gate me client` | | **todo** |
| S2.6 | `feat(ui): mock dashboard watchlists` | 现仅 Placeholder | **todo** |
| S2.7 | `feat(ui): mock groups integrations ai settings tokens` | 现仅 Placeholder | **todo** |
| S2.8 | `feat(ui): tweet and custom card shells` | | **todo** |
| S2.9 | `chore: dev scripts and ingest host notes` | root `dev` 已有；ingest host 笔记可补 | **partial** |

**出口**：bypass 登录；全路由 mock；users 行存在于 local D1 — **未满足**（差 S2.3–S2.8）。

---

## S3 — 6DQ 自动化（无 E2E）+ CI 必选

| # | Commit | 内容 | 状态 |
|---|--------|------|------|
| S3.1–S3.5 | unit + mock-d1 + l2 harness | 含 tenant-isolation 骨架 | todo |
| S3.6 | coverage gate | | todo |
| S3.7 | husky pre-commit L1 G1 gitleaks | 现 bootstrap：仅 staged gitleaks | **partial** |
| S3.8 | husky pre-push L2 G2 | 现 placeholder echo | **partial** |
| S3.9 | `ci: gha workflow l1 l2 g1 g2` | post-push status + release gate (R2-04) | todo |
| S3.10 | `feat(worker): rate-limit binding stub` | wrangler `XRAY_INGEST_RL` for ingest | todo |

**出口**：坏 L1 无法 commit；坏 L2 无法 **push**（pre-push）；CI red 则 **禁止 release/cutover**。

---

## S4 — 全 Schema + 迁移

| # | Commit | 内容 | 状态 |
|---|--------|------|------|
| S4.1 | `feat(worker): d1 migrations full schema` | 03 全表+约束 | todo |
| S4.2 | `feat(worker): repos watchlists groups` | | todo |
| S4.3 | `feat(worker): watchlists groups read apis` | | todo |
| S4.4 | `feat(ui): wire lists to api` | | todo |
| S4.5 | `feat(scripts): migrate-v1-to-d1 dry-run` | XR-12 / R3-02 kek for ai_configs | todo |
| S4.6 | `chore: docs cutover validate counts` | | todo |
| S4.7 | `test: l2 lists after migrate` | | todo |
| S4.8 | `test: migrate idempotent and conflict cases` | R3-11 | todo |

**出口**：真实 WL/Groups 名称；items=0。

---

## S5 — 模块 + 递增 E2E

### 模块顺序（含 XR-10）

```
M0 Watchlist CRUD          ← 新增，在 tokens/ingest 前
M1 Push tokens
M2 Ingest push + timeline
M3 Members/tags
M4 AI settings + translate
M5 Groups writes
M6 Dashboard real
M7 zhe.to (incl. save e2e)
M8 Cutover + release
```

全部 **todo**。

### M0 — Watchlist CRUD + general settings

| Commits | |
|---------|--|
| `feat(worker): watchlists write apis` | POST/PATCH/DELETE + tenant tests |
| `feat(ui): watchlist create edit delete` | |
| `feat(worker+ui): general settings windowHours` | R3-07 |
| `test(e2e): create watchlist` | 引入 Playwright 脚手架 |

### M1 — Push tokens

mint/list/revoke；e2e create/revoke。

### M2 — Ingest + timeline + logs

canonical validation；push on **ingest host**；items list cursor；**ingest_logs API+UI**；host-routing L2 matrix；e2e push mix。

### M3 — Members

source-aware members；e2e add/remove。

### M4 — AI

encrypted config；bounded translate；ai_status；e2e smoke。

### M5 — Groups

writes + import + add-to-WL；e2e。

### M6 — Dashboard

real aggregates；pending AI uses ai_status；e2e counts。

### M7 — zhe.to

full contract 04§5；**e2e save from card** with mock upstream。

### M8 — Cutover

**Follow 05 §3 exactly** (R5-01): CI/L3 green + D1 export **before** freeze; staging hosts for smoke; browser DNS then ingest DNS; rollback stops ingest first.

---

## 提交纪律

1. main only；atomic conventional commits。  
2. 不 `git add -A`。  
3. S3 后每 commit 过 pre-commit；push 过 pre-push + CI。  
4. S5 模块附带 e2e 增量。  

## 删除检查

```bash
rg -i 'tweapi' --glob '!docs/legacy/**' --glob '!legacy/**' --glob '!**/node_modules/**'
rg -n 'vinext|next-auth' packages || true
rg -n 'fetch_interval|cron' packages/worker/src || true
```

## 下一步

从 **S2.3** 开工：`0000_users` migration + Access middleware + `ALLOWED_EMAILS`（XR-03），然后 S2.4 `/api/me` upsert。
