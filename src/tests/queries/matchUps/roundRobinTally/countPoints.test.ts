import { countPoints } from '@Query/matchUps/roundRobinTally/scoreCounters';
import { expect, it } from 'vitest';

// constants and fixtures
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

it('can count games in normal sets', () => {
  let matchUp = {
    matchUpFormat: FORMAT_STANDARD,
    matchUpStatus: COMPLETED,
    score: {
      sets: [
        {
          side1TiebreakScore: 7,
          side2TiebreakScore: 3,
          winningSide: 1,
          side1Score: 7,
          side2Score: 6,
        },
        {
          side1TiebreakScore: 10,
          side2TiebreakScore: 8,
          winningSide: 1,
          side1Score: 7,
          side2Score: 6,
        },
      ],
    },
    winningSide: 1,
  };
  expect(countPoints(matchUp).pointsTally).toEqual([17, 11]);

  matchUp = {
    matchUpFormat: FORMAT_STANDARD,
    matchUpStatus: COMPLETED,
    score: {
      sets: [
        {
          side1TiebreakScore: 3,
          side2TiebreakScore: 7,
          winningSide: 2,
          side1Score: 6,
          side2Score: 7,
        },
        {
          side1TiebreakScore: 8,
          side2TiebreakScore: 10,
          winningSide: 2,
          side1Score: 6,
          side2Score: 7,
        },
      ],
    },
    winningSide: 2,
  };
  expect(countPoints(matchUp).pointsTally).toEqual([11, 17]);
});

it('can count games in tiebreak sets', () => {
  const matchUp = {
    matchUpFormat: FORMAT_STANDARD,
    matchUpStatus: COMPLETED,
    score: {
      sets: [
        {
          side1TiebreakScore: 7,
          side2TiebreakScore: 0,
          winningSide: 1,
          side1Score: 7,
          side2Score: 6,
        },
        {
          side1TiebreakScore: undefined,
          side2TiebreakScore: undefined,
          winningSide: 2,
          side1Score: 1,
          side2Score: 6,
        },
        {
          side1TiebreakScore: 10,
          side2TiebreakScore: 5,
          side1Score: undefined,
          side2Score: undefined,
          winningSide: 1,
        },
      ],
    },
    winningSide: 1,
  };
  expect(countPoints(matchUp).pointsTally).toEqual([17, 5]);
});
