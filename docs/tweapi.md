# TweAPI Documentation

Base URL: `https://api.tweapi.io`

## Authentication

通过请求头携带 API Key：

```
x-api-key: <YOUR_API_KEY>
```

## Response Codes

| Code | Description |
|------|-------------|
| 201 | 请求成功 |
| 400 | 参数错误 |
| 401 | 未授权 (缺少或无效的 x-api-key) |
| 429 | 请求过多 (触发限流或配额限制) |
| 500 | 服务器错误 |

---

## Endpoints

### Message

#### POST /v1/twitter/message/conversation
获取指定对话消息数据

**Request Body:**
```json
{
  "conversationUrl": "https://x.com/i/chat/2891142821-1682823290606473212"
}
```

#### POST /v1/twitter/message/inbox
获取推特用户自己的私信收件箱数据

**Request Body:**
```json
{
  "cookie": "<cookie_string>"
}
```

---

### Tweet

#### POST /v1/twitter/tweet/details
获取推文信息数据

**Request Body:**
```json
{
  "url": "https://x.com/xxx/status/123"
}
```

#### POST /v1/twitter/tweet/replys
获取推文的回复列表数据

**Request Body:**
```json
{
  "url": "https://x.com/xxx/status/123"
}
```

#### POST /v1/twitter/tweet/search
获取搜索信息推文数据

**Request Body:**
```json
{
  "words": "关键搜索词"
}
```

---

### User

#### POST /v1/twitter/user/affiliates
获取指定推特用户关联的用户数据

**Request Body:**
```json
{
  "url": "https://x.com/username"
}
```

#### POST /v1/twitter/user/analytics
获取推特蓝v用户自己的分析数据

**Request Body:**
```json
{
  "cookie": "<cookie_string>"
}
```

#### POST /v1/twitter/user/bookmarks
获取推特用户自己的书签数据

**Request Body:**
```json
{
  "cookie": "<cookie_string>"
}
```

#### POST /v1/twitter/user/follower
获取指定推特用户粉丝用户数据

**Request Body:**
```json
{
  "url": "https://x.com/username"
}
```

#### POST /v1/twitter/user/following
获取指定推特用户关注者用户数据

**Request Body:**
```json
{
  "url": "https://x.com/username"
}
```

#### POST /v1/twitter/user/getUserTweetsBySearch
获取推特用户指定内容推文信息

**Request Body:**
```json
{
  "userUrl": "https://x.com/username",
  "words": "关键搜索词"
}
```

#### POST /v1/twitter/user/highLights
获取指定推特用户10条高光时刻推文数据

**Request Body:**
```json
{
  "url": "https://x.com/username"
}
```

#### POST /v1/twitter/user/info
获取指定推特用户详情数据

**Request Body:**
```json
{
  "url": "https://x.com/username"
}
```

#### POST /v1/twitter/user/likes
获取推特用户自己的点赞列表数据

**Request Body:**
```json
{
  "cookie": "<cookie_string>"
}
```

#### POST /v1/twitter/user/lists
获取推特用户自己的列表数据

**Request Body:**
```json
{
  "cookie": "<cookie_string>"
}
```

**Response:**
```json
{
  "code": 201,
  "msg": "ok",
  "data": {
    "list": [
      {
        "createdAt": "2022-10-07T18:44:25.000Z",
        "createdBy": "1723331",
        "description": "AI Experts, Scientists & Companies",
        "id": "1578456227805564928",
        "isFollowing": true,
        "isMember": false,
        "memberCount": 113,
        "name": "AI / Robotic",
        "subscriberCount": 4613
      }
    ],
    "next": "cursor_string"
  }
}
```

#### POST /v1/twitter/user/replies
获取指定推特用户的回复时间线数据

**Request Body:**
```json
{
  "url": "https://x.com/username"
}
```

#### POST /v1/twitter/user/timeline
获取指定推特用户时间线数据

**Request Body:**
```json
{
  "url": "https://x.com/username"
}
```

#### POST /v1/twitter/user/userRecent20Tweets
获取推特用户最近20条推文信息

**Request Body:**
```json
{
  "url": "https://x.com/username"
}
```

---

## Notes

1. **Cookie 认证**: 需要 cookie 的接口用于访问私有数据（如书签、点赞、私信、列表等）
2. **URL 格式**: 用户 URL 格式为 `https://x.com/username`
3. **List Members API**: 文档中未列出获取 List 成员的接口，可能需要联系 API 提供方确认

---

## Example Usage

```bash
# 获取用户最近20条推文
curl --request POST \
  --url "https://api.tweapi.io/v1/twitter/user/userRecent20Tweets" \
  --header "content-type: application/json" \
  --header "x-api-key: YOUR_API_KEY" \
  --data '{"url":"https://x.com/username"}'

# 获取用户的列表 (需要 cookie)
curl --request POST \
  --url "https://api.tweapi.io/v1/twitter/user/lists" \
  --header "x-api-key: YOUR_API_KEY" \
  --header "content-type: application/json" \
  --data '{"cookie": "your_cookie_string"}'
```
