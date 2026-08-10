# 07 — Implementation Plan（执行细化）

**分支：`main`（D8）。** 原子 commit；S3 后强制 hooks + **mandatory CI**。  
决策：[08](08-open-questions.md)。Codex review 修复项已并入 02–06。

---

## 进度（2026-08-10）

| 阶段 | 状态 | 说明 |
|------|------|------|
| **S1** | **完成** | v1 归档 + monorepo + `/api/live` + UI 可启动 |
| **S2** | **完成** | Access/bypass + users + `/api/me` + SessionGate + mock 页 + card shells |
| **S3** | **完成** | L1/G1 hooks、L2 skeleton + coverage gate、GHA CI、RL stub |
| **S4** | 未开始 | 全 schema + WL/Groups 迁移 |
| **S5** | 未开始 | 业务模块 + E2E → 2.0.0 |

### S2 已落地

| 项 | 位置 |
|----|------|
| `0000_users.sql` | `packages/worker/migrations/` |
| Access + `AUTH_DEV_BYPASS` + `ALLOWED_EMAILS` | `middleware/access-auth.ts` |
| `/api/me` upsert | `routes/me.ts` + `repos/users.ts` |
| UI SessionGate | `packages/ui/src/components/session-gate.tsx` |
| Mock Dashboard/WL/Groups/AI/Tokens/zhe.to | `packages/ui/src/views/*` |
| Tweet + custom card shells | `packages/ui/src/components/cards/*` |

### S3 已落地

| 项 | 位置 |
|----|------|
| Tenant / host matrix skeleton | `packages/worker/src/test/*` |
| Coverage gate | `scripts/check-coverage.sh`，`bun run test:coverage` |
| pre-commit | lint + typecheck + test + gitleaks |
| pre-push | worker tests + coverage + gitleaks（osv optional local） |
| CI | `.github/workflows/ci.yml`（quality + g2 + release-gate） |
| Rate limit stub | `lib/rate-limit.ts` + wrangler 注释 binding |

### 相关 commit（实现段摘录）

```
ci / hooks / coverage / harness …
feat(ui): session gate and mock …
feat(worker): users migration and access …
```

### S23 实现审查修复（Codex）

- compat date 对齐 workerd；Worker-first host allowlist（ingest 不提供 SPA）
- `db:migrate:local` 纳入 dev 启动；JWT 矩阵与 SessionGate 测试
- G2：pre-push `gitleaks detect` + CI OSV 硬失败；coverage 分包强制

**当前停点**：S3 出口满足；下一步 **S4.1** 全 schema migrations。


---

## 总览 S1–S5

| 阶段 | 目标 | 出口 | 状态 |
|------|------|------|------|
| **S1** | v1→`legacy/v1/` + monorepo 骨架 | live + 空 UI | **done** |
| **S2** | Access + sidebar + mock 页 + **最小 users 表** | 可登录浏览 mock | **done** |
| **S3** | L1/G1 pre-commit；L2/G2 pre-push；**CI required** | hook+CI 绿（无 L3） | **done** |
| **S4** | 全 schema + 迁移 WL/Groups | 真名单、空 items | todo |
| **S5** | 模块 + 递增 E2E → 2.0.0 | 全功能 + L3 CI | todo |

```
S1 ✓ → S2 ✓ → S3 ✓ → S4 → S5(M0…M8)
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
| S2.1 | CSS palette | **done** |
| S2.2 | app shell sidebar | **done** |
| S2.3 | users migration + access middleware | **done** |
| S2.4 | api me upsert | **done**（合入 auth commit） |
| S2.5 | session gate me client | **done** |
| S2.6 | mock dashboard watchlists | **done** |
| S2.7 | mock groups integrations ai settings tokens | **done** |
| S2.8 | tweet and custom card shells | **done** |
| S2.9 | dev scripts and ingest host notes | **done** |

**出口**：bypass 登录；全路由 mock；users 行存在于 local D1 — **已满足**（local bypass）。

---

## S3 — 6DQ 自动化（无 E2E）+ CI 必选

| # | 内容 | 状态 |
|---|------|------|
| S3.1–S3.5 | unit + mock-d1 + l2 harness（tenant/host skeleton） | **done** |
| S3.6 | coverage gate | **done** |
| S3.7 | husky pre-commit L1 G1 gitleaks | **done** |
| S3.8 | husky pre-push L2 G2 | **done**（L2=worker unit matrix；full wrangler e2e → S4/S5） |
| S3.9 | GHA workflow l1 l2 g1 g2 + release gate | **done** |
| S3.10 | rate-limit binding stub | **done** |

**出口**：坏 L1 难 commit；坏 L2/coverage 难 push；CI red → 禁止 release — **已满足**（骨架级 L2）。

---

## S4 — 全 Schema + 迁移

| # | Commit | 状态 |
|---|--------|------|
| S4.1–S4.8 | 全 schema、repos、migrate、tests | **todo** |

---

## S5 — 模块 + 递增 E2E

M0–M8 **todo**。

---

## 提交纪律

1. main only；atomic conventional commits。  
2. 不 `git add -A`。  
3. S3 后每 commit 过 pre-commit；push 过 pre-push + CI。  
4. S5 模块附带 e2e 增量。  

## 下一步

从 **S4.1** 开工：`feat(worker): d1 migrations full schema`（docs/03 全表）。
