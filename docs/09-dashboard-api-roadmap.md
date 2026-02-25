# Dashboard API 全量接入执行计划

> 状态：**进行中 — Phase 2 已完成** | 创建：2026-02-25 | 最后更新：2026-02-25

## 1. 背景

Dashboard 目前接入了 TweAPI 的 9/18 个 Twitter 数据接口。本计划将剩余 9 个 Twitter 接口及 2 个平台管理接口全部接入 Dashboard，并重新组织侧边栏导航。

### 1.1 TweAPI 接口全景（来源：OpenAPI Swagger）

| # | 接口路径 | 说明 | 认证方式 | Dashboard 状态 |
|---|---|---|---|---|
| 1 | `POST /v1/twitter/tweet/details` | 推文详情 | API Key | **已实现** |
| 2 | `POST /v1/twitter/tweet/replys` | 推文回复列表 | API Key | 未实现 |
| 3 | `POST /v1/twitter/tweet/search` | 关键词搜索推文 | API Key | **已实现** |
| 4 | `POST /v1/twitter/user/info` | 用户详情 | API Key | **已实现** |
| 5 | `POST /v1/twitter/user/userRecentTweetsByFilter` | 用户最近推文（带过滤） | API Key | **已实现** |
| 6 | `POST /v1/twitter/user/getUserTweetsBySearch` | 搜索用户推文 | API Key | **已实现** |
| 7 | `POST /v1/twitter/user/timeline` | 用户时间线（全部活动） | API Key | 未实现 |
| 8 | `POST /v1/twitter/user/replies` | 用户回复时间线 | API Key | 未实现 |
| 9 | `POST /v1/twitter/user/highLights` | 用户高光/精选推文 | API Key | 未实现 |
| 10 | `POST /v1/twitter/user/follower` | 用户粉丝列表 | API Key | 未实现 |
| 11 | `POST /v1/twitter/user/following` | 用户关注列表 | API Key | 未实现 |
| 12 | `POST /v1/twitter/user/affiliates` | 用户关联账户 | API Key | 未实现 |
| 13 | `POST /v1/twitter/user/analytics` | 蓝V 分析数据 | API Key + Cookie | **已实现** |
| 14 | `POST /v1/twitter/user/bookmarks` | 我的书签 | API Key + Cookie | **已实现** |
| 15 | `POST /v1/twitter/user/likes` | 我的点赞 | API Key + Cookie | **已实现** |
| 16 | `POST /v1/twitter/user/lists` | 我的列表 | API Key + Cookie | **已实现** |
| 17 | `POST /v1/twitter/message/inbox` | 私信收件箱 | API Key + Cookie | 未实现 |
| 18 | `POST /v1/twitter/message/conversation` | 对话消息详情 | API Key + Cookie | 未实现 |

### 1.2 平台管理接口

| # | 接口路径 | 说明 | 认证方式 | Dashboard 状态 |
|---|---|---|---|---|
| 19 | `GET /v1/credits` | 剩余 Credits 余额 | API Key | 未实现 |
| 20 | `GET /v1/credits/usage` | Credits 使用记录 | API Key | 未实现 |

---

## 2. 侧边栏导航设计

```
Dashboard                          /
────────────────────────────────────
EXPLORE WORLD                      ← 分组标题
  Tweets                           /tweets
  Users                            /users
  Connections                      /users/[username]/connections
────────────────────────────────────
MY ACCOUNT                         ← 分组标题
  Analytics                        /analytics
  Bookmarks                        /bookmarks
  Likes                            /likes
  Lists                            /lists
  Messages                         /messages
────────────────────────────────────
Usage                              /usage
Settings                           /settings
```

### 2.1 分组逻辑

- **Explore World**（探索世界）：无需 Cookie，只需 API Key。用于探索 X 平台上的公开内容。
- **My Account**（了解用户）：需要 Cookie，用于访问当前登录用户的私有数据。
- 两组之间通过链接交互：书签/点赞中的推文可跳转到推文详情页，推文作者可跳转到用户资料页。

