import { getRoundVisibilityState } from '@Query/publishing/getRoundVisibilityState';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2025-06-15T12:00:00Z').getTime();
const FUTURE_EMBARGO = '2025-06-20T12:00:00Z';
const PAST_EMBARGO = '2025-06-10T12:00:00Z';

const makeMatchUps = (...roundNumbers: number[]) => roundNumbers.map((rn) => ({ roundNumber: rn }));

describe('getRoundVisibilityState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined when structureDetail is undefined', () => {
    expect(getRoundVisibilityState(undefined, makeMatchUps(1, 2))).toBeUndefined();
  });

  it('returns undefined when matchUps is empty', () => {
    expect(getRoundVisibilityState({ roundLimit: 1 }, [])).toBeUndefined();
  });

  it('returns undefined when matchUps is undefined', () => {
    expect(getRoundVisibilityState({ roundLimit: 1 })).toBeUndefined();
  });

  it('returns undefined when maxRound is 0', () => {
    expect(getRoundVisibilityState({ roundLimit: 1 }, [{ roundNumber: 0 }])).toBeUndefined();
  });

  it('marks rounds beyond roundLimit as hidden', () => {
    let result: any = getRoundVisibilityState({ roundLimit: 2 }, makeMatchUps(1, 2, 3, 4));
    expect(result[1]).toBeUndefined();
    expect(result[2]).toBeUndefined();
    expect(result[3]).toEqual({ hidden: true });
    expect(result[4]).toEqual({ hidden: true });
  });

  it('returns undefined when all rounds are within limit', () => {
    expect(getRoundVisibilityState({ roundLimit: 4 }, makeMatchUps(1, 2, 3))).toBeUndefined();
  });

  it('marks rounds with active embargo as embargoed', () => {
    let result: any = getRoundVisibilityState(
      { scheduledRounds: { 2: { embargo: FUTURE_EMBARGO } } },
      makeMatchUps(1, 2, 3),
    );
    expect(result[1]).toBeUndefined();
    expect(result[2]).toEqual({ embargoed: true });
    expect(result[3]).toBeUndefined();
  });

  it('ignores expired embargoes', () => {
    expect(
      getRoundVisibilityState({ scheduledRounds: { 2: { embargo: PAST_EMBARGO } } }, makeMatchUps(1, 2)),
    ).toBeUndefined();
  });

  it('combines hidden and embargoed on the same round', () => {
    let result: any = getRoundVisibilityState(
      { roundLimit: 1, scheduledRounds: { 2: { embargo: FUTURE_EMBARGO } } },
      makeMatchUps(1, 2),
    );
    expect(result[2]).toEqual({ hidden: true, embargoed: true });
  });

  it('returns undefined when no visibility state is produced', () => {
    expect(getRoundVisibilityState({}, makeMatchUps(1, 2))).toBeUndefined();
  });

  it('handles non-contiguous round numbers', () => {
    let result: any = getRoundVisibilityState({ roundLimit: 1 }, makeMatchUps(1, 3));
    expect(result[2]).toEqual({ hidden: true });
    expect(result[3]).toEqual({ hidden: true });
  });
});
