import { analyzeRotatingPartnerScore } from '@Query/matchUp/rotatingPartnerScore';
import { expect, it } from 'vitest';

// constants and types
import type { RotatingPartnerScoreContract } from '@Types/rotatingPartnerScoring';

const exact: RotatingPartnerScoreContract = { combinedPointTotal: 32, tieResolution: 'ALLOW' };

it.each([
  [15, 15, true, false, undefined],
  [17, 15, true, true, 1],
  [15, 17, true, true, 2],
  [16, 16, true, true, undefined],
  [17, 16, false, false, undefined],
  [-1, 33, false, false, undefined],
  [16.5, 15.5, false, false, undefined],
  [Number.NaN, 16, false, false, undefined],
])('analyzes exact totals %s–%s', (side1Points, side2Points, valid, complete, winningSide) => {
  const result = analyzeRotatingPartnerScore({ side1Points, side2Points, contract: exact });
  expect(result.valid).toBe(valid);
  expect(result.complete).toBe(complete);
  expect(result.winningSide).toBe(winningSide);
});

it.each([
  ['DECIDING_POINT', undefined, 16, 16, true, false],
  ['DECIDING_POINT', undefined, 17, 16, true, true],
  ['DECIDING_POINT', undefined, 18, 16, false, false],
  ['DECIDING_POINT', undefined, 18, 15, false, false],
  ['WIN_BY_MARGIN', 2, 17, 16, true, false],
  ['WIN_BY_MARGIN', 2, 18, 16, true, true],
  ['WIN_BY_MARGIN', 2, 19, 16, false, false],
  ['WIN_BY_MARGIN', 2, 21, 19, true, true],
  ['WIN_BY_MARGIN', 2, 20, 20, true, false],
  ['WIN_BY_MARGIN', 1, 16, 16, false, false],
] as const)(
  'enforces %s overtime (%s): %s–%s',
  (tieResolution, winningMargin, side1Points, side2Points, valid, complete) => {
    const contract = { combinedPointTotal: 32, tieResolution, winningMargin };
    expect(analyzeRotatingPartnerScore({ side1Points, side2Points, contract })).toMatchObject({ valid, complete });
  },
);

it('allows an odd total but refuses overtime after it', () => {
  const contract: RotatingPartnerScoreContract = { combinedPointTotal: 31, tieResolution: 'DECIDING_POINT' };
  expect(analyzeRotatingPartnerScore({ side1Points: 16, side2Points: 15, contract }).complete).toBe(true);
  expect(analyzeRotatingPartnerScore({ side1Points: 16, side2Points: 16, contract }).valid).toBe(false);
});

it('marks an exact draw explicitly without a winner', () => {
  expect(analyzeRotatingPartnerScore({ side1Points: 16, side2Points: 16, contract: exact })).toEqual({
    valid: true,
    complete: true,
    tied: true,
  });
});