---

## 3. 页面规划

### 3.1 Explore World — 探索世界

#### 3.1.1 Tweets 推文模块

| 路由 | 页面 | TweAPI 接口 | 功能 |
|---|---|---|---|
| `/tweets` | 推文搜索 | `tweet/search` | 全局关键词搜索推文，结果列表展示 |
| `/tweets/[id]` | 推文详情 | `tweet/details` + `tweet/replys` | 推文完整内容 + 下方回复列表 |

**交互设计**：
- 搜索结果中的推文卡片可点击进入 `/tweets/[id]`
- 推文详情页中的作者头像/名称可跳转到 `/users/[username]`
- 回复列表中每条回复也是可点击的推文卡片

#### 3.1.2 Users 用户模块

| 路由 | 页面 | TweAPI 接口 | 功能 |
|---|---|---|---|
| `/users` | 用户搜索 | `user/info` | 输入用户名查看用户资料 |
| `/users/[username]` | 用户资料页 | 多接口组合（见下方标签页） | 用户 Profile + 多维度内容展示 |

**用户资料页标签页设计**（`/users/[username]`）：

| 标签页 | TweAPI 接口 | 说明 |
|---|---|---|
| Recent | `user/userRecentTweetsByFilter` | 最近推文（已实现） |
| Timeline | `user/timeline` | 全部活动（含转推/回复） |
| Replies | `user/replies` | 用户发出的回复 |
| Highlights | `user/highLights` | 精选/置顶推文 |
| Search | `user/getUserTweetsBySearch` | 在该用户推文中搜索（已实现） |

**交互设计**：
- 用户 Profile 卡片中的粉丝数/关注数可链接到 Connections 页
- 推文列表中每条推文可跳转 `/tweets/[id]`

#### 3.1.3 Connections 社交关系模块

| 路由 | 页面 | TweAPI 接口 | 功能 |
|---|---|---|---|
| `/users/[username]/connections` | 社交关系页 | 多接口组合（见下方标签页） | 粉丝/关注/关联账户列表 |

**标签页设计**：

| 标签页 | TweAPI 接口 | 说明 |
|---|---|---|
| Followers | `user/follower` | 粉丝列表 |
| Following | `user/following` | 关注列表 |
| Affiliates | `user/affiliates` | 关联账户 |

**交互设计**：
- 每个用户卡片可点击跳转 `/users/[username]`

### 3.2 My Account — 了解用户

| 路由 | 页面 | TweAPI 接口 | 功能 |
|---|---|---|---|
| `/analytics` | 数据分析 | `user/analytics` | 已实现，保留 |
| `/bookmarks` | 我的书签 | `user/bookmarks` | 书签推文列表 |
| `/likes` | 我的点赞 | `user/likes` | 点赞推文列表 |
| `/lists` | 我的列表 | `user/lists` | Twitter Lists 概览 |
| `/messages` | 私信收件箱 | `message/inbox` | 收件箱列表 |
| `/messages/[conversationId]` | 对话详情 | `message/conversation` | 具体对话消息 |

**交互设计**：
- 书签/点赞列表中的推文卡片可跳转 `/tweets/[id]`（跨组交互）
- 收件箱列表点击可进入 `/messages/[conversationId]`

### 3.3 平台管理

| 路由 | 页面 | TweAPI 接口 | 功能 |
|---|---|---|---|
| `/usage` | 用量统计 | 现有逻辑 + `GET /v1/credits/usage` | 保留现有用量统计，新增 TweAPI Credits 消费明细面板 |
| `/settings` | 设置 | 现有逻辑 + `GET /v1/credits` | 保留现有设置，新增 Credits 余额卡片 |

---

## 4. ITwitterProvider 接口扩展

### 4.1 新增方法

