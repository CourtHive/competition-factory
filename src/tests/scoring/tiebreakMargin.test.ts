import { tiebreakMargin } from '@Tools/scoring/scoringUtilities';
import { describe, expect, it } from 'vitest';

// One rule for the margin a tiebreak is won by, read by scoring, points-to, score entry, the complement
// and the validators (CA 2026-10-17: a one-point tiebreak is sudden death).
describe('tiebreakMargin', () => {
  it('is two for an ordinary tiebreak, one when no-ad, and one when the target itself is one', () => {
    expect(tiebreakMargin(7)).toEqual(2);
    expect(tiebreakMargin(10, false)).toEqual(2);
    expect(tiebreakMargin(7, true)).toEqual(1);
    expect(tiebreakMargin(1)).toEqual(1);
  });

  it('is two when the target is not known', () => {
    expect(tiebreakMargin(undefined)).toEqual(2);
    expect(tiebreakMargin(undefined, true)).toEqual(1);
  });
});
