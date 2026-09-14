import { setState, getMatchUp, getMatchUps, reset, getState } from '@Assemblies/engines/matchUp/stateMethods';
import { INVALID_OBJECT, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { describe, expect, it, beforeEach } from 'vitest';

describe('stateMethods', () => {
  // Reset state before each test to ensure isolation
  beforeEach(() => {
    reset();
  });

  describe('setState', () => {
    // Basic functionality
    it('sets state with a single matchUp object', () => {
      const matchUp = {
        matchUpId: 'm1',
        roundNumber: 1,
        sides: [],
      };

      const result = setState(matchUp);

      expect(result.matchUpId).toBe('m1');
      expect(getMatchUp()).toEqual(matchUp);
    });

    it('sets state with matchUp containing nested data', () => {
      const matchUp = {
        matchUpId: 'm1',
        roundNumber: 1,
        sides: [
          { sideNumber: 1, participantId: 'p1' },
          { sideNumber: 2, participantId: 'p2' },
        ],
        score: { sets: [{ side1Score: 6, side2Score: 4 }] },
      };

      setState(matchUp);

      const retrieved = getMatchUp();
      expect(retrieved.matchUpId).toBe('m1');
      expect(retrieved.sides).toHaveLength(2);
      expect(retrieved.score.sets).toHaveLength(1);
    });

    // Array handling
    it('sets state with an array of matchUps', () => {
      const matchUps = [
        { matchUpId: 'm1', roundNumber: 1 },
        { matchUpId: 'm2', roundNumber: 2 },
        { matchUpId: 'm3', roundNumber: 3 },
      ];

      setState(matchUps as any);

      const allMatchUps = getMatchUps();
      expect(allMatchUps).toHaveLength(3);
      expect(allMatchUps.map((m: any) => m.matchUpId)).toContain('m1');
      expect(allMatchUps.map((m: any) => m.matchUpId)).toContain('m2');
      expect(allMatchUps.map((m: any) => m.matchUpId)).toContain('m3');
    });

    it('sets current matchUpId to last processed in array', () => {
      const matchUps = [
        { matchUpId: 'm1', roundNumber: 1 },
        { matchUpId: 'm2', roundNumber: 2 },
        { matchUpId: 'm3', roundNumber: 3 },
      ];

      setState(matchUps as any);

      // After processing reversed array, last matchUpId without existing id becomes current
      expect(getMatchUp().matchUpId).toBe('m3');
    });

    it('handles array with matchUps missing matchUpId', () => {
      const matchUps = [
        { matchUpId: 'm1', roundNumber: 1 },
        { roundNumber: 2 }, // No matchUpId
        { matchUpId: 'm3', roundNumber: 3 },
      ];

      setState(matchUps as any);

      const allMatchUps = getMatchUps();
      expect(allMatchUps).toHaveLength(2); // Only 2 with matchUpId
    });

    it('handles empty array', () => {
      setState([] as any);

      expect(getMatchUps()).toHaveLength(0);
      expect(getMatchUp()).toBeUndefined();
    });

    // Object handling
    it('sets state with an object containing matchUps', () => {
      const matchUpsObject = {
        match1: { matchUpId: 'm1', roundNumber: 1 },
        match2: { matchUpId: 'm2', roundNumber: 2 },
        match3: { matchUpId: 'm3', roundNumber: 3 },
      };

      setState(matchUpsObject as any);

      const allMatchUps = getMatchUps();
      expect(allMatchUps).toHaveLength(3);
    });

    it('handles object with nested matchUps', () => {
      const data = {
        group1: {
          matchUpId: 'm1',
          roundNumber: 1,
          sides: [{ participantId: 'p1' }],
        },
        group2: {
          matchUpId: 'm2',
          roundNumber: 2,
          sides: [{ participantId: 'p2' }],
        },
      };

      setState(data as any);

      const allMatchUps = getMatchUps();
      expect(allMatchUps).toHaveLength(2);
    });

    it('handles object with some entries missing matchUpId', () => {
      const data = {
        valid1: { matchUpId: 'm1', roundNumber: 1 },
        invalid: { roundNumber: 2 }, // No matchUpId
        valid2: { matchUpId: 'm3', roundNumber: 3 },
      };

      setState(data as any);

      const allMatchUps = getMatchUps();
      expect(allMatchUps).toHaveLength(2);
    });

    // Deep copy option
    it('creates deep copy by default', () => {
      const matchUp = {
        matchUpId: 'm1',
        sides: [{ sideNumber: 1 }],
      };

      setState(matchUp);

      // Modify original
      matchUp.sides[0].sideNumber = 999;

      // Retrieved should not be affected
      const retrieved = getMatchUp();
      expect(retrieved.sides[0].sideNumber).toBe(1);
    });

    it('does not deep copy when deepCopyOption is false', () => {
      const matchUp = {
        matchUpId: 'm1',
        sides: [{ sideNumber: 1 }],
      };

      setState(matchUp, false);

      // Modify original
      matchUp.sides[0].sideNumber = 999;

      // Retrieved SHOULD be affected (no deep copy)
      const retrieved = getMatchUp();
      expect(retrieved.sides[0].sideNumber).toBe(999);
    });

    it('deep copies array elements when deepCopyOption is true', () => {
      const matchUps = [
        { matchUpId: 'm1', value: { nested: 1 } },
        { matchUpId: 'm2', value: { nested: 2 } },
      ];

      setState(matchUps as any);

      // Modify original
      matchUps[0].value.nested = 999;

      // Retrieved should not be affected
      const allMatchUps = getMatchUps();
      const m1: any = allMatchUps.find((m: any) => m.matchUpId === 'm1');
      expect(m1.value.nested).toBe(1);
    });

    // Error handling
    it('returns error when value is null', () => {
      const result = setState(null as any);

      expect(result.error).toBe(MISSING_VALUE);
    });

    it('returns error when value is undefined', () => {
      const result = setState(undefined as any);

      expect(result.error).toBe(MISSING_VALUE);
    });

    it('returns error when value is not an object', () => {
      const result = setState('not an object' as any);

      expect(result.error).toBe(INVALID_OBJECT);
    });

    it('returns error when value is a number', () => {
      const result = setState(42 as any);

      expect(result.error).toBe(INVALID_OBJECT);
    });

    it('returns error when value is a boolean', () => {
      const result = setState(true as any);

      expect(result.error).toBe(INVALID_OBJECT);
    });

    // Edge cases
    it('handles matchUp without matchUpId', () => {
      const matchUp = {
        roundNumber: 1,
        sides: [],
      };

      setState(matchUp as any);

      expect(getMatchUp()).toBeUndefined();
    });

    it('updates existing matchUp when same matchUpId', () => {
      setState({ matchUpId: 'm1', roundNumber: 1 });
      setState({ matchUpId: 'm1', roundNumber: 2 });

      expect(getMatchUp().roundNumber).toBe(2);
      expect(getMatchUps()).toHaveLength(1);
    });

    it('handles multiple setState calls with different matchUps', () => {
      setState({ matchUpId: 'm1', roundNumber: 1 });
      setState({ matchUpId: 'm2', roundNumber: 2 });
      setState({ matchUpId: 'm3', roundNumber: 3 });

      expect(getMatchUps()).toHaveLength(3);
      expect(getMatchUp().matchUpId).toBe('m3'); // Last one set
    });

    it('preserves all matchUps when adding new ones', () => {
      setState({ matchUpId: 'm1', roundNumber: 1 });
      setState({ matchUpId: 'm2', roundNumber: 2 });

      const allMatchUps = getMatchUps();
      expect(allMatchUps).toHaveLength(2);
      expect(allMatchUps.find((m: any) => m.matchUpId === 'm1')).toBeDefined();
      expect(allMatchUps.find((m: any) => m.matchUpId === 'm2')).toBeDefined();
    });
  });

  describe('getMatchUp', () => {
    it('returns undefined when no state set', () => {
      expect(getMatchUp()).toBeUndefined();
    });

    it('returns the current matchUp', () => {
      setState({ matchUpId: 'm1', roundNumber: 1 });

      const matchUp = getMatchUp();
      expect(matchUp.matchUpId).toBe('m1');
      expect(matchUp.roundNumber).toBe(1);
    });

    it('returns most recently set matchUp from array', () => {
      setState([
        { matchUpId: 'm1', roundNumber: 1 },
        { matchUpId: 'm2', roundNumber: 2 },
      ] as any);

      // After processing, last one without existing matchUpId becomes current
      expect(getMatchUp().matchUpId).toBe('m2');
    });

    it('returns reference to matchUp (not deep copy)', () => {
      setState({ matchUpId: 'm1', sides: [{ sideNumber: 1 }] });

      const retrieved = getMatchUp();
      retrieved.sides[0].sideNumber = 999;

      // getMatchUp returns reference, so it IS affected
      expect(getMatchUp().sides[0].sideNumber).toBe(999);
    });
  });

  describe('getMatchUps', () => {
    it('returns empty array when no state set', () => {
      expect(getMatchUps()).toEqual([]);
    });

    it('returns array of all matchUps', () => {
      setState([
        { matchUpId: 'm1', roundNumber: 1 },
        { matchUpId: 'm2', roundNumber: 2 },
        { matchUpId: 'm3', roundNumber: 3 },
      ] as any);

      const matchUps = getMatchUps();
      expect(matchUps).toHaveLength(3);
    });

    it('returns array after setting single matchUp', () => {
      setState({ matchUpId: 'm1', roundNumber: 1 });

      const matchUps: any[] = getMatchUps();
      expect(matchUps).toHaveLength(1);
      expect(matchUps[0].matchUpId).toBe('m1');
    });

    it('returns all matchUps from multiple setState calls', () => {
      setState({ matchUpId: 'm1', roundNumber: 1 });
      setState({ matchUpId: 'm2', roundNumber: 2 });

      const matchUps = getMatchUps();
      expect(matchUps).toHaveLength(2);
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      setState({ matchUpId: 'm1', roundNumber: 1 });
      setState({ matchUpId: 'm2', roundNumber: 2 });

      reset();

      expect(getMatchUp()).toBeUndefined();
      expect(getMatchUps()).toEqual([]);
    });

    it('allows setState after reset', () => {
      setState({ matchUpId: 'm1', roundNumber: 1 });
      reset();
      setState({ matchUpId: 'm2', roundNumber: 2 });

      expect(getMatchUp().matchUpId).toBe('m2');
      expect(getMatchUps()).toHaveLength(1);
    });

    it('can be called multiple times', () => {
      reset();
      reset();
      reset();

      expect(getMatchUps()).toEqual([]);
    });

    it('resets current matchUpId', () => {
      setState({ matchUpId: 'm1', roundNumber: 1 });
      reset();

      expect(getMatchUp()).toBeUndefined();
    });
  });

  describe('getState', () => {
    it('returns current matchUp state', () => {
      setState({ matchUpId: 'm1', roundNumber: 1, sides: [] });

      const state = getState();
      expect(state.matchUpId).toBe('m1');
      expect(state.roundNumber).toBe(1);
    });

    it('returns deep copy of state', () => {
      setState({ matchUpId: 'm1', sides: [{ sideNumber: 1 }] });

      const state = getState();
      state.sides[0].sideNumber = 999;

      // Original should not be affected
      expect(getMatchUp().sides[0].sideNumber).toBe(1);
    });

    it('returns undefined when no state set', () => {
      const state = getState();
      expect(state).toBeUndefined();
    });

    it('handles convertExtensions parameter', () => {
      setState({
        matchUpId: 'm1',
        extensions: [{ name: 'test', value: 'data' }],
      });

      const state = getState({ convertExtensions: true });
      expect(state).toBeDefined();
    });

    it('handles removeExtensions parameter', () => {
      setState({
        matchUpId: 'm1',
        extensions: [{ name: 'test', value: 'data' }],
      });

      const state = getState({ removeExtensions: true });
      expect(state).toBeDefined();
    });

    it('handles both convertExtensions and removeExtensions', () => {
      setState({
        matchUpId: 'm1',
        extensions: [{ name: 'test', value: 'data' }],
      });

      const state = getState({
        convertExtensions: true,
        removeExtensions: true,
      });
      expect(state).toBeDefined();
    });

    it('handles empty params object', () => {
      setState({ matchUpId: 'm1', roundNumber: 1 });

      const state = getState({});
      expect(state.matchUpId).toBe('m1');
    });

    it('handles undefined params', () => {
      setState({ matchUpId: 'm1', roundNumber: 1 });

      const state = getState();
      expect(state.matchUpId).toBe('m1');
    });

    it('handles null params', () => {
      setState({ matchUpId: 'm1', roundNumber: 1 });

      const state = getState(null);
      expect(state.matchUpId).toBe('m1');
    });
  });

  describe('integration scenarios', () => {
    it('handles complete workflow', () => {
      // Set initial state
      setState({ matchUpId: 'm1', roundNumber: 1 });
      expect(getMatchUp().matchUpId).toBe('m1');

      // Add more matchUps (array processing sets current to last)
      setState([
        { matchUpId: 'm2', roundNumber: 2 },
        { matchUpId: 'm3', roundNumber: 3 },
      ] as any);
      expect(getMatchUps()).toHaveLength(3);

      // Get state - current should be from the array (not m1)
      const state = getState();
      expect(state.matchUpId).toBe('m1'); // m1 was already set, so it stays current

      // Reset
      reset();
      expect(getMatchUps()).toEqual([]);
    });

    it('maintains state isolation between calls', () => {
      setState({ matchUpId: 'm1', value: 1 });
      const first = getMatchUp();

      setState({ matchUpId: 'm2', value: 2 });
      const second = getMatchUp();

      // Both should still exist in state
      expect(getMatchUps()).toHaveLength(2);
      expect(first.matchUpId).toBe('m1');
      expect(second.matchUpId).toBe('m2');
    });

    it('handles complex nested structures', () => {
      const complexMatchUp = {
        matchUpId: 'm1',
        roundNumber: 1,
        sides: [
          {
            sideNumber: 1,
            participant: {
              participantId: 'p1',
              person: {
                personId: 'person1',
                standardName: 'John Doe',
              },
            },
          },
        ],
        score: {
          sets: [
            {
              setNumber: 1,
              side1Score: 6,
              side2Score: 4,
              games: [{ gameNumber: 1 }],
            },
          ],
        },
      };

      setState(complexMatchUp);

      const retrieved = getMatchUp();
      expect(retrieved.sides[0].participant.person.standardName).toBe('John Doe');
      expect(retrieved.score.sets[0].games).toHaveLength(1);
    });
  });
});
