import { readdir, readFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import type { ReportMeta, ReportData } from './types';

export class ReportService {
  private publicPath: string;
  private dataOutputPath: string;

  constructor(projectPath: string) {
    this.publicPath = join(projectPath, 'public');
    this.dataOutputPath = join(projectPath, 'data', 'output');
  }

  async listReports(): Promise<ReportMeta[]> {
    const reports: ReportMeta[] = [];
    
    try {
      const files = await readdir(this.dataOutputPath);
      const jsonFiles = files.filter(f => f.endsWith('_report.json'));
      
      for (const file of jsonFiles) {
        const filePath = join(this.dataOutputPath, file);
        const fileStat = await stat(filePath);
        
        const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})_report\.json$/);
        if (!dateMatch) continue;
        
        try {
          const content = await readFile(filePath, 'utf-8');
          const data = JSON.parse(content) as ReportData;
          
          reports.push({
            date: dateMatch[1],
            filename: file,
            path: filePath,
            generatedAt: data.generated_at || fileStat.mtime.toISOString(),
            tweetCount: data.tweets?.length || 0,
          });
        } catch {
          reports.push({
            date: dateMatch[1],
            filename: file,
            path: filePath,
            generatedAt: fileStat.mtime.toISOString(),
            tweetCount: 0,
          });
        }
      }
    } catch (error) {
      console.error('Error listing reports:', error);
    }
    
    return reports.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getReport(date: string): Promise<ReportData | null> {
    const filename = `${date}_report.json`;
    const filePath = join(this.dataOutputPath, filename);
    
    try {
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as ReportData;
    } catch {
      return null;
    }
  }

  async getReportHtml(date: string): Promise<string | null> {
    const filename = `${date}_report.html`;
    const filePath = join(this.publicPath, filename);
    
    try {
      return await readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  async getLatestReport(): Promise<ReportMeta | null> {
    const reports = await this.listReports();
    return reports[0] || null;
  }
}

export function createReportService(projectPath: string): ReportService {
  return new ReportService(projectPath);
}
