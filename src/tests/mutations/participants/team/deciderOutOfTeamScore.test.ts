import { generateTieMatchUpScore } from '@Query/matchUp/tieMatchUpScore/generateTieMatchUpScore';
import { expect, it, describe } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { SINGLES } from '@Constants/matchUpTypes';

// a tieMatchUp's aggregate decider (set N + 1, or the decider after a finite overtime) settles that tieMatchUp and is
// not part of the team's score: scoreValue sums the sporting aggregate only (overtime S6 follow-up, Ruling 3)

const BOLTS_WITH_DECIDER = 'SET3XA-S:T10-F:TB1';
const SHOOTOUT_FORMAT = 'PER3XA-S:T20P-O:1SD/T5P-F:SO5';

function tieScore({ matchUpFormat, tieMatchUps }: { matchUpFormat: string; tieMatchUps: any[] }) {
  const tieFormat: any = {
    winCriteria: { aggregateValue: true },
    collectionDefinitions: [
      {
        collectionId: 'c1',
        collectionName: 'Singles',
        matchUpType: SINGLES,
        matchUpCount: tieMatchUps.length,
        matchUpFormat,
        scoreValue: 1,
      },
    ],
  };
  const matchUp: any = {
    matchUpId: 'team',
    tieMatchUps: tieMatchUps.map((tieMatchUp, index) => ({
      matchUpId: `t${index + 1}`,
      collectionId: 'c1',
      collectionPosition: index + 1,
      matchUpStatus: COMPLETED,
      ...tieMatchUp,
    })),
  };
  return generateTieMatchUpScore({ matchUp, tieFormat });
}

describe('a tieMatchUp decider is not part of the team score', () => {
  it("leaves a TB1 decider's point out of the sum", () => {
    const result = tieScore({
      matchUpFormat: BOLTS_WITH_DECIDER,
      tieMatchUps: [
        {
          winningSide: 2,
          score: {
            sets: [
              { setNumber: 1, side1Score: 20, side2Score: 21, winningSide: 2 },
              { setNumber: 2, side1Score: 21, side2Score: 20, winningSide: 1 },
              { setNumber: 3, side1Score: 15, side2Score: 15 },
              {
                setNumber: 4,
                side1Score: 0,
                side2Score: 0,
                side1TiebreakScore: 0,
                side2TiebreakScore: 1,
                winningSide: 2,
              },
            ],
          },
        },
        {
          winningSide: 1,
          score: {
            sets: [
              { setNumber: 1, side1Score: 21, side2Score: 20, winningSide: 1 },
              { setNumber: 2, side1Score: 20, side2Score: 20 },
              { setNumber: 3, side1Score: 20, side2Score: 20 },
            ],
          },
        },
      ],
    });

    // 56-56 and 61-60: the decider's point would have made it 117-117
    expect(result.set.side1Score).toEqual(117);
    expect(result.set.side2Score).toEqual(116);
    expect(result.winningSide).toEqual(1);
  });

  it("leaves a shootout's goals out of the sum after a finite overtime", () => {
    const result = tieScore({
      matchUpFormat: SHOOTOUT_FORMAT,
      tieMatchUps: [
        {
          winningSide: 2,
          score: {
            sets: [
              { setNumber: 1, side1Score: 1, side2Score: 0, winningSide: 1 },
              { setNumber: 2, side1Score: 0, side2Score: 1, winningSide: 2 },
              { setNumber: 3, side1Score: 1, side2Score: 1 },
              { setNumber: 4, side1Score: 0, side2Score: 0, segmentComplete: true },
              { setNumber: 5, side1Score: 3, side2Score: 4, winningSide: 2 },
            ],
          },
        },
      ],
    });

    expect([result.set.side1Score, result.set.side2Score]).toEqual([2, 2]);
  });

  it("reads the tieMatchUp's own format before the collection's", () => {
    const result = tieScore({
      matchUpFormat: 'SET3-S:6/TB7-F:TB10',
      tieMatchUps: [
        {
          matchUpFormat: BOLTS_WITH_DECIDER,
          winningSide: 1,
          score: {
            sets: [
              { setNumber: 1, side1Score: 10, side2Score: 12, winningSide: 2 },
              { setNumber: 2, side1Score: 12, side2Score: 10, winningSide: 1 },
              { setNumber: 3, side1Score: 11, side2Score: 11 },
              {
                setNumber: 4,
                side1Score: 0,
                side2Score: 0,
                side1TiebreakScore: 1,
                side2TiebreakScore: 0,
                winningSide: 1,
              },
            ],
          },
        },
      ],
    });

    expect([result.set.side1Score, result.set.side2Score]).toEqual([33, 33]);
  });

  it("still counts a tennis match tiebreak as one, since it is a deciding set and not an aggregate's decider", () => {
    const result = tieScore({
      matchUpFormat: 'SET3-S:6/TB7-F:TB10',
      tieMatchUps: [
        {
          winningSide: 1,
          score: {
            sets: [
              { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
              { setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2 },
              {
                setNumber: 3,
                side1Score: 0,
                side2Score: 0,
                side1TiebreakScore: 10,
                side2TiebreakScore: 7,
                winningSide: 1,
              },
            ],
          },
        },
      ],
    });

    expect([result.set.side1Score, result.set.side2Score]).toEqual([10, 10]);
  });
});
