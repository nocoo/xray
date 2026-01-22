import { createApp } from './app';
import { createScheduler } from './lib/scheduler';
import { resolve } from 'path';

const PORT = parseInt(process.env.PORT || '7006', 10);
const PROJECT_PATH = resolve(process.env.PROJECT_PATH || process.cwd());
const INTERVAL_MS = parseInt(process.env.SCHEDULER_INTERVAL_MS || '3600000', 10);
const AUTO_START = process.env.AUTO_START_SCHEDULER !== 'false';

const scheduler = createScheduler(PROJECT_PATH, INTERVAL_MS);
const app = createApp(PROJECT_PATH, { scheduler });

scheduler.setOnStateChange((state) => {
  console.log(`[Scheduler] Status: ${state.status}, Next run: ${state.nextRunTime?.toISOString() || 'N/A'}`);
});

if (AUTO_START) {
  scheduler.start();
  console.log(`[Scheduler] Started with interval ${INTERVAL_MS}ms`);
}

app.listen(PORT, () => {
  console.log(`[Server] X-Ray server running on http://localhost:${PORT}`);
  console.log(`[Server] Project path: ${PROJECT_PATH}`);
  console.log(`[Server] API endpoints:`);
  console.log(`  - GET  /health`);
  console.log(`  - GET  /api/scheduler/status`);
  console.log(`  - POST /api/scheduler/trigger`);
  console.log(`  - POST /api/scheduler/start`);
  console.log(`  - POST /api/scheduler/stop`);
  console.log(`  - GET  /api/reports`);
  console.log(`  - GET  /api/reports/:date`);
  console.log(`  - GET  /api/reports/:date/html`);
});
