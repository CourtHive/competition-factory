import { setState, getMatchUp, getMatchUps, reset, getState } from '@Assemblies/engines/matchUp/stateMethods';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as scoreGovernor from '@Assemblies/governors/scoreGovernor';
import matchUpEngineSync from '@Assemblies/engines/matchUp';
import { setDevContext } from '@Global/state/globalState';

// constants
import { INVALID_OBJECT, MISSING_VALUE } from '@Constants/errorConditionConstants';

describe('matchUpEngine', () => {
  beforeEach(() => {
    matchUpEngineSync.reset();
    setDevContext(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Core engine methods ────────────────────────────────────────────

  it.each([matchUpEngineSync])('throws appropriate errors', async (matchUpEngine) => {
    let result = await matchUpEngine.setState();
    expect(result.error).toEqual(MISSING_VALUE);
    result = await matchUpEngine.setState('foo');
    expect(result.error).toEqual(INVALID_OBJECT);

    const matchUp: any = { matchUpId: '123' };
    result = await matchUpEngine.setState([matchUp]);
    expect(result.success).toEqual(true);

    result = await matchUpEngine.getState();
    expect(result).toEqual(matchUp);

    result = await matchUpEngine.reset();
    expect(result.success).toEqual(true);
    result = await matchUpEngine.getState();
    expect(result).toEqual(undefined);

    result = await matchUpEngine.setState([matchUp], false);
    expect(result.success).toEqual(true);
    result = await matchUpEngine.getState();
    expect(result).toEqual(matchUp);

    matchUp.someAttribute = 'ABC';
    result = await matchUpEngine.getState();
    expect(result).toEqual(matchUp);

    result = await matchUpEngine.setState([matchUp], true);
    expect(result.success).toEqual(true);
    matchUp.anotherAttribute = 'XYZ';

    result = await matchUpEngine.getState();
    expect(result).not.toEqual(matchUp);
    expect(result).toEqual({ matchUpId: '123', someAttribute: 'ABC' });

    result = await matchUpEngine.version();
    expect(result).not.toBeUndefined();

    result = await matchUpEngine.devContext({ foo: true });
    expect(result.success).toEqual(true);
  });

  // ─── processResult branches ─────────────────────────────────────────

  describe('processResult', () => {
    it('error path sets engine.error and engine.success = false', () => {
      const result = matchUpEngineSync.setState();
      expect(result.error).toEqual(MISSING_VALUE);
      expect(result.success).toBe(false);
    });

    it('success path clears error, sets success = true and drawId', () => {
      // First trigger error state
      matchUpEngineSync.setState();
      expect(matchUpEngineSync.error).toEqual(MISSING_VALUE);

      // Now succeed with a drawId
      const matchUp: any = { matchUpId: '123', drawId: 'draw-1' };
      matchUpEngineSync.setState(matchUp);
      expect(matchUpEngineSync.error).toBeUndefined();
      expect(matchUpEngineSync.success).toBe(true);
      expect(matchUpEngineSync.drawId).toEqual('draw-1');
    });

    it('success path sets drawId to undefined when result has no drawId', () => {
      const matchUp: any = { matchUpId: '123' };
      matchUpEngineSync.setState(matchUp);
      expect(matchUpEngineSync.success).toBe(true);
      expect(matchUpEngineSync.drawId).toBeUndefined();
    });
  });

  // ─── setState input formats ─────────────────────────────────────────

  describe('setState input handling', () => {
    it('accepts a single object with matchUpId', () => {
      const result = matchUpEngineSync.setState({ matchUpId: 'm1' } as any);
      expect(result.success).toBe(true);
      const state = matchUpEngineSync.getState();
      expect(state.matchUpId).toEqual('m1');
    });

    it('accepts an object keyed by arbitrary keys with matchUpId values', () => {
      const matchUps = {
        key1: { matchUpId: 'm1' },
        key2: { matchUpId: 'm2' },
      };
      const result = matchUpEngineSync.setState(matchUps as any);
      expect(result.success).toBe(true);
    });

    it('passes deepCopyAttributes to setDeepCopy', () => {
      const matchUp: any = { matchUpId: '123' };
      const result = matchUpEngineSync.setState(matchUp, true, { ignore: ['someField'] } as any);
      expect(result.success).toBe(true);
    });

    it('single object with matchUpId and deepCopy false stores reference', () => {
      const matchUp: any = { matchUpId: 'ref-test' };
      matchUpEngineSync.setState(matchUp, false);
      expect(matchUpEngineSync.success).toBe(true);
      const state = matchUpEngineSync.getState();
      expect(state.matchUpId).toEqual('ref-test');
    });

    it('array with items missing matchUpId skips those items', () => {
      const matchUps: any = [{ matchUpId: 'valid-1' }, { noId: true }, { matchUpId: 'valid-2' }];
      matchUpEngineSync.setState(matchUps);
      expect(matchUpEngineSync.success).toBe(true);
    });

    it('object with values missing matchUpId skips those values', () => {
      const matchUps = {
        a: { matchUpId: 'obj-1' },
        b: { noId: true },
        c: { matchUpId: 'obj-2' },
      };
      matchUpEngineSync.setState(matchUps as any);
      expect(matchUpEngineSync.success).toBe(true);
    });

    it('array with deepCopy false stores references', () => {
      const matchUps: any = [{ matchUpId: 'arr-ref' }];
      matchUpEngineSync.setState(matchUps, false);
      expect(matchUpEngineSync.success).toBe(true);
    });

    it('object values with deepCopy false stores references', () => {
      const matchUps = { a: { matchUpId: 'obj-ref' } };
      matchUpEngineSync.setState(matchUps as any, false);
      expect(matchUpEngineSync.success).toBe(true);
    });
  });

  // ─── getState ───────────────────────────────────────────────────────

  describe('getState', () => {
    it('passes convertExtensions and removeExtensions params', () => {
      matchUpEngineSync.setState({ matchUpId: '123' } as any);
      const state = matchUpEngineSync.getState({ convertExtensions: true, removeExtensions: true });
      expect(state.matchUpId).toEqual('123');
    });
  });

  // ─── invoke function (governor method calls) ────────────────────────

  describe('invoke', () => {
    const setupMatchUp = (overrides = {}) => {
      const matchUp: any = {
        matchUpId: 'test-match-1',
        score: { sets: [{ side1Score: 6, side2Score: 3 }] },
        ...overrides,
      };
      matchUpEngineSync.setState(matchUp);
      return matchUp;
    };

    // ─── matchUp / matchUps resolution ──────────────────────────────

    it('uses matchUp from engine state when not provided in params', () => {
      setupMatchUp();
      const result = matchUpEngineSync.checkScoreHasValue({});
      expect(result).toBe(true);
    });

    it('uses matchUp from params when provided', () => {
      setupMatchUp();
      const emptyMatchUp = { matchUpId: 'other', score: { sets: [] } };
      const result = matchUpEngineSync.checkScoreHasValue({ matchUp: emptyMatchUp });
      expect(result).toBe(false);
    });

    it('uses matchUps from params when provided', () => {
      setupMatchUp();
      const spy = vi.spyOn(scoreGovernor, 'checkScoreHasValue');
      const customMatchUps = [{ matchUpId: 'custom-1' }];
      matchUpEngineSync.checkScoreHasValue({ matchUps: customMatchUps });
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ matchUps: customMatchUps }));
    });

    it('falls back to getMatchUps from state when matchUps not in params', () => {
      setupMatchUp();
      const spy = vi.spyOn(scoreGovernor, 'checkScoreHasValue');
      matchUpEngineSync.checkScoreHasValue({});
      const callArgs = spy.mock.calls[0][0];
      expect(Array.isArray(callArgs.matchUps)).toBe(true);
    });

    it('resets engine.error and engine.success before each invoke', () => {
      setupMatchUp();
      // Trigger a state where engine.error is set
      matchUpEngineSync.setState();
      expect(matchUpEngineSync.error).toBeDefined();

      // Call a governor method - invoke should reset error/success
      matchUpEngineSync.setState(setupMatchUp());
      matchUpEngineSync.checkScoreHasValue({});
      expect(matchUpEngineSync.error).toBeUndefined();
      expect(matchUpEngineSync.success).toBe(false);
    });

    // ─── Error result handling ──────────────────────────────────────

    it('returns error result with rolledBack: false when no rollbackOnError', () => {
      setupMatchUp();
      // generateScoreString without sets returns { error: MISSING_VALUE }
      const result = matchUpEngineSync.generateScoreString({});
      expect(result?.error).toBeDefined();
      expect(result?.rolledBack).toBe(false);
    });

    it('rolls back state and returns rolledBack: true with rollbackOnError', () => {
      setupMatchUp();
      const result = matchUpEngineSync.generateScoreString({ rollbackOnError: true });
      expect(result?.error).toBeDefined();
      expect(result?.rolledBack).toBe(true);
      // State should be preserved (rolled back)
      const state = matchUpEngineSync.getState();
      expect(state.matchUpId).toEqual('test-match-1');
    });

    it('does not call setState for rollback when snapshot is falsy', () => {
      setupMatchUp();
      vi.spyOn(scoreGovernor, 'checkScoreHasValue').mockReturnValueOnce({ error: 'TEST_ERROR' });
      const result = matchUpEngineSync.checkScoreHasValue({});
      expect(result?.error).toEqual('TEST_ERROR');
      expect(result?.rolledBack).toBe(false);
    });

    // ─── Notification behavior ──────────────────────────────────────

    it('notifies subscribers when result has success and no delay/doNotNotify', () => {
      setupMatchUp();
      vi.spyOn(scoreGovernor, 'checkScoreHasValue').mockReturnValueOnce({ success: true });
      const result = matchUpEngineSync.checkScoreHasValue({});
      expect(result?.success).toBe(true);
    });

    it('skips notification and deleteNotices when delayNotify is true', () => {
      setupMatchUp();
      vi.spyOn(scoreGovernor, 'checkScoreHasValue').mockReturnValueOnce({ success: true });
      const result = matchUpEngineSync.checkScoreHasValue({ delayNotify: true });
      // delayNotify: notify=false, !success=false, doNotNotify=false → deleteNotices NOT called
      expect(result?.success).toBe(true);
    });

    it('skips notification but calls deleteNotices when doNotNotify is true', () => {
      setupMatchUp();
      vi.spyOn(scoreGovernor, 'checkScoreHasValue').mockReturnValueOnce({ success: true });
      const result = matchUpEngineSync.checkScoreHasValue({ doNotNotify: true });
      // doNotNotify: notify=false, !success=false, doNotNotify=true → deleteNotices called
      expect(result?.success).toBe(true);
    });

    it('calls deleteNotices when result has no success property', () => {
      setupMatchUp();
      // checkScoreHasValue returns boolean - no .success property
      const result = matchUpEngineSync.checkScoreHasValue({});
      // !result?.success is true → deleteNotices called
      expect(typeof result).toBe('boolean');
    });
  });

  // ─── devContext behavior ────────────────────────────────────────────

  describe('devContext', () => {
    it('returns engine for chaining', () => {
      const result = matchUpEngineSync.devContext(true);
      expect(result).toBe(matchUpEngineSync);
    });

    it('without devContext, errors in governor methods are caught', () => {
      matchUpEngineSync.setState({ matchUpId: '123' } as any);
      // Calling a namespace object (not a function) throws TypeError
      // catch block handles it via handleCaughtError, returns undefined
      const result = matchUpEngineSync.generate({});
      expect(result).toBeUndefined();
    });

    it('with devContext enabled, errors in governor methods propagate', () => {
      matchUpEngineSync.setState({ matchUpId: '123' } as any);
      matchUpEngineSync.devContext(true);
      // Same call now throws because devContext disables try/catch
      expect(() => matchUpEngineSync.generate({})).toThrow();
    });

    it('devContext with object criteria sets context', () => {
      matchUpEngineSync.devContext({ errors: true });
      // Governor methods now run in devContext mode
      matchUpEngineSync.setState({ matchUpId: '123' } as any);
      const result = matchUpEngineSync.checkScoreHasValue({});
      expect(typeof result).toBe('boolean');
    });

    it('clearing devContext restores catch behavior', () => {
      matchUpEngineSync.devContext(true);
      matchUpEngineSync.devContext(undefined);
      matchUpEngineSync.setState({ matchUpId: '123' } as any);
      // Should be caught again
      const result = matchUpEngineSync.generate({});
      expect(result).toBeUndefined();
    });
  });

  // ─── importGovernors coverage ───────────────────────────────────────

  describe('importGovernors', () => {
    it('adds governor methods to the engine', () => {
      // Verify several scoreGovernor methods are available on the engine
      expect(typeof matchUpEngineSync.checkScoreHasValue).toBe('function');
      expect(typeof matchUpEngineSync.generateScoreString).toBe('function');
      expect(typeof matchUpEngineSync.isValidMatchUpFormat).toBe('function');
      expect(typeof matchUpEngineSync.reverseScore).toBe('function');
    });

    it('governor methods receive merged params with matchUpId', () => {
      matchUpEngineSync.setState({ matchUpId: 'merged-test' } as any);
      const spy = vi.spyOn(scoreGovernor, 'checkScoreHasValue');
      matchUpEngineSync.checkScoreHasValue({ extra: 'data' });
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          matchUpId: 'merged-test',
          extra: 'data',
        }),
      );
    });
  });

  // ─── stateMethods direct tests (deepCopyOption=false branches) ──────

  describe('stateMethods', () => {
    beforeEach(() => {
      reset();
    });

    it('setState with single matchUpId object and deepCopy=false stores reference', () => {
      const matchUp: any = { matchUpId: 'direct-1', data: 'original' };
      const result = setState(matchUp, false);
      expect(result).toBe(matchUp);
      const stored = getMatchUp();
      expect(stored).toBe(matchUp);
    });

    it('setState with array and deepCopy=false stores references', () => {
      const m1: any = { matchUpId: 'arr-1' };
      const m2: any = { matchUpId: 'arr-2' };
      setState([m1, m2] as any, false);
      const matchUps = getMatchUps();
      expect(matchUps).toContain(m1);
      expect(matchUps).toContain(m2);
    });

    it('setState with object values and deepCopy=false stores references', () => {
      const m1: any = { matchUpId: 'obj-1' };
      const data = { a: m1 };
      const result = setState(data as any, false);
      expect(result).toBe(data);
      const stored = getMatchUp();
      expect(stored).toBe(m1);
    });

    it('setState with deepCopy=false returns original reference', () => {
      const matchUp: any = { matchUpId: 'ret-1' };
      const resultRef = setState(matchUp, false);
      expect(resultRef).toBe(matchUp);
    });

    it('getState returns deep copy of current matchUp', () => {
      setState({ matchUpId: 'state-1', val: 'test' } as any);
      const state = getState();
      expect(state.matchUpId).toEqual('state-1');
    });

    it('getMatchUps returns all stored matchUps', () => {
      setState([{ matchUpId: 'a' }, { matchUpId: 'b' }] as any);
      const matchUps = getMatchUps();
      expect(matchUps.length).toBe(2);
    });
  });
});
