/**
 * A set's winner must also win its tiebreak.
 *
 * `validateSetScore` reads a set as `winnerScore` / `loserScore` — the max and min of the games — so
 * which side held which never reached the tiebreak check, and a `7-6` whose set winner took 3 points
 * to the loser's 7 came back valid. Measured 2026-09-30 in both `validateSetScore` and
 * `validateMatchUpScore`, while `analyzeSet` given the winning side already refused it. The validators
 * and the analysis are now the same answer.
 *
 * Raised from `courthive-components`, whose score-entry card had to hand-check exactly this; with the
 * check here, that copy goes.
 */
import { validateMatchUpScore, validateSetScore } from '@Validators/validateMatchUpScore';
import { describe, it, expect } from 'vitest';

const FORMAT = 'SET3-S:6/TB7';

describe('the set winner must win the tiebreak', () => {
  it('refuses a 7-6 whose set winner holds the lower tiebreak points', () => {
    const reversed = { side1Score: 7, side2Score: 6, side1TiebreakScore: 3, side2TiebreakScore: 7 };

    let result: any = validateSetScore(reversed, FORMAT, false, false);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Set winner must win the tiebreak: side 1 won the set');

    // `allowIncomplete` forgives unfinished games, not a pair that contradicts them.
    result = validateSetScore(reversed, FORMAT, false, true);
    expect(result.isValid).toBe(false);

    // The other way round, so the check is not reading side 1 alone.
    result = validateSetScore({ side1Score: 6, side2Score: 7, side1TiebreakScore: 7, side2TiebreakScore: 4 }, FORMAT);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Set winner must win the tiebreak: side 2 won the set');
  });

  it('accepts the same points on the right sides', () => {
    expect(
      validateSetScore({ side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 3 }, FORMAT),
    ).toEqual({ isValid: true });
    expect(
      validateSetScore({ side1Score: 6, side2Score: 7, side1TiebreakScore: 4, side2TiebreakScore: 7 }, FORMAT),
    ).toEqual({ isValid: true });
  });

  it('leaves a tied pair to the margin check, whose message says what is actually wrong', () => {
    const result: any = validateSetScore(
      { side1Score: 7, side2Score: 6, side1TiebreakScore: 5, side2TiebreakScore: 5 },
      FORMAT,
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('must reach 7 points');
  });

  it('reaches a whole score through validateMatchUpScore', () => {
    const result: any = validateMatchUpScore(
      [{ setNumber: 1, side1Score: 7, side2Score: 6, side1TiebreakScore: 3, side2TiebreakScore: 7 }],
      FORMAT,
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Set winner must win the tiebreak');
  });
});
