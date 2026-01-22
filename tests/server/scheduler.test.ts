import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { Scheduler } from '../../server/lib/scheduler';

describe('Scheduler', () => {
  let scheduler: Scheduler;
  const testProjectPath = '/tmp/test-project';

  beforeEach(() => {
    scheduler = new Scheduler(testProjectPath, 1000);
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe('getState', () => {
    it('should return initial state', () => {
      const state = scheduler.getState();
      
      expect(state.status).toBe('idle');
      expect(state.lastRunTime).toBeNull();
      expect(state.nextRunTime).toBeNull();
      expect(state.lastResult).toBeNull();
      expect(state.lastError).toBeNull();
      expect(state.intervalMs).toBe(1000);
    });
  });

  describe('start/stop', () => {
    it('should start scheduler and set nextRunTime', () => {
      scheduler.start();
      
      expect(scheduler.isRunning()).toBe(true);
      const state = scheduler.getState();
      expect(state.nextRunTime).not.toBeNull();
    });

    it('should stop scheduler and clear nextRunTime', () => {
      scheduler.start();
      scheduler.stop();
      
      expect(scheduler.isRunning()).toBe(false);
      const state = scheduler.getState();
      expect(state.nextRunTime).toBeNull();
    });

    it('should not start twice', () => {
      scheduler.start();
      const firstNextRun = scheduler.getState().nextRunTime;
      
      scheduler.start();
      const secondNextRun = scheduler.getState().nextRunTime;
      
      expect(firstNextRun).toEqual(secondNextRun);
    });
  });

  describe('getHistory', () => {
    it('should return empty history initially', () => {
      const history = scheduler.getHistory();
      expect(history).toEqual([]);
    });
  });

  describe('getPlannedRuns', () => {
    it('should return empty array when not running', () => {
      const planned = scheduler.getPlannedRuns();
      expect(planned).toEqual([]);
    });

    it('should return planned runs when running', () => {
      scheduler.start();
      const planned = scheduler.getPlannedRuns(3);
      
      expect(planned.length).toBe(3);
      expect(planned[0].type).toBe('planned');
      expect(planned[0].status).toBe('planned');
    });
  });

  describe('setInterval', () => {
    it('should update interval', () => {
      scheduler.setInterval(5000);
      
      const state = scheduler.getState();
      expect(state.intervalMs).toBe(5000);
    });

    it('should restart scheduler with new interval when running', () => {
      scheduler.start();
      const oldNextRun = scheduler.getState().nextRunTime;
      
      scheduler.setInterval(10000);
      
      expect(scheduler.isRunning()).toBe(true);
      expect(scheduler.getState().intervalMs).toBe(10000);
    });
  });

  describe('setOnStateChange', () => {
    it('should call callback when state changes', () => {
      const callback = mock(() => {});
      scheduler.setOnStateChange(callback);
      
      scheduler.start();
      
      expect(callback).toHaveBeenCalled();
    });
  });
});