```typescript
export interface ITwitterProvider {
  // === 已有方法 ===
  fetchUserTweets(username: string, options?: FetchTweetsOptions): Promise<Tweet[]>;
  searchTweets(query: string, options?: SearchTweetsOptions): Promise<Tweet[]>;
  getUserInfo(username: string): Promise<UserInfo>;
  getTweetDetails(tweetId: string): Promise<Tweet>;
  searchUserTweets(username: string, query: string): Promise<Tweet[]>;
  getUserAnalytics(): Promise<AnalyticsWithTimeSeries>;
  getUserBookmarks(): Promise<Tweet[]>;
  getUserLikes(): Promise<Tweet[]>;
  getUserLists(): Promise<TwitterList[]>;

  // === 新增方法（Phase 2-4）===

  // Phase 2: Tweets
  getTweetReplies(tweetId: string): Promise<Tweet[]>;

  // Phase 3: Users
  getUserTimeline(username: string): Promise<Tweet[]>;
  getUserReplies(username: string): Promise<Tweet[]>;
  getUserHighlights(username: string): Promise<Tweet[]>;
  getUserFollowers(username: string): Promise<UserInfo[]>;
  getUserFollowing(username: string): Promise<UserInfo[]>;
  getUserAffiliates(username: string): Promise<UserInfo[]>;

  // Phase 4: Messages
  getInbox(): Promise<InboxItem[]>;
  getConversation(conversationId: string): Promise<Conversation>;

  // Phase 5: Credits
  getCredits(): Promise<Credits>;
  getCreditsUsage(): Promise<CreditsUsageRecord[]>;
}
```

### 4.2 新增类型定义（`shared/types.ts`）

```typescript
// Credits（Phase 5）
export interface Credits {
  remaining: number;
  total: number;
  expires_at?: string;
}

export interface CreditsUsageRecord {
  date: string;
  endpoint: string;
  credits_used: number;
  request_count: number;
}
```

> `Message`、`Conversation`、`InboxItem` 已在 `shared/types.ts` 中定义。

---

## 5. 测试策略

### 5.1 TDD 流程

每个 Phase 遵循 Red-Green-Refactor 循环：

1. **Red**：先写失败的测试（接口方法 / API 路由 / 页面渲染）
2. **Green**：实现最小可用代码使测试通过
3. **Refactor**：清理代码，保持测试绿色

### 5.2 单元测试 Case 设计

#### Provider 层测试（`src/lib/twitter/__tests__/`）

| 测试文件 | 测试 Case | 覆盖接口 |
|---|---|---|
| `tweapi-provider.tweet-replies.test.ts` | 正常返回回复列表 | `getTweetReplies` |
| | 推文无回复时返回空数组 | |
| | 无效推文 ID 抛出 ProviderError | |
| | TweAPI 超时抛出 TimeoutError | |
| `tweapi-provider.user-timeline.test.ts` | 正常返回时间线 | `getUserTimeline` |
| | 用户不存在时抛出 ProviderError | |
| | 响应数据正确 normalize | |
| `tweapi-provider.user-replies.test.ts` | 正常返回用户回复列表 | `getUserReplies` |
| | 用户无回复时返回空数组 | |
| `tweapi-provider.user-highlights.test.ts` | 正常返回高光推文 | `getUserHighlights` |
| | 用户无高光推文返回空数组 | |
| `tweapi-provider.connections.test.ts` | 正常返回粉丝列表 | `getUserFollowers` |
| | 正常返回关注列表 | `getUserFollowing` |
| | 正常返回关联账户 | `getUserAffiliates` |
| | 用户不存在时抛出 ProviderError | |
| | 返回数据 normalize 为 UserInfo[] | |
| `tweapi-provider.messages.test.ts` | 正常返回收件箱列表 | `getInbox` |
| | 收件箱为空返回空数组 | |
| | 无 Cookie 抛出 AuthRequiredError | |
| | 正常返回对话消息 | `getConversation` |
| | 无效对话 ID 抛出 ProviderError | |
| `tweapi-provider.credits.test.ts` | 正常返回余额 | `getCredits` |
| | 正常返回使用记录 | `getCreditsUsage` |
| | 使用记录为空返回空数组 | |

