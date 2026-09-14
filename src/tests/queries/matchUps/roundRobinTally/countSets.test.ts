import { countSets } from '@Query/matchUps/roundRobinTally/scoreCounters';
import { expect, it } from 'vitest';

// constants and fixtures
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

it('can count normal sets', () => {
  const matchUp = {
    matchUpStatus: COMPLETED,
    matchUpFormat: FORMAT_STANDARD,
    score: {
      sets: [
        {
          side1Score: 6,
          side2Score: 1,
          side1TiebreakScore: undefined,
          side2TiebreakScore: undefined,
          winningSide: 1,
        },
        {
          side1Score: 6,
          side2Score: 1,
          side1TiebreakScore: undefined,
          side2TiebreakScore: undefined,
          winningSide: 1,
        },
      ],
    },
    winningSide: 1,
  };
  expect(countSets(matchUp)).toEqual([2, 0]);
});

it('can count tiebreak sets', () => {
  const matchUp = {
    matchUpStatus: COMPLETED,
    matchUpFormat: FORMAT_STANDARD,
    score: {
      sets: [
        {
          side1Score: 6,
          side2Score: 1,
          side1TiebreakScore: undefined,
          side2TiebreakScore: undefined,
          winningSide: 1,
        },
        {
          side1Score: 1,
          side2Score: 6,
          side1TiebreakScore: undefined,
          side2TiebreakScore: undefined,
          winningSide: 2,
        },
        {
          side1Score: undefined,
          side2Score: undefined,
          side1TiebreakScore: 10,
          side2TiebreakScore: 5,
          winningSide: 1,
        },
      ],
    },
    winningSide: 1,
  };
  expect(countSets(matchUp)).toEqual([2, 1]);
});
