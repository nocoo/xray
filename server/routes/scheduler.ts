import { Router } from 'express';
import type { Scheduler } from '../lib/scheduler';

export function createSchedulerRoutes(scheduler: Scheduler): Router {
  const router = Router();

  router.get('/status', (req, res) => {
    const state = scheduler.getState();
    const history = scheduler.getHistory().slice(0, 10);
    const planned = scheduler.getPlannedRuns(5);
    
    res.json({
      ...state,
      isSchedulerRunning: scheduler.isRunning(),
      history,
      planned,
    });
  });

  router.post('/trigger', (req, res) => {
    if (scheduler.getState().status === 'running') {
      res.status(409).json({ success: false, error: 'Pipeline already running' });
      return;
    }
    
    scheduler.trigger().catch(err => {
      console.error('Pipeline error:', err);
    });
    
    res.json({ success: true, message: 'Pipeline triggered' });
  });

  router.post('/start', (req, res) => {
    scheduler.start();
    res.json({ success: true, message: 'Scheduler started' });
  });

  router.post('/stop', (req, res) => {
    scheduler.stop();
    res.json({ success: true, message: 'Scheduler stopped' });
  });

  router.post('/interval', (req, res) => {
    const { intervalMs } = req.body;
    if (typeof intervalMs !== 'number' || intervalMs < 60000) {
      res.status(400).json({ error: 'Invalid interval, minimum 60000ms' });
      return;
    }
    scheduler.setInterval(intervalMs);
    res.json({ success: true, intervalMs });
  });

  return router;
}
