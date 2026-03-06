# Configuration & Data

## Environment Variables (Primary)

The web application is configured via `.env` file. See `.env.example` for the full template.

### Required Variables

| Variable | Description |
|----------|-------------|
| `TWEAPI_API_KEY` | TweAPI.io API key for Twitter data access |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NEXTAUTH_SECRET` | NextAuth session encryption key |
| `ALLOWED_EMAILS` | Comma-separated list of allowed login emails |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXTAUTH_URL` | (auto-detect) | Base URL for auth callbacks |
| `USE_SECURE_COOKIES` | `false` | Set `true` behind HTTPS reverse proxy |
| `XRAY_DATA_DIR` | project root | SQLite data directory (set to `/data` for Docker/Railway) |
| `XRAY_DB` | `database/xray.db` | Custom database file path |

### In-App Settings

Additional configuration is available through the dashboard UI:
- **Settings page** — TweAPI API key (overrides env var), Twitter cookie
- **AI Settings page** — AI provider selection and API keys (OpenAI, Anthropic, Google, GLM, DeepSeek, Grok, Ollama)

## Legacy CLI Config (Agent Scripts Only)

Agent scripts in `agent/` and `scripts/` use `config/config.json`:

| Field | Description |
|-------|-------------|
| `api.api_key` | TweAPI API key |
| `api.base_url` | Default `https://api.tweapi.io` |
| `api.cookie` | Twitter cookie for private data (optional) |
| `me.username` | Personal account username |

Template: `config/api-key.example.json`

## Data Directories

| Directory | Description |
|-----------|-------------|
| `database/` | SQLite database files (gitignored) |
| `data/` | Runtime data for agent scripts (gitignored) |
| `reports/` | Generated Markdown reports |
| `drizzle/` | Database migration SQL files |
