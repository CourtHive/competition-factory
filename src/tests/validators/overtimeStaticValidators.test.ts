import { validateMatchUpScore } from '@Scoring/analysis/validateMatchUpScore';
import { checkScoreCompleteness } from '@Scoring/analysis/scoreCompleteness';
import { retainScoreForFormat } from '@Query/matchUp/retainScoreForFormat';
import { formatCanEndTied } from '@Helpers/matchUpFormatCode/tiedFormat';
import { setPlayedAfterDecision } from '@Scoring/analysis/setCount';
import { validateScore } from '@Scoring/analysis/validateScore';
import { analyzeScore } from '@Scoring/analysis/analyzeScore';
import { expect, it } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

// The static score path agrees with the scoring engine on overtime formats (overtime activation S1).
const F1 = 'HAL2XA-S:T45P-O:2X/T15P-F:TB1';
const F2 = 'QTR4XA-S:T12P-O:U/T5P';
const F3 = 'PER3XA-S:T20P-O:USD/T20P';
const F5 = 'HAL2XA-S:T40P-O:1/T10P';

const t = (setNumber: number, side1Score: number, side2Score: number, winningSide?: number) => ({
  setNumber,
  side1Score,
  side2Score,
  ...(winningSide ? { winningSide } : {}),
});
const tb = (setNumber: number, side1TiebreakScore: number, side2TiebreakScore: number, winningSide: number) => ({
  setNumber,
  side1TiebreakScore,
  side2TiebreakScore,
  winningSide,
});

function verdicts(matchUpFormat: string, sets: any[], winningSide?: number) {
  const score = { sets };
  const matchUpStatus = COMPLETED;
  return {
    validateScore: !validateScore({ matchUpFormat, matchUpStatus, winningSide, score }).error,
    analyzeScore: analyzeScore({ matchUpFormat, matchUpStatus, winningSide, score }).valid,
    completeness: checkScoreCompleteness({ matchUpFormat, matchUpStatus, winningSide, sets }).isComplete,
    validateMatchUpScore: validateMatchUpScore(sets, matchUpFormat, matchUpStatus).isValid,
  };
}
const all = (value: boolean) => ({
  validateScore: value,
  analyzeScore: value,
  completeness: value,
  validateMatchUpScore: value,
});

it.each([
  {
    label: 'F1 decided by the decider after a scoreless block',
    f: F1,
    sets: [t(1, 1, 0, 1), t(2, 0, 1, 2), t(3, 0, 0), t(4, 0, 0), tb(5, 1, 0, 1)],
    w: 1,
  },
  { label: 'F1 decided in the block', f: F1, sets: [t(1, 1, 0, 1), t(2, 0, 1, 2), t(3, 1, 0, 1), t(4, 0, 0)], w: 1 },
  {
    label: 'F2 decided in OT2',
    f: F2,
    sets: [t(1, 25, 25), t(2, 25, 25), t(3, 25, 25), t(4, 25, 25), t(5, 10, 10), t(6, 12, 8, 1)],
    w: 1,
  },
  {
    label: 'F3 decided by a sudden-death goal',
    f: F3,
    sets: [t(1, 1, 0, 1), t(2, 0, 1, 2), t(3, 1, 1), t(4, 0, 0), t(5, 1, 0, 1)],
    w: 1,
  },
  { label: 'F5 level after its period', f: F5, sets: [t(1, 1, 0, 1), t(2, 0, 1, 2), t(3, 0, 0)], w: undefined },
])('every validator accepts: $label', ({ f, sets, w }) => {
  expect(verdicts(f, sets, w)).toEqual(all(true));
});

it.each([
  {
    label: 'F1 overtime after a decided regulation',
    f: F1,
    sets: [t(1, 1, 0, 1), t(2, 1, 0, 1), t(3, 1, 0, 1), t(4, 0, 0)],
    w: 1,
  },
  {
    label: 'F2 overtime after a decided regulation',
    f: F2,
    sets: [t(1, 25, 20, 1), t(2, 25, 25), t(3, 25, 25), t(4, 25, 20, 1), t(5, 5, 3, 1)],
    w: 1,
  },
  {
    label: 'F2 level and completed: unlimited overtime must produce a winner',
    f: F2,
    sets: [t(1, 25, 25), t(2, 25, 25), t(3, 25, 25), t(4, 25, 25)],
    w: undefined,
  },
  {
    label: 'F3 both sides scored in a sudden-death period',
    f: F3,
    sets: [t(1, 1, 0, 1), t(2, 0, 1, 2), t(3, 1, 1), t(4, 2, 1, 1)],
    w: 1,
  },
  { label: 'F5 level, completed without its period', f: F5, sets: [t(1, 1, 0, 1), t(2, 0, 1, 2)], w: undefined },
])('the completed-score validators refuse: $label', ({ f, sets, w }) => {
  const result = verdicts(f, sets, w);
  expect({ validateScore: result.validateScore, analyzeScore: result.analyzeScore }).toEqual({
    validateScore: false,
    analyzeScore: false,
  });
});

it('setPlayedAfterDecision names the set an overtime format could not have played', () => {
  const sets = [t(1, 1, 0, 1), t(2, 1, 0, 1), t(3, 1, 0, 1)];
  expect(setPlayedAfterDecision(sets, F1)).toMatch(/Set 3/);
  expect(setPlayedAfterDecision([t(1, 1, 0, 1), t(2, 0, 1, 2), t(3, 0, 0), t(4, 0, 0)], F1)).toBeUndefined();
});

it.each([
  { f: F1, canEndTied: false }, // a TB1 decider settles a level block
  { f: F2, canEndTied: false }, // unlimited overtime plays until a period ends unequal
  { f: F3, canEndTied: false }, // unlimited sudden death likewise
  { f: 'PER3XA-S:T20P-O:1SD/T5P-F:TB1', canEndTied: false },
  { f: F5, canEndTied: true }, // one period and no decider may finish level
])('formatCanEndTied($f) is $canEndTied', ({ f, canEndTied }) => {
  expect(formatCanEndTied(f)).toEqual(canEndTied);
});

it('retainScoreForFormat keeps every overtime set when the format does not change', () => {
  const sets = [t(1, 1, 0, 1), t(2, 0, 1, 2), t(3, 0, 0), t(4, 0, 0), tb(5, 1, 0, 1)];
  const retained = retainScoreForFormat({ sets, matchUpFormat: F1, previousMatchUpFormat: F1 });
  expect(retained.discarded).toEqual([]);
  expect(retained.sets.length).toEqual(5);
});

it('retainScoreForFormat keeps overtime sets under an equivalent overtime format', () => {
  const sets = [t(1, 25, 25), t(2, 25, 25), t(3, 25, 25), t(4, 25, 25), t(5, 10, 10), t(6, 12, 8, 1)];
  const retained = retainScoreForFormat({ sets, matchUpFormat: F2, previousMatchUpFormat: 'QTR4XA-S:T12P-O:U/T5P' });
  expect(retained.sets.length).toEqual(6);
});
