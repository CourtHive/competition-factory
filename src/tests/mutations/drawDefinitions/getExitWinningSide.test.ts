/**
 * Unit coverage for the BYE guard added to getExitWinningSide. The guard is
 * defensive (current callers strip BYE positions before calling), so it is
 * exercised directly here to pin the "never resolve a BYE position as the
 * winning side" contract.
 */
import { getExitWinningSide } from '@Mutate/drawDefinitions/matchUpGovernor/getExitWinningSide';
import { expect, it, describe } from 'vitest';

describe('getExitWinningSide — BYE guard', () => {
  it('returns undefined when the target drawPosition is a BYE side', () => {
    const matchUpId = 'm1';
    const inContextDrawMatchUps: any[] = [
      {
        matchUpId,
        feedRound: true, // would otherwise return 1; the BYE guard must win
        drawPositions: [3, 4],
        sides: [
          { sideNumber: 1, drawPosition: 3, participantId: 'p3' },
          { sideNumber: 2, drawPosition: 4, bye: true },
        ],
      },
    ];
    expect(getExitWinningSide({ inContextDrawMatchUps, drawPosition: 4, matchUpId })).toBeUndefined();
  });

  it('resolves a real (non-BYE) feed-round position to side 1 — guard is a no-op', () => {
    const matchUpId = 'm1';
    const inContextDrawMatchUps: any[] = [
      {
        matchUpId,
        feedRound: true,
        drawPositions: [3, 4],
        sides: [
          { sideNumber: 1, drawPosition: 3, participantId: 'p3' },
          { sideNumber: 2, drawPosition: 4, participantId: 'p4' },
        ],
      },
    ];
    expect(getExitWinningSide({ inContextDrawMatchUps, drawPosition: 3, matchUpId })).toEqual(1);
  });
});