#### Mock Provider 测试（`src/lib/twitter/__tests__/`）

| 测试 Case | 说明 |
|---|---|
| 每个新增方法都返回合理的 mock 数据 | 确保 `MOCK_PROVIDER=true` 可用 |
| Mock 数据符合类型定义 | 类型安全检查 |

#### Normalizer 测试（`src/lib/twitter/__tests__/`）

| 测试 Case | 说明 |
|---|---|
| TweAPI 用户列表响应 → UserInfo[] | 粉丝/关注/关联账户的 normalize |
| TweAPI 收件箱响应 → InboxItem[] | 消息数据的 normalize |
| TweAPI 对话响应 → Conversation | 对话数据的 normalize |
| 缺失字段的防御性处理 | null/undefined 不崩溃 |

#### API 路由测试（`src/app/api/__tests__/`）

| 测试文件 | 测试 Case |
|---|---|
| `tweet-replies.test.ts` | GET /api/twitter/tweets/[id]/replies → 200 + Tweet[] |
| | 无效 ID → 400 |
| | 未认证 → 401 |
| `user-timeline.test.ts` | GET /api/twitter/users/[username]/timeline → 200 + Tweet[] |
| `user-replies.test.ts` | GET /api/twitter/users/[username]/replies → 200 + Tweet[] |
| `user-highlights.test.ts` | GET /api/twitter/users/[username]/highlights → 200 + Tweet[] |
| `user-connections.test.ts` | GET /api/twitter/users/[username]/followers → 200 + UserInfo[] |
| | GET /api/twitter/users/[username]/following → 200 + UserInfo[] |
| | GET /api/twitter/users/[username]/affiliates → 200 + UserInfo[] |
| `messages.test.ts` | GET /api/twitter/me/inbox → 200 + InboxItem[] |
| | GET /api/twitter/me/messages/[id] → 200 + Conversation |
| | 无 Cookie → 401 |
| `credits.test.ts` | GET /api/credits → 200 + Credits |
| | GET /api/credits/usage → 200 + CreditsUsageRecord[] |

### 5.3 E2E 测试 Case（BDD 模式）

| 场景 | 步骤 | 预期结果 |
|---|---|---|
| 搜索推文并查看详情 | 1. 访问 /tweets 2. 搜索关键词 3. 点击推文 | 跳转 /tweets/[id]，展示详情+回复 |
| 查看用户时间线 | 1. 访问 /users 2. 搜索用户 3. 切换 Timeline 标签 | 展示用户全部活动 |
| 查看用户粉丝 | 1. 在用户页点击粉丝数 2. 跳转 connections | 展示粉丝列表 |
| 书签跳转推文详情 | 1. 访问 /bookmarks 2. 点击推文 | 跳转 /tweets/[id] |
| 查看私信收件箱 | 1. 访问 /messages 2. 点击对话 | 展示对话消息 |
| 查看 Credits 余额 | 1. 访问 /settings | Credits 卡片显示余额 |

---

## 6. 实施阶段

### Phase 1 — 侧边栏架构 + 页面骨架

**目标**：重构导航，建立所有页面占位，不影响现有功能。

**任务清单**：

- [x] 重构 `sidebar.tsx`：`navItems` 改为分组结构（支持 section headers）
- [x] 新建占位页面（每个页面显示标题 + 调用的 API 列表 + "Coming Soon"）
  - [x] `/tweets/page.tsx`
  - [x] `/tweets/[id]/page.tsx`
  - [x] `/users/page.tsx`
  - [x] `/users/[username]/page.tsx`
  - [x] `/users/[username]/connections/page.tsx`
  - [x] `/bookmarks/page.tsx`
  - [x] `/likes/page.tsx`
  - [x] `/lists/page.tsx`
  - [x] `/messages/page.tsx`
  - [x] `/messages/[conversationId]/page.tsx`
- [x] 保留现有 `/explore` 和 `/analytics` 路由不变
- [x] 单元测试：侧边栏渲染所有分组和链接
- [x] E2E 测试：所有占位页面返回 200 + 现有页面不受影响

