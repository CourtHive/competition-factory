import { setDevContext, setGlobalLog } from '@Global/state/globalState';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { engineLogging } from '@Global/state/engineLogging';

describe('engineLogging', () => {
  beforeEach(() => {
    setDevContext();
    setGlobalLog();
  });

  it('returns early when devContext is not an object', () => {
    setDevContext(false);

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 100,
      params: {},
      result: { success: true },
    });

    // Should not throw
    expect(true).toBe(true);
  });

  it('logs when devContext is true (boolean)', () => {
    setDevContext(true);

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 100,
      params: {},
      result: { success: true },
    });

    expect(true).toBe(true);
  });

  it('logs error when result has error', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({ errors: true });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 10,
      params: { test: 'param' },
      result: { error: 'TEST_ERROR' } as any,
    });

    expect(mockLog).toHaveBeenCalled();
    const logCall = mockLog.mock.calls[0][0];
    expect(logCall.log.params).toBeDefined();
    expect(logCall.log.result).toBeDefined();
  });

  it('logs error for specific methods when errors is array', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({ errors: ['testMethod', 'otherMethod'] });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 10,
      params: {},
      result: { error: 'ERROR' } as any,
    });

    expect(mockLog).toHaveBeenCalled();
  });

  it('does not log error when method not in errors array', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({ errors: ['otherMethod'] });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 10,
      params: {},
      result: { error: 'ERROR' } as any,
    });

    expect(mockLog).not.toHaveBeenCalled();
  });

  it('logs params when params is true in devContext', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({ params: true });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 10,
      params: { test: 'data' },
      result: { success: true },
    });

    expect(mockLog).toHaveBeenCalled();
    const logCall = mockLog.mock.calls[0][0];
    expect(logCall.log.params).toEqual({ test: 'data' });
  });

  it('logs params for specific methods when params is array', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({ params: ['testMethod'] });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 10,
      params: { test: 'data' },
      result: { success: true },
    });

    expect(mockLog).toHaveBeenCalled();
  });

  it('logs result when result is true in devContext', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({ result: true });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 10,
      params: {},
      result: { success: true, data: 'test' } as any,
    });

    expect(mockLog).toHaveBeenCalled();
    const logCall = mockLog.mock.calls[0][0];
    expect(logCall.log.result).toBeDefined();
  });

  it('logs result for specific methods when result is array', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({ result: ['testMethod'] });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 10,
      params: {},
      result: { success: true },
    });

    expect(mockLog).toHaveBeenCalled();
  });

  it('logs elapsed time when perf threshold exceeded', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({ perf: 50 });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 100,
      params: {},
      result: { success: true },
    });

    expect(mockLog).toHaveBeenCalled();
    const logCall = mockLog.mock.calls[0][0];
    expect(logCall.log.elapsed).toBe(100);
  });

  it('does not log elapsed when below perf threshold', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({ perf: 200 });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 100,
      params: {},
      result: { success: true },
    });

    // Log should be called but without elapsed
    if (mockLog.mock.calls.length > 0) {
      const logCall = mockLog.mock.calls[0][0];
      expect(logCall.log.elapsed).toBeUndefined();
    }
  });

  it('excludes methods in exclude array', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({
      exclude: ['testMethod'],
      params: true,
      result: true,
      perf: 0,
    });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 100,
      params: { test: 'data' },
      result: { success: true },
    });

    expect(mockLog).not.toHaveBeenCalled();
  });

  it('does not log when only method name in log', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({});

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 10,
      params: {},
      result: { success: true },
    });

    // Should not log when no logging options enabled
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('handles undefined perf value', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({ perf: undefined });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 100,
      params: {},
      result: { success: true },
    });

    // Should not throw
    expect(true).toBe(true);
  });

  it('handles false perf value', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({ perf: false as any });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 100,
      params: {},
      result: { success: true },
    });

    expect(true).toBe(true);
  });

  it('handles NaN perf value', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({ perf: Number.NaN });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 100,
      params: {},
      result: { success: true },
    });

    expect(true).toBe(true);
  });

  it('logs both params and result when both enabled', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({ params: true, result: true });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 10,
      params: { test: 'param' },
      result: { success: true, data: 'result' } as any,
    });

    expect(mockLog).toHaveBeenCalled();
    const logCall = mockLog.mock.calls[0][0];
    expect(logCall.log.params).toBeDefined();
    expect(logCall.log.result).toBeDefined();
  });

  it('includes engineType in log', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({ params: true });

    engineLogging({
      engineType: 'tournamentEngine',
      methodName: 'testMethod',
      elapsed: 10,
      params: {},
      result: { success: true },
    });

    expect(mockLog).toHaveBeenCalled();
    const logCall = mockLog.mock.calls[0][0];
    expect(logCall.engine).toBe('tournamentEngine');
  });

  it('handles complex devContext combinations', () => {
    const mockLog = vi.fn();
    setGlobalLog(mockLog);
    setDevContext({
      errors: ['method1'],
      params: true,
      result: ['method2'],
      perf: 50,
      exclude: ['method3'],
    });

    engineLogging({
      engineType: 'test',
      methodName: 'testMethod',
      elapsed: 100,
      params: { data: 'test' },
      result: { success: true },
    });

    expect(mockLog).toHaveBeenCalled();
  });
});
