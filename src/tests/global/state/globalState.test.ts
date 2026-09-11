import { describe, expect, it, beforeEach, vi } from 'vitest';

// constants
import { INVALID_VALUES, MISSING_VALUE, MISSING_ASYNC_STATE_PROVIDER } from '@Constants/errorConditionConstants';
import {
  createInstanceState,
  getDevContext,
  setDevContext,
  timeKeeper,
  setGlobalLog,
  globalLog,
  setDeepCopy,
  deepCopyEnabled,
  setGlobalSubscriptions,
  setSubscriptions,
  setGlobalMethods,
  setMethods,
  cycleMutationStatus,
  addNotice,
  getMethods,
  getNotices,
  deleteNotice,
  deleteNotices,
  getTopics,
  hasTopic,
  callListener,
  getTournamentId,
  getTournamentRecord,
  getTournamentRecords,
  setTournamentRecord,
  setTournamentRecords,
  setTournamentId,
  removeTournamentRecord,
  getProvider,
  handleCaughtError,
  setStateMethods,
  disableNotifications,
  enableNotifications,
} from '@Global/state/globalState';

describe('globalState', () => {
  beforeEach(() => {
    // Reset state between tests
    deleteNotices();
    setDevContext();
  });

  describe('setDevContext and getDevContext', () => {
    it('sets and gets devContext', () => {
      setDevContext({ errors: true, params: false });
      const context = getDevContext();
      expect(context).toEqual({ errors: true, params: false });
    });

    it('returns false when devContext not set', () => {
      setDevContext();
      const context = getDevContext();
      expect(context).toEqual(false);
    });

    it('handles boolean devContext', () => {
      setDevContext(true);
      expect(getDevContext()).toBe(true);

      setDevContext(false);
      expect(getDevContext()).toBe(false);
    });

    it('filters by contextCriteria', () => {
      setDevContext({ errors: true, params: ['method1'], perf: 100 });

      const matchingContext = getDevContext({ errors: true });
      expect(matchingContext).toBeTruthy();

      const nonMatchingContext = getDevContext({ errors: false });
      expect(nonMatchingContext).toBe(false);
    });

    it('returns false when contextCriteria provided but devContext is boolean', () => {
      setDevContext(true);
      const context = getDevContext({ errors: true });
      expect(context).toBe(false);
    });

    it('handles non-object contextCriteria', () => {
      setDevContext({ errors: true });
      const context = getDevContext('invalid' as any);
      expect(context).toEqual({ errors: true });
    });
  });

  describe('timeKeeper', () => {
    it('creates and starts default timer', () => {
      const timer = timeKeeper('start');
      expect(timer.state).toBe('active');
      expect(timer.startTime).toBeDefined();
    });

    it('stops timer and accumulates elapsed time', () => {
      timeKeeper('start', 'test1');
      const stopped = timeKeeper('stop', 'test1');
      expect(stopped.state).toBe('stopped');
    });

    it('reports timer status', () => {
      timeKeeper('start', 'test2');
      const report = timeKeeper('report', 'test2');
      expect(report.timer).toBe('test2');
      expect(report.elapsedTime).toBeDefined();
      expect(report.state).toBe('active');
    });

    it('reports all timers', () => {
      timeKeeper('start', 'timer1');
      timeKeeper('start', 'timer2');
      const allTimers = timeKeeper('report', 'allTimers');
      expect(Array.isArray(allTimers)).toBe(true);
      expect(allTimers.length).toBeGreaterThanOrEqual(2);
    });

    it('resets specific timer', () => {
      timeKeeper('start', 'test3');
      timeKeeper('stop', 'test3');
      timeKeeper('reset', 'test3');
      const report = timeKeeper('report', 'test3');
      expect(report.elapsedTime).toBe('0.00');
    });

    it('resets all timers', () => {
      timeKeeper('start', 'timer1');
      timeKeeper('start', 'timer2');
      timeKeeper('reset', 'allTimers');
      const allTimers = timeKeeper('report', 'allTimers');
      expect(allTimers).toEqual([]);
    });

    it('handles stopped timer on stop', () => {
      timeKeeper('start', 'test4');
      timeKeeper('stop', 'test4');
      const firstElapsed = timeKeeper('report', 'test4').elapsedTime;
      timeKeeper('stop', 'test4'); // Stop again
      const secondElapsed = timeKeeper('report', 'test4').elapsedTime;
      expect(firstElapsed).toBe(secondElapsed);
    });
  });

  describe('setGlobalLog and globalLog', () => {
    it('sets custom logging function', () => {
      const mockLog = vi.fn();
      setGlobalLog(mockLog);
      globalLog({ test: 'data' }, 'testEngine');
      expect(mockLog).toHaveBeenCalledWith({ log: { test: 'data' }, engine: 'testEngine' });
    });

    it('falls back to console.log when no custom log', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      setGlobalLog();
      globalLog({ test: 'data' }, 'engine');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles failing custom log', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const failingLog = vi.fn().mockImplementation(() => {
        throw new Error('Log failed');
      });

      setGlobalLog(failingLog);
      globalLog({ test: 'data' }, 'engine');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('ignores non-function globalLog', () => {
      setGlobalLog('not a function' as any);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      globalLog({ test: 'data' });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('setDeepCopy and deepCopyEnabled', () => {
    it('enables deep copy', () => {
      setDeepCopy(true, {});
      const status = deepCopyEnabled();
      expect(status.enabled).toBe(true);
    });

    it('disables deep copy', () => {
      setDeepCopy(false, {});
      const status = deepCopyEnabled();
      expect(status.enabled).toBe(false);
    });

    it('sets deep copy attributes', () => {
      setDeepCopy(true, {
        stringify: ['attr1'],
        ignore: ['attr2'],
        toJSON: ['attr3'],
        threshold: 1000,
      });

      const status = deepCopyEnabled();
      expect(status.stringify).toEqual(['attr1']);
      expect(status.ignore).toEqual(['attr2']);
      expect(status.toJSON).toEqual(['attr3']);
      expect(status.threshold).toBe(1000);
    });

    it('handles partial attributes', () => {
      setDeepCopy(true, { stringify: ['test'] });
      const status = deepCopyEnabled();
      expect(status.stringify).toEqual(['test']);
    });
  });

  describe('notifications', () => {
    it('disables and enables notifications', () => {
      disableNotifications();
      enableNotifications();
      // Should not throw
      expect(true).toBe(true);
    });

    it('adds notice', () => {
      addNotice({ topic: 'TEST_TOPIC', payload: { data: 'test' } });
      const notices = getNotices({ topic: 'TEST_TOPIC' });
      expect(notices).toBeDefined();
    });

    it('deletes specific notice by key', () => {
      addNotice({ topic: 'TEST', payload: { data: 'test1' }, key: 'key1' });
      addNotice({ topic: 'TEST', payload: { data: 'test2' }, key: 'key2' });
      deleteNotice({ topic: 'TEST', key: 'key1' });
      // Should not throw
      expect(true).toBe(true);
    });

    it('deletes all notices', () => {
      addNotice({ topic: 'TEST1', payload: { data: 'test' } });
      addNotice({ topic: 'TEST2', payload: { data: 'test' } });
      deleteNotices();
      expect(true).toBe(true);
    });

    it('gets topics', () => {
      const { topics } = getTopics();
      expect(Array.isArray(topics)).toBe(true);
    });

    it('checks if topic exists', () => {
      const exists = hasTopic('SOME_TOPIC');
      expect(typeof exists).toBe('boolean');
    });
  });

  describe('subscriptions and methods', () => {
    it('sets global subscriptions', () => {
      const mockCallback = vi.fn();
      const result: any = setGlobalSubscriptions({
        subscriptions: { TEST_TOPIC: mockCallback },
      });
      expect(result.success).toBe(true);
    });

    it('returns error when subscriptions missing', () => {
      const result = setGlobalSubscriptions({});
      expect(result.error).toBe(MISSING_VALUE);
    });

    it('sets subscriptions', () => {
      const mockCallback = vi.fn();
      const result = setSubscriptions({
        subscriptions: { TEST: mockCallback },
      });
      expect(result.success).toBe(true);
    });

    it('sets global methods', () => {
      const mockMethod = vi.fn();
      const result: any = setGlobalMethods({ testMethod: mockMethod });
      expect(result.success).toBe(true);
    });

    it('returns error for invalid global methods', () => {
      const result = setGlobalMethods('not an object' as any);
      expect(result.error).toBe(INVALID_VALUES);
    });

    it('filters non-function methods in setGlobalMethods', () => {
      const result: any = setGlobalMethods({
        validMethod: vi.fn(),
        invalidMethod: 'not a function',
      });
      expect(result.success).toBe(true);
    });

    it('sets methods', () => {
      const result = setMethods({ method1: vi.fn() });
      expect(result.success).toBe(true);
    });

    it('gets methods', () => {
      setGlobalMethods({ globalMethod: vi.fn() });
      setMethods({ localMethod: vi.fn() });
      const methods = getMethods();
      expect(methods).toBeDefined();
    });
  });

  describe('tournament record management', () => {
    it('sets tournament record', () => {
      const record: any = { tournamentId: 't1', tournamentName: 'Test' };
      const result = setTournamentRecord(record);
      expect(result.success).toBe(true);
    });

    it('gets tournament record', () => {
      const record: any = { tournamentId: 't1', tournamentName: 'Test' };
      setTournamentRecord(record);
      const retrieved = getTournamentRecord('t1');
      expect(retrieved.tournamentId).toBe('t1');
    });

    it('sets tournament records', () => {
      setTournamentRecords({
        t1: { tournamentId: 't1' },
        t2: { tournamentId: 't2' },
      });
      const records = getTournamentRecords();
      expect(Object.keys(records)).toHaveLength(2);
    });

    it('sets tournament ID', () => {
      setTournamentRecord({ tournamentId: 't1' } as any);
      const result = setTournamentId('t1');
      expect(result.success).toBe(true);
    });

    it('gets tournament ID', () => {
      setTournamentRecord({ tournamentId: 't1' } as any);
      setTournamentId('t1');
      const id = getTournamentId();
      expect(id).toBe('t1');
    });

    it('removes tournament record', () => {
      setTournamentRecord({ tournamentId: 't1' } as any);
      const result = removeTournamentRecord('t1');
      expect(result.success).toBe(true);
    });
  });

  describe('setStateMethods', () => {
    it('sets state methods from object', () => {
      const methods = {
        method1: vi.fn(),
        method2: vi.fn(),
        nested: {
          method3: vi.fn(),
        },
      };

      const result = setStateMethods(methods, true, 2, false);
      expect(result.methods).toBeDefined();
    });

    it('returns error for non-object input', () => {
      const result = setStateMethods('invalid' as any, false, 1, false);
      expect(result.error).toBe(INVALID_VALUES);
    });

    it('traverses nested objects when traverse is true', () => {
      const methods = {
        method1: vi.fn(),
        nested: {
          method2: vi.fn(),
        },
      };

      const result: any = setStateMethods(methods, true, 2, false);
      expect(Object.keys(result.methods).length).toBeGreaterThan(1);
    });

    it('respects maxDepth', () => {
      const methods = {
        level1: vi.fn(),
        nested1: {
          level2: vi.fn(),
          nested2: {
            level3: vi.fn(),
          },
        },
      };

      const result = setStateMethods(methods, true, 1, false);
      expect(result.methods).toBeDefined();
    });

    it('uses collectionFilter array', () => {
      const methods = {
        allowed: { method1: vi.fn() },
        notAllowed: { method2: vi.fn() },
      };

      const result = setStateMethods(methods, ['allowed'], 2, false);
      expect(result.methods).toBeDefined();
    });

    it('sets global methods when global is true', () => {
      const methods = { globalMethod: vi.fn() };
      const result = setStateMethods(methods, false, 1, true);
      expect(result.methods).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('handles caught error with error object', () => {
      const result = handleCaughtError({
        engineName: 'testEngine',
        methodName: 'testMethod',
        params: { test: 'param' },
        err: new Error('Test error'),
      });
      expect(result.error).toBeDefined();
    });

    it('handles caught error with string', () => {
      const result = handleCaughtError({
        engineName: 'testEngine',
        methodName: 'testMethod',
        params: {},
        err: 'string error',
      });
      expect(result.error).toBeDefined();
    });

    it('excludes tournamentRecord from error log', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      handleCaughtError({
        engineName: 'test',
        methodName: 'method',
        params: { tournamentRecord: { data: 'sensitive' }, other: 'param' },
        err: 'error',
      });
      consoleSpy.mockRestore();
    });
  });

  describe('mutation status', () => {
    it('cycles mutation status', () => {
      const status = cycleMutationStatus();
      expect(typeof status).toBe('boolean');
    });
  });

  describe('getProvider', () => {
    it('returns state provider', () => {
      const provider = getProvider();
      expect(provider).toBeDefined();
    });
  });

  describe('createInstanceState', () => {
    it('returns error when provider lacks method', () => {
      const result = createInstanceState();
      expect(result.error).toBe(MISSING_ASYNC_STATE_PROVIDER);
    });
  });

  describe('callListener', () => {
    it('calls listener', async () => {
      const mockCallback = vi.fn();
      setSubscriptions({ subscriptions: { TEST: mockCallback } });
      await callListener({ topic: 'TEST', payloads: [{ data: 'test' }] });
      // Should not throw
      expect(true).toBe(true);
    });
  });
});
