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

/**
 * A drawPosition is a number in ONE structure. A non-feed target can be fed from ANOTHER structure —
 * `winnerMatchUpId`/`loserMatchUpId` point across links — and there the feeder's numbers mean nothing.
 * COMPASS-shaped: West r1p1 holds West 1 and 2, fed by the LOSERS of East r1p1 (East 1, 2) and East
 * r1p2 (East 3, 4). West 2 holds East r1p2's loser, so it is side 2; matched by number, East r1p1
 * "contains 2" and the answer was side 1. No generated draw reaches this branch today — latent.
 */
describe('getExitWinningSide — a feeder in another structure is matched by participant, not number', () => {
  const matchUpId = 'west-1-1';
  const inContextDrawMatchUps: any[] = [
    {
      matchUpId: 'east-1-1',
      structureId: 'east',
      roundPosition: 1,
      loserMatchUpId: matchUpId,
      drawPositions: [1, 2],
      sides: [
        { sideNumber: 1, drawPosition: 1, participantId: 'eastWinner1' },
        { sideNumber: 2, drawPosition: 2, participantId: 'eastLoser1' },
      ],
    },
    {
      matchUpId: 'east-1-2',
      structureId: 'east',
      roundPosition: 2,
      loserMatchUpId: matchUpId,
      drawPositions: [3, 4],
      sides: [
        { sideNumber: 1, drawPosition: 3, participantId: 'eastWinner2' },
        { sideNumber: 2, drawPosition: 4, participantId: 'eastLoser2' },
      ],
    },
    {
      matchUpId,
      structureId: 'west',
      drawPositions: [1, 2],
      sides: [
        { sideNumber: 1, drawPosition: 1, participantId: 'eastLoser1' },
        { sideNumber: 2, drawPosition: 2, participantId: 'eastLoser2' },
      ],
    },
  ];

  it('West 2 arrived from East r1p2, so it is side 2', () => {
    expect(getExitWinningSide({ inContextDrawMatchUps, drawPosition: 2, matchUpId })).toEqual(2);
  });

  it('West 1 arrived from East r1p1, so it is side 1', () => {
    expect(getExitWinningSide({ inContextDrawMatchUps, drawPosition: 1, matchUpId })).toEqual(1);
  });
});