**Commit 策略**：
1. `refactor: restructure sidebar navigation with grouped sections`
2. `feat: add placeholder pages for explore-world module`
3. `feat: add placeholder pages for my-account module`
4. `test: add sidebar navigation rendering tests`

### Phase 2 — Tweets 模块

**目标**：实现推文搜索、详情、回复列表。

**任务清单**：

- [x] `ITwitterProvider` 新增 `getTweetReplies(tweetId: string): Promise<Tweet[]>`
- [x] `TweAPIProvider` 实现 `getTweetReplies`（调用 `tweet/replys`）
- [x] `MockTwitterProvider` 实现 `getTweetReplies`
- [x] Normalizer 适配回复列表数据格式
- [x] 新建 API 路由 `GET /api/twitter/tweets/[id]/replies`
- [x] 新建 Explore API 路由 `GET /api/explore/tweets/[id]`（合并详情+回复）
- [x] 实现 `/tweets` 页面（搜索 UI，提取共享 TweetCard 组件）
- [x] 实现 `/tweets/[id]` 页面（详情 + 回复列表）
- [x] 单元测试：Provider / Mock Provider（12 tests passing）
- [x] E2E：搜索推文 → 查看详情+回复（5 tests passing）

**Commit 策略**：
1. `test: add getTweetReplies provider tests (red)`
2. `feat: implement getTweetReplies in TweAPIProvider`
3. `feat: add tweet replies API route`
4. `feat: implement tweets search page`
5. `feat: implement tweet detail page with replies`
6. `test: add tweet replies e2e test`

### Phase 3 — Users + Connections 模块

**目标**：实现用户多维度内容展示和社交关系页面。

**任务清单**：

- [ ] `ITwitterProvider` 新增方法：
  - [ ] `getUserTimeline(username: string): Promise<Tweet[]>`
  - [ ] `getUserReplies(username: string): Promise<Tweet[]>`
  - [ ] `getUserHighlights(username: string): Promise<Tweet[]>`
  - [ ] `getUserFollowers(username: string): Promise<UserInfo[]>`
  - [ ] `getUserFollowing(username: string): Promise<UserInfo[]>`
  - [ ] `getUserAffiliates(username: string): Promise<UserInfo[]>`
- [ ] `TweAPIProvider` 实现所有新增方法
- [ ] `MockTwitterProvider` 实现所有新增方法
- [ ] Normalizer 适配用户列表数据格式（follower/following/affiliates → UserInfo[]）
- [ ] 新建 API 路由：
  - [ ] `GET /api/twitter/users/[username]/timeline`
  - [ ] `GET /api/twitter/users/[username]/replies`
  - [ ] `GET /api/twitter/users/[username]/highlights`
  - [ ] `GET /api/twitter/users/[username]/followers`
  - [ ] `GET /api/twitter/users/[username]/following`
  - [ ] `GET /api/twitter/users/[username]/affiliates`
- [ ] 实现 `/users` 页面（搜索 UI，迁移自 `/explore` 用户搜索逻辑）
- [ ] 升级 `/users/[username]` 页面（新增标签页：Timeline / Replies / Highlights）
- [ ] 实现 `/users/[username]/connections` 页面（Followers / Following / Affiliates 标签页）
- [ ] 单元测试：Provider / Normalizer / API 路由
- [ ] E2E：搜索用户 → 查看资料 → 切换标签 → 点击粉丝数 → connections

**Commit 策略**：
1. `test: add user timeline/replies/highlights provider tests (red)`
2. `feat: implement user timeline/replies/highlights in TweAPIProvider`
3. `test: add connections provider tests (red)`
4. `feat: implement follower/following/affiliates in TweAPIProvider`
5. `feat: add user content API routes (timeline, replies, highlights)`
6. `feat: add user connections API routes (followers, following, affiliates)`
7. `feat: implement users search page`
8. `feat: add tabbed content views to user profile page`
9. `feat: implement connections page with follower/following/affiliates tabs`
10. `test: add users module e2e tests`

