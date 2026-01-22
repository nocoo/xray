import { spawn } from 'child_process';
import { join } from 'path';
import type { SchedulerState, SchedulerStatus, PipelineResult, SchedulerEvent } from './types';

const TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

function toLocalISOString(date: Date): string {
  const local = new Date(date.getTime() + TIMEZONE_OFFSET_MS);
  return local.toISOString();
}

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class Scheduler {
  private state: SchedulerState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private history: SchedulerEvent[] = [];
  private projectPath: string;
  private onStateChange?: (state: SchedulerState) => void;

  constructor(projectPath: string, intervalMs: number = DEFAULT_INTERVAL_MS) {
    this.projectPath = projectPath;
    this.state = {
      status: 'idle',
      lastRunTime: null,
      nextRunTime: null,
      lastResult: null,
      lastError: null,
      intervalMs,
    };
  }

  getState(): SchedulerState {
    return { ...this.state };
  }

  getHistory(): SchedulerEvent[] {
    return [...this.history];
  }

  getPlannedRuns(count: number = 5): SchedulerEvent[] {
    if (!this.state.nextRunTime) return [];
    
    const planned: SchedulerEvent[] = [];
    let nextTime = this.state.nextRunTime.getTime();
    
    for (let i = 0; i < count; i++) {
      planned.push({
        id: `planned-${i}`,
        type: 'planned',
        date: toLocalISOString(new Date(nextTime)),
        status: 'planned',
      });
      nextTime += this.state.intervalMs;
    }
    
    return planned;
  }

  setOnStateChange(callback: (state: SchedulerState) => void): void {
    this.onStateChange = callback;
  }

  private updateState(updates: Partial<SchedulerState>): void {
    this.state = { ...this.state, ...updates };
    this.onStateChange?.(this.state);
  }

  start(): void {
    if (this.timer) return;
    
    this.updateState({
      nextRunTime: new Date(Date.now() + this.state.intervalMs),
    });
    
    this.timer = setInterval(() => {
      this.runPipeline();
    }, this.state.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.updateState({ nextRunTime: null });
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  async trigger(): Promise<PipelineResult> {
    return this.runPipeline();
  }

  async runPipeline(): Promise<PipelineResult> {
    if (this.state.status === 'running') {
      return { success: false, error: 'Pipeline already running' };
    }

    this.updateState({ status: 'running' });
    const startTime = Date.now();

    try {
      const result = await this.executeClaude();
      const duration_ms = Date.now() - startTime;
      
      this.updateState({
        status: 'success',
        lastRunTime: new Date(),
        lastResult: result.result || 'Pipeline completed',
        lastError: null,
        nextRunTime: this.timer ? new Date(Date.now() + this.state.intervalMs) : null,
      });

      this.history.unshift({
        id: `run-${Date.now()}`,
        type: 'history',
        date: toLocalISOString(new Date()),
        status: 'completed',
        result: result.result,
      });

      return { success: true, result: result.result, duration_ms, session_id: result.session_id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const duration_ms = Date.now() - startTime;
      
      this.updateState({
        status: 'error',
        lastRunTime: new Date(),
        lastError: errorMessage,
        nextRunTime: this.timer ? new Date(Date.now() + this.state.intervalMs) : null,
      });

      this.history.unshift({
        id: `run-${Date.now()}`,
        type: 'history',
        date: toLocalISOString(new Date()),
        status: 'failed',
        error: errorMessage,
      });

      return { success: false, error: errorMessage, duration_ms };
    }
  }

  private executeClaude(): Promise<{ result?: string; session_id?: string }> {
    return new Promise((resolve, reject) => {
      const args = [
        '-p',
        '执行 x-ray-pipeline skill，获取过去1小时的推文，完成整个 fetch -> classify -> report -> render 流程',
        '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep',
        '--output-format', 'json',
      ];

      const proc = spawn('claude', args, {
        cwd: this.projectPath,
        env: process.env,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          if (result.is_error) {
            reject(new Error(result.result || 'Pipeline failed'));
          } else {
            resolve({ result: result.result, session_id: result.session_id });
          }
        } catch (e) {
          reject(new Error(`Failed to parse Claude output: ${stdout}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  setInterval(intervalMs: number): void {
    this.state.intervalMs = intervalMs;
    if (this.timer) {
      this.stop();
      this.start();
    }
  }
}

export function createScheduler(projectPath: string, intervalMs?: number): Scheduler {
  return new Scheduler(projectPath, intervalMs);
}
