import { POLICY_RATINGS_FIFA_WOMEN } from '@Fixtures/policies/POLICY_RATINGS_FIFA_WOMEN';
import { expectedResult } from '@Generators/scales/ratingUpdate';
import { ratedResultOf } from '@Generators/scales/ratedResult';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// FIFA's women's ranking ("Women's ranking procedures", April 2023), against the document's own numbers

const WOMEN = POLICY_RATINGS_FIFA_WOMEN[POLICY_TYPE_RATINGS];
const SOCCER = 'HAL2A-S:T45';

function actualsOf(side1: number, side2: number) {
  const winningSide = side1 === side2 ? undefined : (side1 > side2 && 1) || 2;
  const matchUp: any = {
    score: {
      sets: [
        { setNumber: 1, side1Score: side1, side2Score: side2 },
        { setNumber: 2, side1Score: 0, side2Score: 0 },
      ],
    },
    matchUpStatus: COMPLETED,
    matchUpFormat: SOCCER,
    winningSide,
  };
  const result = ratedResultOf(matchUp, WOMEN);
  return [result?.winnerActual, result?.loserActual];
}

describe('the actual result table', () => {
  it.each([
    ['a 1-2 loss: the loser 16 %, the winner 84 %', 1, 2, [0.84, 0.16]],
    ['a 3-4 loss: the loser 18 %', 3, 4, [0.82, 0.18]],
    ['a 3-8 loss: the loser 3.8 %', 3, 8, [0.962, 0.038]],
    ['a 6-0 win: the loser 1 %', 6, 0, [0.99, 0.01]],
  ])('%s', (_, side1, side2, expected) => {
    // the winner is side 2 in the losses as listed; the rated winner comes first
    const [winnerActual, loserActual] = actualsOf(side1, side2);
    expect(winnerActual).toBeCloseTo(expected[0], 10);
    expect(loserActual).toBeCloseTo(expected[1], 10);
  });

  it.each([
    [0, 0.47],
    [1, 0.5],
    [3, 0.52],
    [7, 0.53],
  ])('a %s-all draw scores each side %s', (goals, value) => {
    expect(actualsOf(goals, goals)).toEqual([value, value]);
  });
});

it('reproduces the published expectation table: +100 64 %, +200 76 %, +300 85 %, −300 15 %', () => {
  expect(expectedResult(1600, 1500, WOMEN.expectation)).toBeCloseTo(0.64, 2);
  expect(expectedResult(1700, 1500, WOMEN.expectation)).toBeCloseTo(0.76, 2);
  expect(expectedResult(1800, 1500, WOMEN.expectation)).toBeCloseTo(0.85, 2);
  expect(expectedResult(1200, 1500, WOMEN.expectation)).toBeCloseTo(0.15, 2);
});

it('rates a 2-1 win at even strength: K 15 × (0.84 − 0.5) = 5.1', () => {
  const drawProfiles = [{ drawSize: 3, drawType: ROUND_ROBIN, matchUpFormat: SOCCER }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles });
  tournamentEngine.setState(tournamentRecord);
  const { matchUpId, drawId } = tournamentEngine.allTournamentMatchUps().matchUps[0];
  const sets = [
    { setNumber: 1, side1Score: 1, side2Score: 1 },
    { setNumber: 2, side1Score: 1, side2Score: 0 },
  ];
  const outcome = { matchUpStatus: COMPLETED, score: { sets }, winningSide: 1 };
  expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);
  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true });
  const ids = matchUp.sides.map((side) => side.participantId);
  const result: any = scaleEngine.generateDynamicRatings({ matchUpIds: [matchUpId], ratingsPolicy: WOMEN });
  expect(ids.map((id) => result.modifiedScaleValues[id].scaleValue)).toEqual([1505, 1495]);
});
