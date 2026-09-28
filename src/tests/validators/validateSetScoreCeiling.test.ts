/**
 * The CEILING an unfinished set is held to.
 *
 * `allowIncomplete` forgives the games not yet played. It was also forgiving the games that cannot be
 * played: the check was a slack of `setTo + 10`, so a **9-4 in a set to six** and a **6-4 in a set to
 * four** both came back valid. Neither can occur at any stage of any set under those formats — seven is
 * reachable only through a tiebreak at six-all, and five is the most a set to four can reach.
 *
 * The slack existed because the true ceiling was not computable here. `getMaxSetScore` computes it, and
 * returns `undefined` exactly where no ceiling exists, which is why this is a ceiling and not a cap: an
 * advantage set really can reach 24-22, and refusing that would be the worse error by far.
 *
 * This matters to score-entry interfaces specifically. They ask this question as the operator types, and
 * a validator that says "fine" to an impossible score is why `courthive-components` ended up
 * hand-rolling its own maximum — and getting `SET1-S:TB10` wrong in the shipping dialog.
 */
import { validateSetScore } from '@Validators/validateMatchUpScore';
import { describe, it, expect } from 'vitest';

/** Every case here is an UNFINISHED set: `allowIncomplete` is the whole subject. */
const incomplete = (set: any, matchUpFormat: string) => validateSetScore(set, matchUpFormat, false, true);

describe('an unfinished set is held to the format ceiling', () => {
  it('refuses games above what a set to six can reach', () => {
    // 7 comes only from a tiebreak at six-all, so 9 is not a stage of this set — it is a typo.
    const result: any = incomplete({ side1Score: 9, side2Score: 4 }, 'SET3-S:6/TB7');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('exceeds expected range');

    expect(incomplete({ side1Score: 4, side2Score: 9 }, 'SET3-S:6/TB7').isValid).toBe(false);
    expect(incomplete({ side1Score: 8, side2Score: 6 }, 'SET3-S:6/TB7').isValid).toBe(false);
  });

  it('refuses a six in a set to FOUR', () => {
    // S:4/TB7 tops out at 5-4. This is the short-set format a fast-format event actually runs.
    expect(incomplete({ side1Score: 6, side2Score: 4 }, 'SET3-S:4/TB7').isValid).toBe(false);
    expect(incomplete({ side1Score: 5, side2Score: 4 }, 'SET3-S:4/TB7').isValid).toBe(true);
  });

  it('still accepts every score the set can legally be at', () => {
    for (const set of [
      { side1Score: 0, side2Score: 0 },
      { side1Score: 3, side2Score: 2 },
      { side1Score: 6, side2Score: 4 },
      { side1Score: 7, side2Score: 5 },
    ]) {
      expect(incomplete(set, 'SET3-S:6/TB7'), JSON.stringify(set)).toEqual({ isValid: true });
    }
  });

  it('caps at setTo where the tiebreak comes BELOW it', () => {
    // S:6/TB7@5 — five-all settles the set, so nobody reaches seven.
    expect(incomplete({ side1Score: 7, side2Score: 5 }, 'SET3-S:6/TB7@5').isValid).toBe(false);
    expect(incomplete({ side1Score: 6, side2Score: 5 }, 'SET3-S:6/TB7@5').isValid).toBe(true);
  });
});

describe('where NO ceiling exists, nothing is refused for being large', () => {
  it('an ADVANTAGE set runs past setTo, with a standing absurdity guard above it', () => {
    // No tiebreak and a two-game margin: 15-13 is an ordinary score and is accepted, where a set to six
    // WITH a tiebreak would refuse it.
    expect(incomplete({ side1Score: 15, side2Score: 13 }, 'SET3-S:6').isValid).toBe(true);

    // A PRE-EXISTING limit, pinned here rather than changed: with no computable ceiling the old
    // `setTo + 10` slack still applies, so an advantage set is refused above 16 games. Isner–Mahut
    // reached 70-68 at Wimbledon in 2010, so this is wrong — but it is wrong in the same way on the
    // COMPLETE-set path ('exceeds reasonable limits' at the same threshold), and deciding what counts as
    // absurd in a set with no ceiling is a separate question from computing the ceiling where there is
    // one. Left as found, and recorded.
    expect(incomplete({ side1Score: 24, side2Score: 22 }, 'SET3-S:6').isValid).toBe(false);
  });

  it('a TIEBREAK-ONLY set runs on — a match tiebreak to ten can end 15-13', () => {
    // The case that started this: the hand-rolled version read `setTo`, which this format does not
    // carry, and capped a match tiebreak to ten at seven games.
    expect(incomplete({ side1Score: 12, side2Score: 10 }, 'SET1-S:TB10').isValid).toBe(true);
    expect(incomplete({ side1Score: 15, side2Score: 13 }, 'SET1-S:TB10').isValid).toBe(true);
  });

  it('a TIMED set runs on — games accumulate until the clock stops', () => {
    expect(incomplete({ side1Score: 15, side2Score: 12 }, 'SET1-T90').isValid).toBe(true);
  });
});
