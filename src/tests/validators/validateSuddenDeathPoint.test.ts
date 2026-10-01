/**
 * A tiebreak to ONE is won 1-0, and the validator must say so.
 *
 * `SET3XA-S:T10-F:TB1` is an aggregate timed format whose tie is settled by a single sudden-death
 * point. Strict `validateSetScore` required that point to be won by two — "Tiebreak-only set must be
 * won by at least 2 points, got 1-0" — which no score of that set can satisfy, while
 * `checkSetIsComplete` had accepted it since #5049 by capping the margin at the target. Measured
 * 2026-09-30 from `courthive-components`, left out of #5049 and fixed here: the margin is now capped
 * the same way, so the validator and the analysis agree.
 */
import { checkSetIsComplete } from '@Query/matchUp/checkSetIsComplete';
import { validateSetScore } from '@Validators/validateMatchUpScore';
import { describe, it, expect } from 'vitest';

const SUDDEN_DEATH = 'SET3XA-S:T10-F:TB1';
/** The deciding set of that format, validated STRICTLY: `isDecidingSet` true, `allowIncomplete` false. */
const decider = (side1TiebreakScore: number, side2TiebreakScore: number) =>
  validateSetScore({ side1TiebreakScore, side2TiebreakScore }, SUDDEN_DEATH, true, false);

describe('a sudden-death point validates', () => {
  it('accepts 1-0 and 0-1, the only scores the point can have', () => {
    expect(decider(1, 0)).toEqual({ isValid: true });
    expect(decider(0, 1)).toEqual({ isValid: true });
  });

  it('still refuses a point nobody has won', () => {
    let result: any = decider(0, 0);
    expect(result.isValid).toBe(false);

    result = decider(1, 1);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('must be won by at least 1 point');
  });

  it('agrees with checkSetIsComplete', () => {
    expect(
      checkSetIsComplete({
        matchUpFormat: SUDDEN_DEATH,
        isDecidingSet: true,
        isTiebreakSet: true,
        set: { side1TiebreakScore: 1, side2TiebreakScore: 0 },
      }),
    ).toBe(true);
  });

  it('changes nothing for a tiebreak to ten — the control', () => {
    const ten = (a: number, b: number) =>
      validateSetScore({ side1TiebreakScore: a, side2TiebreakScore: b }, 'SET1-S:TB10');
    expect(ten(10, 8)).toEqual({ isValid: true });
    expect(ten(10, 9).isValid).toBe(false);
    expect(ten(12, 10)).toEqual({ isValid: true });
    expect(ten(12, 9).isValid).toBe(false);
  });
});
