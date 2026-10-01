import { checkSetIsComplete } from '@Query/matchUp/checkSetIsComplete';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import { describe, expect, it } from 'vitest';

/**
 * Two defects found while settling set-level NOAD (#5076), both reproducing with or without the token,
 * fixed on CA's instruction 2026-10-02.
 */
const won = (side1Score: number, side2Score: number, extra: Record<string, number> = {}) => ({
  setNumber: 1,
  side1Score,
  side2Score,
  winningSide: side1Score > side2Score ? 1 : 2,
  ...extra,
});

describe('an advantage set is complete by two clear games, however far it runs', () => {
  const ADVANTAGE = 'SET1-S:6';

  it('8-6 and 24-22 are finished; 7-6 and 6-5 are not', () => {
    expect(checkSetIsComplete({ set: won(8, 6), matchUpFormat: ADVANTAGE })).toBe(true);
    expect(checkSetIsComplete({ set: won(24, 22), matchUpFormat: ADVANTAGE })).toBe(true);
    expect(checkSetIsComplete({ set: won(7, 5), matchUpFormat: ADVANTAGE })).toBe(true);
    expect(checkSetIsComplete({ set: won(7, 6), matchUpFormat: ADVANTAGE })).toBe(false);
    expect(checkSetIsComplete({ set: won(6, 5), matchUpFormat: ADVANTAGE })).toBe(false);
  });

  it('the same with no-ad games, which change nothing about the set', () => {
    expect(checkSetIsComplete({ set: won(8, 6), matchUpFormat: 'SET1-S:6NOAD' })).toBe(true);
    expect(checkSetIsComplete({ set: won(7, 6), matchUpFormat: 'SET1-S:6NOAD' })).toBe(false);
  });

  it('a hand-built format with no tiebreak fields is read as the advantage set it declares', () => {
    expect(checkSetIsComplete({ set: won(8, 6), matchUpScoringFormat: { setFormat: { setTo: 6 } } })).toBe(true);
  });

  it('a set WITH a tiebreak still wants it at six-all — the control', () => {
    expect(checkSetIsComplete({ set: won(8, 6), matchUpFormat: 'SET3-S:6/TB7' })).toBe(false);
    expect(checkSetIsComplete({ set: won(7, 6), matchUpFormat: 'SET3-S:6/TB7' })).toBe(false);
    expect(
      checkSetIsComplete({
        set: won(7, 6, { side1TiebreakScore: 7, side2TiebreakScore: 3 }),
        matchUpFormat: 'SET3-S:6/TB7',
      }),
    ).toBe(true);
  });
});

describe('7-5 is a valid set outcome under a tiebreak at six-all', () => {
  it('analyzeSet accepts 7-5 and 5-7 under SET3-S:6/TB7, with the winner it already named', () => {
    const matchUpScoringFormat = parse('SET3-S:6/TB7');
    const sevenFive = analyzeSet({ setObject: won(7, 5), matchUpScoringFormat });
    expect(sevenFive.isValidSetOutcome).toBe(true);
    expect(sevenFive.isValidSet).toBe(true);
    expect(sevenFive.winningSide).toBe(1);

    const fiveSeven = analyzeSet({ setObject: won(5, 7), matchUpScoringFormat });
    expect(fiveSeven.isValidSetOutcome).toBe(true);
    expect(fiveSeven.winningSide).toBe(2);
  });

  it('and under no-ad games, and in a pro set to eight', () => {
    expect(
      analyzeSet({ setObject: won(7, 5), matchUpScoringFormat: parse('SET3-S:6NOAD/TB7') }).isValidSetOutcome,
    ).toBe(true);
    expect(analyzeSet({ setObject: won(9, 7), matchUpScoringFormat: parse('SET1-S:8/TB7') }).isValidSetOutcome).toBe(
      true,
    );
  });

  it('7-3 and 8-3 are still (2), and 7-5 under a tiebreak at FIVE-all is still refused — the controls', () => {
    const atSix = parse('SET3-S:6/TB7');
    expect(analyzeSet({ setObject: won(7, 3), matchUpScoringFormat: atSix }).standardSetError?.message).toBe(
      'invalid winning game scoreString (2)',
    );
    expect(analyzeSet({ setObject: won(8, 3), matchUpScoringFormat: atSix }).isValidSetOutcome).toBe(false);
    // under @5, five-all is already the tiebreak, so 7-5 cannot happen
    expect(analyzeSet({ setObject: won(7, 5), matchUpScoringFormat: parse('SET3-S:6/TB7@5') }).isValidSetOutcome).toBe(
      false,
    );
  });
});
