import { getSetComplement, getTiebreakComplement } from '@Query/matchUp/getComplement';
import { expect, it } from 'vitest';

/**
 * THE EDGES OF THE COMPLEMENT FUNCTIONS, which a score-entry interface reaches on every keystroke.
 *
 * Both are called with whatever has been typed so far, including nothing and including too much.
 */

it('answers false, not a score, when nothing has been entered', () => {
  expect(getSetComplement({ setTo: 6, tiebreakAt: 6 })).toEqual(false);
  expect(getTiebreakComplement({ tiebreakTo: 7 })).toEqual(false);
});

it('reads only the first two digits of a value that has run on', () => {
  // `124` is read as 12: an advantage set to six, so the other side has 14
  expect(getSetComplement({ setTo: 6, lowValue: 124, isSide1: true })).toEqual([12, 14]);
  expect(getSetComplement({ setTo: 6, lowValue: '124', isSide1: false })).toEqual([14, 12]);
  // `124` is read as 12: a tiebreak to seven won by two
  expect(getTiebreakComplement({ tiebreakTo: 7, lowValue: 124, isSide1: true })).toEqual([12, 14]);
});

it('completes to setTo when the format is won by one and has no tiebreak', () => {
  expect(getSetComplement({ setTo: 5, winBy: 1, lowValue: 0, isSide1: true })).toEqual([0, 5]);
  expect(getSetComplement({ setTo: 5, winBy: 1, lowValue: 4, isSide1: false })).toEqual([5, 4]);
});
