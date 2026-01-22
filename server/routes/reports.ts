import { Router } from 'express';
import type { ReportService } from '../lib/report-service';

export function createReportRoutes(reportService: ReportService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const reports = await reportService.listReports();
      res.json(reports);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get('/latest', async (req, res) => {
    try {
      const latest = await reportService.getLatestReport();
      if (!latest) {
        res.status(404).json({ error: 'No reports found' });
        return;
      }
      res.json(latest);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get('/:date', async (req, res) => {
    const { date } = req.params;
    
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid date format, expected YYYY-MM-DD' });
      return;
    }
    
    try {
      const report = await reportService.getReport(date);
      if (!report) {
        res.status(404).json({ error: 'Report not found' });
        return;
      }
      res.json(report);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get('/:date/html', async (req, res) => {
    const { date } = req.params;
    
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid date format, expected YYYY-MM-DD' });
      return;
    }
    
    try {
      const html = await reportService.getReportHtml(date);
      if (!html) {
        res.status(404).json({ error: 'Report HTML not found' });
        return;
      }
      res.type('html').send(html);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
