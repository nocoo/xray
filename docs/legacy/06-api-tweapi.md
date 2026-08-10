# TweAPI 接口说明

> 由 `docs/tweapi.md` 整理而来，仅保留项目使用相关信息。

## 基础信息

- Base URL：`https://api.tweapi.io`
- 认证方式：请求头 `x-api-key: <YOUR_API_KEY>`

## 常用接口

### Tweet

- `POST /v1/twitter/tweet/details`：获取推文详情
- `POST /v1/twitter/tweet/replys`：获取推文回复列表
- `POST /v1/twitter/tweet/search`：关键词搜索推文

### User

- `POST /v1/twitter/user/info`：用户详情
- `POST /v1/twitter/user/timeline`：用户时间线（也作为 `userRecentTweetsByFilter` 400 时的 fallback）
- `POST /v1/twitter/user/analytics`：蓝 V 分析数据（需 cookie）
- `POST /v1/twitter/user/bookmarks`：书签（需 cookie）
- `POST /v1/twitter/user/likes`：点赞（需 cookie）
- `POST /v1/twitter/user/lists`：列表（需 cookie）

## 响应码

- `201`：成功
- `400`：参数错误
- `401`：未授权
- `429`：限流/配额限制
- `500`：服务器错误

## 备注

- 需要 cookie 的接口用于私有数据
- 用户 URL 格式：`https://x.com/username`