### Phase 4 — My Account 扩展（Bookmarks / Likes / Lists / Messages）

**目标**：将已有的书签/点赞/列表数据暴露到独立页面，新增私信模块。

**任务清单**：

- [ ] 实现 `/bookmarks` 页面（调用已有 `getUserBookmarks` API）
- [ ] 实现 `/likes` 页面（调用已有 `getUserLikes` API）
- [ ] 实现 `/lists` 页面（调用已有 `getUserLists` API）
- [ ] `ITwitterProvider` 新增方法：
  - [ ] `getInbox(): Promise<InboxItem[]>`
  - [ ] `getConversation(conversationId: string): Promise<Conversation>`
- [ ] `TweAPIProvider` 实现 `getInbox` + `getConversation`
- [ ] `MockTwitterProvider` 实现 `getInbox` + `getConversation`
- [ ] Normalizer 适配消息数据格式
- [ ] 新建 API 路由：
  - [ ] `GET /api/twitter/me/inbox`
  - [ ] `GET /api/twitter/me/messages/[conversationId]`
- [ ] 新建 Explore API 路由：
  - [ ] `GET /api/explore/bookmarks`
  - [ ] `GET /api/explore/likes`
  - [ ] `GET /api/explore/lists`
  - [ ] `GET /api/explore/inbox`
  - [ ] `GET /api/explore/messages/[conversationId]`
- [ ] 实现 `/messages` 页面（收件箱列表）
- [ ] 实现 `/messages/[conversationId]` 页面（对话消息）
- [ ] 单元测试：Provider / Normalizer / API 路由
- [ ] E2E：书签跳转推文详情 / 收件箱 → 对话

**Commit 策略**：
1. `feat: implement bookmarks page`
2. `feat: implement likes page`
3. `feat: implement lists page`
4. `test: add inbox/conversation provider tests (red)`
5. `feat: implement getInbox and getConversation in TweAPIProvider`
6. `feat: add messages API routes`
7. `feat: implement messages inbox page`
8. `feat: implement conversation detail page`
9. `test: add my-account module e2e tests`

### Phase 5 — Credits + 清理

**目标**：接入 Credits API，清理旧页面。

**任务清单**：

- [ ] `ITwitterProvider` 新增方法：
  - [ ] `getCredits(): Promise<Credits>`
  - [ ] `getCreditsUsage(): Promise<CreditsUsageRecord[]>`
- [ ] `shared/types.ts` 新增 `Credits` 和 `CreditsUsageRecord` 类型
- [ ] `TweAPIProvider` 实现 `getCredits` + `getCreditsUsage`
- [ ] `MockTwitterProvider` 实现 `getCredits` + `getCreditsUsage`
- [ ] 新建 API 路由：
  - [ ] `GET /api/credits`
  - [ ] `GET /api/credits/usage`
- [ ] Settings 页面新增 Credits 余额卡片
- [ ] Usage 页面新增 TweAPI Credits 消费明细面板
- [ ] 确认所有新页面功能完整后，移除旧路由：
  - [ ] `/explore` → 由 `/tweets` + `/users` 替代
  - [ ] `/explore/user/[username]` → 由 `/users/[username]` 替代
- [ ] 更新 Dashboard 首页状态卡片
- [ ] 单元测试：Provider / API 路由
- [ ] 全量 E2E 回归

**Commit 策略**：
1. `test: add credits provider tests (red)`
2. `feat: implement getCredits and getCreditsUsage in TweAPIProvider`
3. `feat: add credits API routes`
4. `feat: add credits balance card to settings page`
5. `feat: add credits usage panel to usage page`
6. `refactor: remove legacy explore routes`
7. `test: full e2e regression`

---

## 7. API 路由总览（最终状态）

### 7.1 Webhook 认证路由（`/api/twitter/`）

供外部消费者使用，通过 `X-Webhook-Key` 认证。

