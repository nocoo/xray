import { describe, it, expect, beforeEach } from 'bun:test';
import { ReportService } from '../../server/lib/report-service';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';

describe('ReportService', () => {
  const testProjectPath = '/tmp/test-x-ray-reports';
  const publicPath = join(testProjectPath, 'public');
  const dataOutputPath = join(testProjectPath, 'data', 'output');
  let reportService: ReportService;

  beforeEach(async () => {
    await rm(testProjectPath, { recursive: true, force: true });
    await mkdir(publicPath, { recursive: true });
    await mkdir(dataOutputPath, { recursive: true });
    
    reportService = new ReportService(testProjectPath);
  });

  describe('listReports', () => {
    it('should return empty array when no reports exist', async () => {
      const reports = await reportService.listReports();
      expect(reports).toEqual([]);
    });

    it('should list reports sorted by date descending', async () => {
      const report1 = {
        generated_at: '2026-01-20T10:00:00Z',
        tweets: [{ id: '1' }, { id: '2' }],
      };
      const report2 = {
        generated_at: '2026-01-21T10:00:00Z',
        tweets: [{ id: '3' }],
      };

      await writeFile(
        join(dataOutputPath, '2026-01-20_report.json'),
        JSON.stringify(report1)
      );
      await writeFile(
        join(dataOutputPath, '2026-01-21_report.json'),
        JSON.stringify(report2)
      );

      const reports = await reportService.listReports();

      expect(reports.length).toBe(2);
      expect(reports[0].date).toBe('2026-01-21');
      expect(reports[0].tweetCount).toBe(1);
      expect(reports[1].date).toBe('2026-01-20');
      expect(reports[1].tweetCount).toBe(2);
    });

    it('should handle malformed JSON files gracefully', async () => {
      await writeFile(
        join(dataOutputPath, '2026-01-20_report.json'),
        'not valid json'
      );

      const reports = await reportService.listReports();

      expect(reports.length).toBe(1);
      expect(reports[0].date).toBe('2026-01-20');
      expect(reports[0].tweetCount).toBe(0);
    });
  });

  describe('getReport', () => {
    it('should return null when report does not exist', async () => {
      const report = await reportService.getReport('2026-01-20');
      expect(report).toBeNull();
    });

    it('should return report data when exists', async () => {
      const reportData = {
        generated_at: '2026-01-20T10:00:00Z',
        tweets: [{ id: '1', text: 'Hello' }],
      };

      await writeFile(
        join(dataOutputPath, '2026-01-20_report.json'),
        JSON.stringify(reportData)
      );

      const report = await reportService.getReport('2026-01-20');

      expect(report).not.toBeNull();
      expect(report?.tweets.length).toBe(1);
      expect(report?.tweets[0].text).toBe('Hello');
    });
  });

  describe('getReportHtml', () => {
    it('should return null when HTML does not exist', async () => {
      const html = await reportService.getReportHtml('2026-01-20');
      expect(html).toBeNull();
    });

    it('should return HTML content when exists', async () => {
      const htmlContent = '<html><body>Report</body></html>';

      await writeFile(
        join(publicPath, '2026-01-20_report.html'),
        htmlContent
      );

      const html = await reportService.getReportHtml('2026-01-20');

      expect(html).toBe(htmlContent);
    });
  });

  describe('getLatestReport', () => {
    it('should return null when no reports exist', async () => {
      const latest = await reportService.getLatestReport();
      expect(latest).toBeNull();
    });

    it('should return the most recent report', async () => {
      await writeFile(
        join(dataOutputPath, '2026-01-20_report.json'),
        JSON.stringify({ tweets: [] })
      );
      await writeFile(
        join(dataOutputPath, '2026-01-21_report.json'),
        JSON.stringify({ tweets: [{ id: '1' }] })
      );

      const latest = await reportService.getLatestReport();

      expect(latest).not.toBeNull();
      expect(latest?.date).toBe('2026-01-21');
    });
  });
});
