import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import request from 'supertest';
import { createApp } from '../../server/app';
import { Scheduler } from '../../server/lib/scheduler';
import { ReportService } from '../../server/lib/report-service';

describe('API Routes', () => {
  const testProjectPath = '/tmp/test-x-ray-api';

  describe('GET /health', () => {
    it('should return health status', async () => {
      const app = createApp(testProjectPath);
      
      const res = await request(app).get('/health');
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('Scheduler API', () => {
    let scheduler: Scheduler;
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      scheduler = new Scheduler(testProjectPath, 60000);
      app = createApp(testProjectPath, { scheduler });
    });

    afterEach(() => {
      scheduler.stop();
    });

    describe('GET /api/scheduler/status', () => {
      it('should return scheduler status', async () => {
        const res = await request(app).get('/api/scheduler/status');
        
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('idle');
        expect(res.body.isSchedulerRunning).toBe(false);
        expect(res.body.history).toEqual([]);
        expect(res.body.planned).toEqual([]);
      });

      it('should return planned runs when scheduler is running', async () => {
        scheduler.start();
        
        const res = await request(app).get('/api/scheduler/status');
        
        expect(res.status).toBe(200);
        expect(res.body.isSchedulerRunning).toBe(true);
        expect(res.body.planned.length).toBeGreaterThan(0);
      });
    });

    describe('POST /api/scheduler/start', () => {
      it('should start the scheduler', async () => {
        const res = await request(app).post('/api/scheduler/start');
        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(scheduler.isRunning()).toBe(true);
      });
    });

    describe('POST /api/scheduler/stop', () => {
      it('should stop the scheduler', async () => {
        scheduler.start();
        
        const res = await request(app).post('/api/scheduler/stop');
        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(scheduler.isRunning()).toBe(false);
      });
    });

    describe('POST /api/scheduler/interval', () => {
      it('should update interval', async () => {
        const res = await request(app)
          .post('/api/scheduler/interval')
          .send({ intervalMs: 120000 });
        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.intervalMs).toBe(120000);
      });

      it('should reject interval less than 60000', async () => {
        const res = await request(app)
          .post('/api/scheduler/interval')
          .send({ intervalMs: 30000 });
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid interval');
      });
    });
  });

  describe('Reports API', () => {
    let mockReportService: Partial<ReportService>;
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      mockReportService = {
        listReports: mock(async () => [
          { date: '2026-01-21', filename: '2026-01-21_report.json', path: '/path', generatedAt: '2026-01-21T10:00:00Z', tweetCount: 5 },
          { date: '2026-01-20', filename: '2026-01-20_report.json', path: '/path', generatedAt: '2026-01-20T10:00:00Z', tweetCount: 3 },
        ]),
        getReport: mock(async (date: string) => {
          if (date === '2026-01-21') {
            return { 
              generated_at: '2026-01-21T10:00:00Z', 
              summary: { total_tweets: 1, time_range: { start: '', end: '' } },
              time_range: { start: '', end: '' },
              tweets: [{ id: '1' }] 
            };
          }
          return null;
        }),
        getReportHtml: mock(async (date: string) => {
          if (date === '2026-01-21') {
            return '<html>Report</html>';
          }
          return null;
        }),
        getLatestReport: mock(async () => ({
          date: '2026-01-21', filename: '2026-01-21_report.json', path: '/path', generatedAt: '2026-01-21T10:00:00Z', tweetCount: 5
        })),
      };
      
      app = createApp(testProjectPath, { reportService: mockReportService as ReportService });
    });

    describe('GET /api/reports', () => {
      it('should return list of reports', async () => {
        const res = await request(app).get('/api/reports');
        
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(2);
        expect(res.body[0].date).toBe('2026-01-21');
      });
    });

    describe('GET /api/reports/latest', () => {
      it('should return latest report meta', async () => {
        const res = await request(app).get('/api/reports/latest');
        
        expect(res.status).toBe(200);
        expect(res.body.date).toBe('2026-01-21');
      });
    });

    describe('GET /api/reports/:date', () => {
      it('should return report data', async () => {
        const res = await request(app).get('/api/reports/2026-01-21');
        
        expect(res.status).toBe(200);
        expect(res.body.tweets.length).toBe(1);
      });

      it('should return 404 for non-existent report', async () => {
        const res = await request(app).get('/api/reports/2026-01-19');
        
        expect(res.status).toBe(404);
      });

      it('should validate date format', async () => {
        const res = await request(app).get('/api/reports/invalid-date');
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid date format');
      });
    });

    describe('GET /api/reports/:date/html', () => {
      it('should return HTML content', async () => {
        const res = await request(app).get('/api/reports/2026-01-21/html');
        
        expect(res.status).toBe(200);
        expect(res.type).toBe('text/html');
        expect(res.text).toContain('Report');
      });

      it('should return 404 for non-existent HTML', async () => {
        const res = await request(app).get('/api/reports/2026-01-19/html');
        
        expect(res.status).toBe(404);
      });
    });
  });
});