| 方法 | 路由 | 说明 | Phase |
|---|---|---|---|
| GET | `/api/twitter/tweets/search?q=&count=&sort_by_top=` | 搜索推文 | 已有 |
| GET | `/api/twitter/tweets/[id]` | 推文详情 | 已有 |
| GET | `/api/twitter/tweets/[id]/replies` | 推文回复列表 | Phase 2 |
| GET | `/api/twitter/users/[username]/info` | 用户详情 | 已有 |
| GET | `/api/twitter/users/[username]/tweets?count=` | 用户最近推文 | 已有 |
| GET | `/api/twitter/users/[username]/search?q=` | 搜索用户推文 | 已有 |
| GET | `/api/twitter/users/[username]/timeline` | 用户时间线 | Phase 3 |
| GET | `/api/twitter/users/[username]/replies` | 用户回复时间线 | Phase 3 |
| GET | `/api/twitter/users/[username]/highlights` | 用户高光推文 | Phase 3 |
| GET | `/api/twitter/users/[username]/followers` | 粉丝列表 | Phase 3 |
| GET | `/api/twitter/users/[username]/following` | 关注列表 | Phase 3 |
| GET | `/api/twitter/users/[username]/affiliates` | 关联账户 | Phase 3 |
| GET | `/api/twitter/me/analytics` | 分析数据 | 已有 |
| GET | `/api/twitter/me/bookmarks` | 书签 | 已有 |
| GET | `/api/twitter/me/likes` | 点赞 | 已有 |
| GET | `/api/twitter/me/lists` | 列表 | 已有 |
| GET | `/api/twitter/me/inbox` | 收件箱 | Phase 4 |
| GET | `/api/twitter/me/messages/[conversationId]` | 对话详情 | Phase 4 |

### 7.2 Session 认证路由（`/api/explore/`）

供 Dashboard Web UI 使用，通过 NextAuth Session 认证。

| 方法 | 路由 | 说明 | Phase |
|---|---|---|---|
| GET | `/api/explore/tweets?q=&count=&sort_by_top=` | 搜索推文 | 已有 |
| GET | `/api/explore/tweets/[id]` | 推文详情+回复 | Phase 2 |
| GET | `/api/explore/users?username=` | 用户信息 | 已有 |
| GET | `/api/explore/users/tweets?username=&count=` | 用户推文 | 已有 |
| GET | `/api/explore/users/timeline?username=` | 用户时间线 | Phase 3 |
| GET | `/api/explore/users/replies?username=` | 用户回复 | Phase 3 |
| GET | `/api/explore/users/highlights?username=` | 用户高光 | Phase 3 |
| GET | `/api/explore/users/followers?username=` | 粉丝 | Phase 3 |
| GET | `/api/explore/users/following?username=` | 关注 | Phase 3 |
| GET | `/api/explore/users/affiliates?username=` | 关联账户 | Phase 3 |
| GET | `/api/explore/analytics` | 分析数据 | 已有 |
| GET | `/api/explore/bookmarks` | 书签 | Phase 4 |
| GET | `/api/explore/likes` | 点赞 | Phase 4 |
| GET | `/api/explore/lists` | 列表 | Phase 4 |
| GET | `/api/explore/inbox` | 收件箱 | Phase 4 |
| GET | `/api/explore/messages/[conversationId]` | 对话详情 | Phase 4 |

### 7.3 平台管理路由

| 方法 | 路由 | 说明 | Phase |
|---|---|---|---|
| GET | `/api/credits` | Credits 余额 | Phase 5 |
| GET | `/api/credits/usage` | Credits 使用记录 | Phase 5 |

---

## 8. 变更日志

| 日期 | 变更内容 |
|---|---|
| 2026-02-25 | 初始计划创建 |
| 2026-02-25 | Phase 1 完成：sidebar 分组重构 + 10 个占位页面 + UT + E2E |
| 2026-02-25 | Phase 2 完成：getTweetReplies provider + API routes + /tweets 搜索页 + /tweets/[id] 详情页 + 共享 TweetCard 组件 + E2E |
