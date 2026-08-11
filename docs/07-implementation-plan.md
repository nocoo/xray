# 07 — Implementation Plan（执行细化）

**分支：`main`（D8）。** 原子 commit；S3 后强制 hooks + **mandatory CI**。  
决策：[08](08-open-questions.md)。Codex review 修复项已并入 02–06。

---

## 进度（2026-08-11）

| 阶段 | 状态 | 说明 |
|------|------|------|
| **S1** | **完成** | v1 归档 + monorepo + `/api/live` + UI 可启动 |
| **S2** | **完成** | Access/bypass + users + `/api/me` + SessionGate + mock 页 + card shells |
| **S3** | **完成** | L1/G1 hooks、L2 skeleton + coverage gate、GHA CI、RL stub |
| **S4** | **完成（主路径）** | 全 schema + repos/API + UI 真名单；migrate 脚本按 v1 schema 可 dry-run/apply |
| **S5** | **完成** | M0–M8：AI/translate、zhe.to、dashboard、Groups/Settings UI、Playwright L3 骨架、release 2.0.0 |

### S4 已落地

| 项 | 位置 |
|----|------|
| `0001_full_schema.sql` | watchlists/members/tags/groups/items/push_tokens/settings/ai_configs/… |
| Repos + unit tests | `packages/worker/src/repos/*` |
| CRUD APIs | `/api/watchlists`, members, tags, groups, settings |
| UI 真数据 | Watchlists / Detail / Groups / Tokens 调 Worker |
| migrate script | `bun run migrate:v1 -- --sqlite … --dry-run` |

### S5 已落地（MVP 路径）

| 项 | 位置 |
|----|------|
| Push tokens mint/list/revoke | `/api/push-tokens` + UI |
| Ingest push + Bearer | `POST /api/v1/ingest/push`（ingest host） |
| Timeline items list | `GET /api/watchlists/:id/items` + source_type filter |
| source_type chips | shared + UI |

**S5 出口已满足**：AI KEK + translate batch、zhe.to save、dashboard 真聚合、Groups/Settings UI、L3 smoke 文件、版本 2.0.0。

### 相关 commit（实现段摘录）

```
feat(worker): d1 full schema …
feat(worker): watchlists groups items tokens push …
feat(ui): wire real watchlist group token apis …
```

**当前停点**：S5 完成；生产 dual-host 已部署；Codex S45 主路径已签。

---

## 总览 S1–S5

| 阶段 | 目标 | 出口 | 状态 |
|------|------|------|------|
| **S1** | v1→`legacy/v1/` + monorepo 骨架 | live + 空 UI | **done** |
| **S2** | Access + sidebar + mock 页 + **最小 users 表** | 可登录浏览 mock | **done** |
| **S3** | L1/G1 pre-commit；L2/G2 pre-push；**CI required** | hook+CI 绿（无 L3） | **done** |
| **S4** | 全 schema + 迁移 WL/Groups | 真名单、空 items | **done** |
| **S5** | 模块 + 递增 E2E → 2.0.0 | 全功能 + L3 CI | **done** |

```
S1 ✓ → S2 ✓ → S3 ✓ → S4 ✓ → S5(主路径✓ / L3+AI 加深)
```

---

## S1 — 存档 + 新结构

| # | 内容 | 状态 |
|---|------|------|
| S1.1–S1.6 | legacy/v1、workspaces、shared/ui/worker、README | **done** |

---

## S2 — 可登录架子 + Mock 页

| # | Commit | 状态 |
|---|--------|------|
| S2.1–S2.9 | palette / shell / auth / me / mocks / cards | **done** |

**出口**：bypass 登录；users 行存在于 local D1 — **已满足**。

---

## S3 — 6DQ 自动化（无 E2E）+ CI 必选

| # | 内容 | 状态 |
|---|------|------|
| S3.1–S3.10 | unit / coverage / husky / GHA / RL stub | **done** |

---

## S4 — 全 Schema + 迁移

| # | 内容 | 状态 |
|---|------|------|
| S4.1 | `0001_full_schema.sql` | **done** |
| S4.2 | `normalizeHandle` + SOURCE_TYPES | **done** |
| S4.3–S4.4 | watchlists / members / tags repos+routes | **done** |
| S4.5 | groups repos+routes | **done** |
| S4.6 | items list + settings | **done** |
| S4.7 | `scripts/migrate-v1-to-d1.ts` | **partial** (required tables/owner/KEK/spawn; L2 migrate e2e still thin) |
| S4.8 | UI 接真 API | **done** |

**出口**：真名单、空 items — **已满足**。

---

## S5 — 模块 + 递增 E2E

| # | 内容 | 状态 |
|---|------|------|
| M0 | Watchlist CRUD | **done** |
| M0.5 | Settings windowHours | **done**（API + UI） |
| M1 | Items timeline + source filter | **done**（+ Translate 按钮） |
| M2 | Groups CRUD | **done**（UI rename/delete/members） |
| M3 | Push tokens | **done** |
| M4 | Ingest push canonical | **done** |
| M5 | AI settings / translate batch | **done** |
| M6 | zhe.to save | **done** |
| M7 | Dashboard real aggregates | **done** |
| M8 | Playwright L3 + release 2.0.0 | **done**（`e2e/*.pw.ts` + `test:l3`；需本机 UI/worker 才绿；version 2.0.0 已对齐，无 in-repo release 脚本故未切 tag） |

---

## 提交纪律

1. main only；atomic conventional commits。  
2. 不 `git add -A`。  
3. S3 后每 commit 过 pre-commit；push 过 pre-push + CI。  
4. S5 模块附带 e2e 增量。  

## 下一步

1. 可选：本地起 UI+worker 后跑 `bun run test:l3`  
2. 可选：生产 Access 浏览器登录 smoke + 真 push  
3. 可选：`git push` + 项目 release 流程发 GitHub tag `2.0.0`  

