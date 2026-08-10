# Running & Scripts

## Web Application (Primary)

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your credentials (TWEAPI_API_KEY, Google OAuth, etc.)

# Initialize database
bun run db:push

# Start development server
bun dev
# Open http://localhost:7007
```

### Common Commands

| Command | Description |
|---------|-------------|
| `bun dev` | Development server (port 7007) |
| `bun run build` | Production build |
| `bun start` | Production server |
| `bun test` | Unit tests |
| `bun run test:coverage` | Tests with coverage report |
| `bun run test:e2e:browser` | Playwright browser E2E tests |
| `bun run lint` | ESLint check |
| `bun run db:push` | Push schema to database |
| `bun run db:studio` | Open Drizzle Studio |

## CLI Scripts (Legacy / Agent)

Standalone scripts for automated analysis, independent of the web app:

```bash
bun run scripts/fetch-tweets.ts        # Fetch watchlist tweets
bun run scripts/fetch-me-data.ts       # Fetch personal analytics data
bun run scripts/generate-watchlist-report.ts  # Generate watchlist report
bun run scripts/generate-me-report.ts  # Generate personal analytics report
bun run scripts/run-watchlist-report.ts # One-click: fetch + validate + generate
```

## Skills Entry Points

- `/xray-watchlist` — watchlist fetch + analyze + report
- `/xray-me` — personal data fetch + report

## Agent Scripts

See [`07-agent-scripts.md`](07-agent-scripts.md) for the full agent capability map.

```bash
bun run agent/index.ts          # Main agent entry point
bun run agent/workflow/hourly.ts # Hourly scheduled workflow
```
