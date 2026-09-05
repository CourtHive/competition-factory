import { describe, expect, it } from 'vitest';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import { QUALIFYING, MAIN, CONSOLATION } from '@Constants/drawDefinitionConstants';

describe('matchUpSort', () => {
  it('sorts by stage order', () => {
    const matchUps = [
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 1 },
      { stage: QUALIFYING, stageSequence: 1, roundNumber: 1, roundPosition: 1 },
      { stage: CONSOLATION, stageSequence: 1, roundNumber: 1, roundPosition: 1 },
    ];

    matchUps.sort(matchUpSort);

    expect(matchUps[0].stage).toBe(QUALIFYING);
    expect(matchUps[1].stage).toBe(MAIN);
    expect(matchUps[2].stage).toBe(CONSOLATION);
  });

  it('sorts by stageSequence when stage is equal', () => {
    const matchUps = [
      { stage: MAIN, stageSequence: 3, roundNumber: 1, roundPosition: 1 },
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 1 },
      { stage: MAIN, stageSequence: 2, roundNumber: 1, roundPosition: 1 },
    ];

    matchUps.sort(matchUpSort);

    expect(matchUps[0].stageSequence).toBe(1);
    expect(matchUps[1].stageSequence).toBe(2);
    expect(matchUps[2].stageSequence).toBe(3);
  });

  it('sorts by roundNumber when stage and stageSequence are equal', () => {
    const matchUps = [
      { stage: MAIN, stageSequence: 1, roundNumber: 3, roundPosition: 1 },
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 1 },
      { stage: MAIN, stageSequence: 1, roundNumber: 2, roundPosition: 1 },
    ];

    matchUps.sort(matchUpSort);

    expect(matchUps[0].roundNumber).toBe(1);
    expect(matchUps[1].roundNumber).toBe(2);
    expect(matchUps[2].roundNumber).toBe(3);
  });

  it('sorts by roundPosition when all else is equal', () => {
    const matchUps = [
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 3 },
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 1 },
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 2 },
    ];

    matchUps.sort(matchUpSort);

    expect(matchUps[0].roundPosition).toBe(1);
    expect(matchUps[1].roundPosition).toBe(2);
    expect(matchUps[2].roundPosition).toBe(3);
  });

  it('handles missing stage', () => {
    const matchUps = [
      { stageSequence: 1, roundNumber: 1, roundPosition: 1 },
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 1 },
    ];

    matchUps.sort(matchUpSort);

    // Missing stage defaults to 0 in stageOrder
    expect(matchUps[0].stage).toBeUndefined();
    expect(matchUps[1].stage).toBe(MAIN);
  });

  it('handles missing stageSequence', () => {
    const matchUps = [
      { stage: MAIN, stageSequence: 2, roundNumber: 1, roundPosition: 1 },
      { stage: MAIN, roundNumber: 1, roundPosition: 1 },
    ];

    matchUps.sort(matchUpSort);

    // Missing stageSequence defaults to 0
    expect(matchUps[0].stageSequence).toBeUndefined();
    expect(matchUps[1].stageSequence).toBe(2);
  });

  it('handles missing roundNumber', () => {
    const matchUps = [
      { stage: MAIN, stageSequence: 1, roundNumber: 2, roundPosition: 1 },
      { stage: MAIN, stageSequence: 1, roundPosition: 1 },
    ];

    matchUps.sort(matchUpSort);

    // When roundNumber is missing, no sorting by round
    expect(matchUps).toHaveLength(2);
  });

  it('handles missing roundPosition', () => {
    const matchUps = [
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 2 },
      { stage: MAIN, stageSequence: 1, roundNumber: 1 },
    ];

    matchUps.sort(matchUpSort);

    // Missing roundPosition defaults to 0
    expect(matchUps[0].roundPosition).toBeUndefined();
    expect(matchUps[1].roundPosition).toBe(2);
  });

  it('handles null stage', () => {
    const matchUps = [
      { stage: null, stageSequence: 1, roundNumber: 1, roundPosition: 1 },
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 1 },
    ];

    matchUps.sort(matchUpSort);

    expect(matchUps[0].stage).toBe(null);
    expect(matchUps[1].stage).toBe(MAIN);
  });

  it('handles null stageSequence', () => {
    const matchUps = [
      { stage: MAIN, stageSequence: null, roundNumber: 1, roundPosition: 1 },
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 1 },
    ];

    matchUps.sort(matchUpSort);

    expect(matchUps[0].stageSequence).toBe(null);
    expect(matchUps[1].stageSequence).toBe(1);
  });

  it('handles undefined roundNumber for both', () => {
    const matchUps = [
      { stage: MAIN, stageSequence: 1, roundPosition: 2 },
      { stage: MAIN, stageSequence: 1, roundPosition: 1 },
    ];

    matchUps.sort(matchUpSort);

    // Should sort by roundPosition when roundNumber is missing
    expect(matchUps[0].roundPosition).toBe(1);
    expect(matchUps[1].roundPosition).toBe(2);
  });

  it('handles unknown stage', () => {
    const matchUps = [
      { stage: 'UNKNOWN_STAGE' as any, stageSequence: 1, roundNumber: 1, roundPosition: 1 },
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 1 },
    ];

    matchUps.sort(matchUpSort);

    // Unknown stage defaults to 0 in stageOrder
    expect(matchUps[0].stage).toBe('UNKNOWN_STAGE');
    expect(matchUps[1].stage).toBe(MAIN);
  });

  it('handles complex sorting scenario', () => {
    const matchUps = [
      { stage: MAIN, stageSequence: 2, roundNumber: 1, roundPosition: 1 },
      { stage: QUALIFYING, stageSequence: 1, roundNumber: 2, roundPosition: 2 },
      { stage: CONSOLATION, stageSequence: 1, roundNumber: 1, roundPosition: 3 },
      { stage: MAIN, stageSequence: 1, roundNumber: 2, roundPosition: 1 },
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 2 },
    ];

    matchUps.sort(matchUpSort);

    // Should be: QUALIFYING, then MAIN (seq 1, round 1), then MAIN (seq 1, round 2), etc.
    expect(matchUps[0].stage).toBe(QUALIFYING);
    expect(matchUps[1].stage).toBe(MAIN);
    expect(matchUps[1].stageSequence).toBe(1);
    expect(matchUps[1].roundNumber).toBe(1);
  });

  it('returns 0 for identical matchUps', () => {
    const matchUp = { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 1 };

    expect(matchUpSort(matchUp, matchUp)).toBe(0);
  });

  it('handles empty matchUp objects', () => {
    const matchUps = [{}, {}];

    matchUps.sort(matchUpSort);

    expect(matchUps).toHaveLength(2);
  });

  it('handles negative roundPosition', () => {
    const matchUps = [
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 1 },
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: -1 },
    ];

    matchUps.sort(matchUpSort);

    expect(matchUps[0].roundPosition).toBe(-1);
    expect(matchUps[1].roundPosition).toBe(1);
  });

  it('handles zero values', () => {
    const matchUps = [
      { stage: MAIN, stageSequence: 1, roundNumber: 1, roundPosition: 0 },
      { stage: MAIN, stageSequence: 0, roundNumber: 0, roundPosition: 0 },
    ];

    matchUps.sort(matchUpSort);

    expect(matchUps[0].stageSequence).toBe(0);
    expect(matchUps[1].stageSequence).toBe(1);
  });
});
