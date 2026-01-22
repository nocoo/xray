export type SchedulerStatus = 'idle' | 'running' | 'success' | 'error';

export interface SchedulerState {
  status: SchedulerStatus;
  lastRunTime: Date | null;
  nextRunTime: Date | null;
  lastResult: string | null;
  lastError: string | null;
  intervalMs: number;
}

export interface ReportMeta {
  date: string;
  filename: string;
  path: string;
  generatedAt: string;
  tweetCount: number;
}

export interface ReportSummary {
  total_tweets: number;
  time_range: {
    start: string;
    end: string;
  };
}

export interface ReportData {
  generated_at: string;
  summary: ReportSummary;
  time_range: {
    start: string;
    end: string;
  };
  tweets: any[];
}

export interface SchedulerEvent {
  id: string;
  type: 'history' | 'planned';
  date: string;
  status: 'completed' | 'failed' | 'planned';
  result?: string;
  error?: string;
}

export interface PipelineResult {
  success: boolean;
  result?: string;
  error?: string;
  duration_ms?: number;
  session_id?: string;
}
