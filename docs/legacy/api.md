# X-Ray Twitter API Documentation

## Overview

X-Ray provides a RESTful API for accessing Twitter/X data through webhook-authenticated endpoints. All endpoints proxy requests through the [TweAPI](https://tweapi.io) service using your configured API credentials.

**Base URL:** `https://xray.hexly.ai`

## Authentication

All `/api/twitter/*` endpoints require a webhook key sent via the `X-Webhook-Key` HTTP header.

```
X-Webhook-Key: xrk_your_key_here
```

### Setup

1. Configure your TweAPI credentials in **Settings → API Credentials**
2. Create a webhook key in **Settings → Webhook Keys**
3. Copy the key when it's displayed (it's shown only once)
4. Include the key in every API request as the `X-Webhook-Key` header

### Error Responses

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid webhook key |
| 400 | Missing required parameters |
| 503 | API credentials not configured for this user |
| 502 | Upstream Twitter API error |
| 500 | Internal server error |

All error responses follow this format:

```json
{ "success": false, "error": "Error description" }
```

## Endpoints

### User Endpoints

#### GET `/api/twitter/users/{username}/info`

Fetch a user's profile information.

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/users/elonmusk/info"
```

#### GET `/api/twitter/users/{username}/tweets`

Fetch a user's recent tweets.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `count` | query, int | 20 | Number of tweets (1-100) |

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/users/karpathy/tweets?count=10"
```

#### GET `/api/twitter/users/{username}/timeline`

Fetch a user's timeline (all tweet types).

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/users/karpathy/timeline"
```

#### GET `/api/twitter/users/{username}/replies`

Fetch a user's replies.

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/users/karpathy/replies"
```

#### GET `/api/twitter/users/{username}/highlights`

Fetch a user's highlighted tweets.

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/users/karpathy/highlights"
```

#### GET `/api/twitter/users/{username}/followers`

Fetch a user's followers.

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/users/karpathy/followers"
```

#### GET `/api/twitter/users/{username}/following`

Fetch accounts a user is following.

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/users/karpathy/following"
```

#### GET `/api/twitter/users/{username}/affiliates`

Fetch a user's affiliated accounts.

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/users/karpathy/affiliates"
```

#### GET `/api/twitter/users/{username}/search`

Search within a specific user's tweets.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | query, string | Yes | Search keyword |

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/users/karpathy/search?q=LLM"
```

### Tweet Endpoints

#### GET `/api/twitter/tweets/search`

Search tweets globally.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | query, string | Yes | Search query |
| `count` | query, int | No | Number of results (1-100) |
| `sort_by_top` | query, bool | No | Sort by top tweets (`true`/`false`) |

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/tweets/search?q=AI+agents&count=20&sort_by_top=true"
```

#### GET `/api/twitter/tweets/{id}`

Fetch details of a specific tweet by ID.

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/tweets/1234567890"
```

#### GET `/api/twitter/tweets/{id}/replies`

Fetch replies to a specific tweet.

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/tweets/1234567890/replies"
```

### Account Endpoints (Your Twitter Account)

These endpoints return data for the Twitter account associated with your configured credentials.

#### GET `/api/twitter/me/analytics`

Fetch analytics data for your account.

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/me/analytics"
```

#### GET `/api/twitter/me/bookmarks`

Fetch your bookmarked tweets.

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/me/bookmarks"
```

#### GET `/api/twitter/me/likes`

Fetch tweets you've liked.

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/me/likes"
```

#### GET `/api/twitter/me/lists`

Fetch your Twitter lists.

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/me/lists"
```

#### GET `/api/twitter/me/inbox`

Fetch your DM inbox.

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/me/inbox"
```

#### GET `/api/twitter/me/messages/{conversationId}`

Fetch a specific DM conversation thread.

```bash
curl -H "X-Webhook-Key: xrk_..." \
  "https://xray.hexly.ai/api/twitter/me/messages/abc123"
```

### Health Check

#### GET `/api/live`

Unauthenticated health check. No webhook key required.

```bash
curl "https://xray.hexly.ai/api/live"
```

Response:

```json
{
  "status": "ok",
  "version": "1.9.1",
  "timestamp": 1771930542862,
  "uptime": 420,
  "runtime": "bun",
  "checks": { "database": "ok" }
}
```

## Response Format

All successful responses follow this format:

```json
{
  "success": true,
  "data": { ... }
}
```

## Usage Tracking

Every authenticated API call is tracked automatically. View your usage statistics on the **Usage** page in the web UI, including daily trends and per-endpoint breakdowns.
