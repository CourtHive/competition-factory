import { analyzeScore } from '@Query/matchUp/analyzeScore';
import { validateScore } from '@Validators/validateScore';
import mocksEngine from '@Assemblies/engines/mock';
import { it, test, expect } from 'vitest';

// fixtures and types
import { MISSING_MATCHUP_FORMAT } from '@Constants/errorConditionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { Score } from '@Types/tournamentTypes';

// ruling X1 (2026-10-02): no matchUpFormat, no score
// prettier-ignore
const scenarios = [
  { score: { sets: [], scoreStringSide1: '', scoreStringSide2: '' }, valid: true },
  { score: { sets: [], scoreStringSide1: {}, scoreStringSide2: '' }, valid: false },
  { score: { sets: [], scoreStringSide1: '', scoreStringSide2: {} }, valid: false },
  { score: { sets: '', scoreStringSide1: '', scoreStringSide2: '' }, valid: false },
  { score: { sets: [{ side1Score: 5, side2Score: 4 }], scoreStringSide1: '5-4', scoreStringSide2: '4-5' }, valid: false, error: MISSING_MATCHUP_FORMAT },
  { score: { sets: [{ side1Score: 4, side2Score: 5 }], scoreStringSide1: '4-5', scoreStringSide2: '5-4' }, valid: false, error: MISSING_MATCHUP_FORMAT },
  { score: { sets: [{ side1Score: 9, side2Score: 5 }], scoreStringSide1: '9-5', scoreStringSide2: '5-9' }, valid: false, error: MISSING_MATCHUP_FORMAT },
  { score: { sets: [{ side1Score: 9, side2Score: 5 }], scoreStringSide1: '9-5', scoreStringSide2: '5-9' }, valid: false, matchUpFormat: FORMAT_STANDARD },
  { score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 2 }], scoreStringSide1: '', scoreStringSide2: '' }, valid: false },
  { score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1 }], scoreStringSide1: '', scoreStringSide2: '' }, valid: false },
  { score: { sets: [{ side1Score: 6, winningSide: 1 }], scoreStringSide1: '', scoreStringSide2: '' }, winningSide: 1, valid: false },
  { score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1 }], scoreStringSide1: '', scoreStringSide2: '' }, winningSide: 1, valid: true, matchUpFormat: 'SET1-S:6/TB7' },
  { score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1 }], scoreStringSide1: '', scoreStringSide2: '' }, winningSide: 2, valid: false },
];

test.each(scenarios)(
  'can recognize invalid scores in setMatchUpStatus',
  // ({ winningSide, score, matchUpFormat, valid }) => {
  (scenario) => {
    const score = scenario.score as Score;
    const matchUpFormat = scenario.matchUpFormat as string;
    const winningSide = scenario.winningSide as number;
    const result = validateScore({ score, matchUpFormat, winningSide });
    if (scenario.valid) {
      expect(result.valid).toEqual(true);
    } else {
      expect(result.error).not.toBeUndefined();
      if (scenario.error) expect(result.error).toEqual(scenario.error);
    }
  },
);

it('recognizes no AD sets with no tiebreak as valid', () => {
  const score = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 1-6 10-8',
  }).outcome.score as Score;

  let result = analyzeScore({
    matchUpFormat: FORMAT_STANDARD,
    winningSide: 1,
    score,
  });
  expect(result.valid).toEqual(false);

  result = analyzeScore({
    matchUpFormat: 'SET3-S:6/TB7-F:6',
    winningSide: 1,
    score,
  });
  expect(result.valid).toEqual(true);
});

it('recognizes NOAD tiebreak formats', () => {
  const score = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 1-6 7-6(6)',
  }).outcome.score;

  let result = analyzeScore({
    matchUpFormat: FORMAT_STANDARD,
    winningSide: 1,
    score,
  });
  expect(result.valid).toEqual(true);

  result = analyzeScore({
    matchUpFormat: 'SET3-S:6/TB7NOAD',
    winningSide: 1,
    score,
  });
  expect(result.valid).toEqual(false);
});

it('recognizes invalid tiebreak scores', () => {
  let score = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-6(6)',
  }).outcome.score;

  let result = analyzeScore({
    matchUpFormat: 'SET1-S:6/TB7',
    winningSide: 1,
    score,
  });
  expect(result.valid).toEqual(true);

  result = analyzeScore({
    matchUpFormat: 'SET1-S:6/TB7NOAD',
    winningSide: 1,
    score,
  });
  expect(result.valid).toEqual(false);

  score = {
    scoreStringSide1: '7-6(2)',
    scoreStringSide2: '6-7(2)',
    sets: [
      {
        side1Score: 7,
        side2Score: 6,
        side1TiebreakScore: 4,
        side2TiebreakScore: 2,
        winningSide: 1,
        setNumber: 1,
      },
    ],
  };
  result = analyzeScore({
    matchUpFormat: 'SET1-S:6/TB7',
    winningSide: 1,
    score,
  });
  expect(result.valid).toEqual(false);
});
