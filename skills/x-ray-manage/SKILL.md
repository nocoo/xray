---
name: x-ray-manage
description: Manages X-Ray Twitter monitoring system. Handles watchlist operations (add/remove/list users) and triggers tweet fetching. Interprets user intent and executes appropriate TypeScript scripts via Bun.
---

# X-Ray Management Skill

This skill manages the X-Ray Twitter monitoring system by interpreting user requests and executing the appropriate TypeScript scripts.

## Available Operations

### 1. Add User to Watchlist

When user wants to follow/track/add a Twitter user:

```bash
bun run scripts/manage-watchlist.ts add <username_or_url>
```

**Examples of user intents:**
- "Add @karpathy to the watchlist"
- "I want to track https://x.com/ThePeterMick"
- "Follow this Twitter user: elonmusk"
- "把 karpathy 加入关注列表"

### 2. Remove User from Watchlist

When user wants to unfollow/remove/stop tracking:

```bash
bun run scripts/manage-watchlist.ts remove <username>
```

**Examples:**
- "Remove @karpathy from watchlist"
- "Stop tracking ThePeterMick"
- "把这个用户从列表中删除"

### 3. List Watched Users

When user wants to see current watchlist:

```bash
bun run scripts/manage-watchlist.ts list
```

**Examples:**
- "Show me the watchlist"
- "Who am I tracking?"
- "列出所有关注的用户"

### 4. Check if User is Watched

When user wants to verify if someone is in the list:

```bash
bun run scripts/manage-watchlist.ts has <username>
```

### 5. Fetch Latest Tweets

When user wants to get new tweets from watched users:

```bash
bun run scripts/fetch-tweets.ts
bun run scripts/fetch-tweets.ts --hours 48
```

**Examples:**
- "Fetch the latest tweets"
- "Get tweets from the last 2 days"
- "获取最新的推文"

## Script Output Format

All scripts output JSON with this structure:

```json
{
  "success": true,
  "message": "Human readable message",
  "data": { ... },
  "error": "ERROR_CODE"  // only if success is false
}
```

## Workflow

1. **Parse user intent** - Understand what operation the user wants
2. **Execute script** - Run the appropriate Bun command
3. **Report result** - Summarize the JSON output to the user

## Important Notes

- All scripts are in the `scripts/` directory
- Run from project root: `/Users/nocoo/workspace/personal/x-ray`
- Scripts handle validation and error reporting
- Always show the result message to the user
