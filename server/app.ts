import express, { Express } from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createSchedulerRoutes } from './routes/scheduler';
import { createReportRoutes } from './routes/reports';
import { createScheduler, Scheduler } from './lib/scheduler';
import { createReportService, ReportService } from './lib/report-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface AppDependencies {
  scheduler: Scheduler;
  reportService: ReportService;
}

export function createApp(projectPath: string, deps?: Partial<AppDependencies>): Express {
  const app = express();
  
  app.use(cors());
  app.use(express.json());

  const scheduler = deps?.scheduler || createScheduler(projectPath);
  const reportService = deps?.reportService || createReportService(projectPath);

  app.use('/api/scheduler', createSchedulerRoutes(scheduler));
  app.use('/api/reports', createReportRoutes(reportService));

  app.use('/static', express.static(join(projectPath, 'public')));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use(express.static(join(__dirname, 'public')));

  app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  });

  return app;
}

export { Scheduler, ReportService };
