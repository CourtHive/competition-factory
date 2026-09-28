import { checkSetIsComplete } from '@Query/matchUp/checkSetIsComplete';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { describe, expect, it } from 'vitest';

it('properly determines when sets are complete', () => {
  let matchUpFormat = 'SET3-S:4/TB7-F:TB7';
  let params: any = {
    matchUpFormat,
    set: {
      side1Score: 4,
      side2Score: 3,
    },
  };
  let result = checkSetIsComplete(params);
  expect(result).toEqual(false);

  matchUpFormat = 'SET3-S:4NOAD-F:TB7';
  params = {
    matchUpFormat,
    set: {
      side1Score: 4,
      side2Score: 3,
    },
  };
  result = checkSetIsComplete(params);
  expect(result).toEqual(true);
});

/**
 * A declared win margin — `WB1` — was ignored.
 *
 * `NoAD` and a tiebreak both force a one-game margin and were already handled. A format that DECLARES its
 * margin was not: `parse('SET1-S:5WB1')` emits `{setTo: 5, noTiebreak: true, winBy: 1}` with no `NoAD`, so
 * a 5-4 fell through to a two-game margin and came back incomplete — though first-to-five wins that set.
 *
 * `SET1-S:5NOAD` worked throughout, which is what made this easy to miss: the two formats express the same
 * rule under different keys, and only one of them was being read.
 *
 * Found 2026-09-27 while courthive-components was moved off its hand-rolled copies of this logic, which
 * disagreed with the engine here and were right.
 */
describe('a declared win margin (WB1)', () => {
  it('completes a 5-4 in SET1-S:5WB1, where first-to-five wins', () => {
    expect(checkSetIsComplete({ matchUpFormat: 'SET1-S:5WB1', set: { side1Score: 5, side2Score: 4 } })).toBe(true);
    expect(checkSetIsComplete({ matchUpFormat: 'SET1-S:5WB1', set: { side1Score: 4, side2Score: 5 } })).toBe(true);
  });

  it('completes a 4-3 in SET3-S:4WB1', () => {
    expect(checkSetIsComplete({ matchUpFormat: 'SET3-S:4WB1', set: { side1Score: 4, side2Score: 3 } })).toBe(true);
  });

  it('still refuses a set nobody has won', () => {
    // The margin being one does not make every score complete: neither side has reached `setTo`.
    expect(checkSetIsComplete({ matchUpFormat: 'SET1-S:5WB1', set: { side1Score: 4, side2Score: 3 } })).toBe(false);
    expect(checkSetIsComplete({ matchUpFormat: 'SET1-S:5WB1', set: { side1Score: 0, side2Score: 0 } })).toBe(false);
  });

  it('leaves a two-game margin alone where none is declared', () => {
    // The regression this fix could plausibly cause. `SET3-S:6/TB7` declares no `winBy`, so a 6-5 is still
    // incomplete and a 6-4 still complete.
    expect(checkSetIsComplete({ matchUpFormat: 'SET3-S:6/TB7', set: { side1Score: 6, side2Score: 5 } })).toBe(false);
    expect(checkSetIsComplete({ matchUpFormat: 'SET3-S:6/TB7', set: { side1Score: 6, side2Score: 4 } })).toBe(true);
  });

  it('agrees with NOAD, which expresses the same rule under a different key', () => {
    const wb1 = checkSetIsComplete({ matchUpFormat: 'SET1-S:5WB1', set: { side1Score: 5, side2Score: 4 } });
    const noad = checkSetIsComplete({ matchUpFormat: 'SET1-S:5NOAD', set: { side1Score: 5, side2Score: 4 } });

    expect(wb1).toBe(noad);
  });
});

/**
 * The same root cause, reaching `analyzeSet`.
 *
 * `getSetWinningSide` delegates to `checkSetIsComplete`, so the ignored margin produced a second wrong
 * answer: `analyzeSet` reported no winner for a 5-4 in a win-by-one set. One fix, two symptoms — asserted
 * separately because a future change could plausibly repair one and not the other.
 */
describe('a declared win margin reaches analyzeSet', () => {
  it('names the winner of a 5-4 in SET1-S:5WB1', () => {
    const matchUpScoringFormat = parse('SET1-S:5WB1');
    const analysis = analyzeSet({
      setObject: { setNumber: 1, side1Score: 5, side2Score: 4 },
      matchUpScoringFormat,
    });

    expect(analysis.winningSide).toBe(1);
  });

  it('and of the other side', () => {
    const matchUpScoringFormat = parse('SET1-S:5WB1');
    const analysis = analyzeSet({
      setObject: { setNumber: 1, side1Score: 4, side2Score: 5 },
      matchUpScoringFormat,
    });

    expect(analysis.winningSide).toBe(2);
  });
});
