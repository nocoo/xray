# 07 — Implementation Plan（执行细化）

**分支：`main`（D8）。** 原子 commit；S3 后强制 hooks + **mandatory CI**。  
决策：[08](08-open-questions.md)。Codex review 修复项已并入 02–06。

---

## 总览 S1–S5

| 阶段 | 目标 | 出口 |
|------|------|------|
| **S1** | v1→`legacy/v1/` + monorepo 骨架 | live + 空 UI |
| **S2** | Access + sidebar + mock 页 + **最小 users 表** | 可登录浏览 mock |
| **S3** | L1/G1 pre-commit；L2/G2 pre-push；**CI required** | hook+CI 绿（无 L3） |
| **S4** | 全 schema + 迁移 WL/Groups | 真名单、空 items |
| **S5** | 模块 + 递增 E2E → 2.0.0 | 全功能 + L3 CI |

```
S1 → S2 → S3 → S4 → S5(M0…M8)
```

---

## S1 — 存档 + 新结构

同前：S1.1–S1.6（legacy/v1、workspaces、shared/ui/worker stubs、readme banner）。

**出口**：`bun install`；worker `/api/live`；ui 占位。

---

## S2 — 可登录架子 + Mock 页

### XR-03 锁定

- **S2.3a** 落地 migration `0000_users.sql`（仅 `users` 表，含 access_iss/sub/email）。
- `/api/me` **写入 D1 users**（upsert by access identity）—— **禁止** 内存/临时 sqlite 分叉。
- 其余业务表仍在 S4。

### 原子提交

| # | Commit | 内容 |
|---|--------|------|
| S2.1 | `feat(ui): port css palette shadcn` | |
| S2.2 | `feat(ui): app shell sidebar nav` | v2 菜单 only |
| S2.3 | `feat(worker): users migration and access middleware` | 0000_users + verifyAuth + ALLOWED_EMAILS |
| S2.4 | `feat(worker): api me upsert user` | |
| S2.5 | `feat(ui): session gate me client` | |
| S2.6 | `feat(ui): mock dashboard watchlists` | |
| S2.7 | `feat(ui): mock groups integrations ai settings tokens` | |
| S2.8 | `feat(ui): tweet and custom card shells` | |
| S2.9 | `chore: dev scripts and ingest host notes` | |

**出口**：bypass 登录；全路由 mock；users 行存在于 local D1。

---

## S3 — 6DQ 自动化（无 E2E）+ CI 必选

| # | Commit | 内容 |
|---|--------|------|
| S3.1–S3.5 | unit + mock-d1 + l2 harness | 含 tenant-isolation 骨架 |
| S3.6 | coverage gate | |
| S3.7 | husky pre-commit L1 G1 gitleaks | |
| S3.8 | husky pre-push L2 G2 | |
| S3.9 | `ci: gha workflow l1 l2 g1 g2` | post-push status + release gate (R2-04) |
| S3.10 | `feat(worker): rate-limit binding stub` | wrangler `XRAY_INGEST_RL` for ingest |

**出口**：坏 L1 无法 commit；坏 L2 无法 **push**（pre-push）；CI red 则 **禁止 release/cutover**。

---

## S4 — 全 Schema + 迁移

| # | Commit | 内容 |
|---|--------|------|
| S4.1 | `feat(worker): d1 migrations full schema` | 03 全表+约束 |
| S4.2 | `feat(worker): repos watchlists groups` | |
| S4.3 | `feat(worker): watchlists groups read apis` | |
| S4.4 | `feat(ui): wire lists to api` | |
| S4.5 | `feat(scripts): migrate-v1-to-d1 dry-run` | XR-12 / R3-02 kek for ai_configs |
| S4.6 | `chore: docs cutover validate counts` | |
| S4.7 | `test: l2 lists after migrate` | |
| S4.8 | `test: migrate idempotent and conflict cases` | R3-11 |

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

从 **S1.1** 开工。
