import { expect, it } from 'vitest';
import { getSetComplement, getTiebreakComplement } from '@Query/matchUp/getComplement';

it('can generate appropriate highValue for standard sets', () => {
  setScoreTest({
    isSide1: true,
    lowValue: '3',
    setTo: 6,
    tiebreakAt: 6,
    expectation: [3, 6],
  });
  setScoreTest({
    isSide1: false,
    lowValue: '3',
    setTo: 6,
    tiebreakAt: 6,
    expectation: [6, 3],
  });
  setScoreTest({
    isSide1: true,
    lowValue: '3',
    setTo: 5,
    tiebreakAt: 4,
    expectation: [3, 5],
  });
  setScoreTest({
    isSide1: false,
    lowValue: '3',
    setTo: 5,
    tiebreakAt: 4,
    expectation: [5, 3],
  });
  setScoreTest({
    isSide1: true,
    lowValue: '4',
    setTo: 5,
    tiebreakAt: 4,
    expectation: [4, 5],
  });
  setScoreTest({
    isSide1: false,
    lowValue: '4',
    setTo: 5,
    tiebreakAt: 4,
    expectation: [5, 4],
  });
  setScoreTest({
    isSide1: true,
    lowValue: '5',
    setTo: 5,
    tiebreakAt: 4,
    expectation: [4, 5],
  });
  setScoreTest({
    isSide1: true,
    lowValue: '2',
    setTo: 8,
    tiebreakAt: 8,
    expectation: [2, 8],
  });
  setScoreTest({
    isSide1: true,
    lowValue: '8',
    setTo: 8,
    tiebreakAt: 8,
    expectation: [8, 9],
  });
  setScoreTest({
    isSide1: true,
    lowValue: '8',
    setTo: 8,
    tiebreakAt: 7,
    expectation: [7, 8],
  });
  setScoreTest({
    isSide1: true,
    lowValue: '7',
    setTo: 8,
    tiebreakAt: 7,
    expectation: [7, 8],
  });
});

it('correctly calculates high tiebreak values with Advantage', () => {
  tiebreakTest({
    isSide1: true,
    lowValue: '2',
    tiebreakTo: 7,
    expectation: [2, 7],
  });
  tiebreakTest({
    isSide1: false,
    lowValue: '2',
    tiebreakTo: 7,
    expectation: [7, 2],
  });
  tiebreakTest({
    isSide1: true,
    lowValue: '7',
    tiebreakTo: 7,
    expectation: [7, 9],
  });
  tiebreakTest({
    isSide1: false,
    lowValue: '7',
    tiebreakTo: 7,
    expectation: [9, 7],
  });
  tiebreakTest({
    isSide1: true,
    lowValue: '99',
    tiebreakTo: 7,
    expectation: [99, 101],
  });
  tiebreakTest({
    isSide1: false,
    lowValue: '99',
    tiebreakTo: 7,
    expectation: [101, 99],
  });
});

it('correctly calculates high tiebreak values with NOAD', () => {
  tiebreakTest({
    tiebreakNoAd: true,
    isSide1: true,
    lowValue: '2',
    tiebreakTo: 7,
    expectation: [2, 7],
  });
  tiebreakTest({
    tiebreakNoAd: true,
    isSide1: false,
    lowValue: '2',
    tiebreakTo: 7,
    expectation: [7, 2],
  });
  tiebreakTest({
    tiebreakNoAd: true,
    isSide1: true,
    lowValue: '5',
    tiebreakTo: 7,
    expectation: [5, 7],
  });
  tiebreakTest({
    tiebreakNoAd: true,
    isSide1: false,
    lowValue: '5',
    tiebreakTo: 7,
    expectation: [7, 5],
  });
  tiebreakTest({
    tiebreakNoAd: true,
    isSide1: true,
    lowValue: '7',
    tiebreakTo: 7,
    expectation: [6, 7],
  });
  tiebreakTest({
    tiebreakNoAd: true,
    isSide1: false,
    lowValue: '7',
    tiebreakTo: 7,
    expectation: [7, 6],
  });
  tiebreakTest({
    tiebreakNoAd: true,
    isSide1: true,
    lowValue: '99',
    tiebreakTo: 7,
    expectation: [6, 7],
  });
  tiebreakTest({
    tiebreakNoAd: true,
    isSide1: false,
    lowValue: '99',
    tiebreakTo: 7,
    expectation: [7, 6],
  });
});

it('computes high values for no-tiebreak WB1 sets (TYPTI win-by-1)', () => {
  // setTo=5, no tiebreak, winBy=1: first to 5 wins outright; complement is always 5
  setScoreTest({ isSide1: true, lowValue: '0', setTo: 5, winBy: 1, expectation: [0, 5] });
  setScoreTest({ isSide1: false, lowValue: '0', setTo: 5, winBy: 1, expectation: [5, 0] });
  setScoreTest({ isSide1: true, lowValue: '4', setTo: 5, winBy: 1, expectation: [4, 5] });
  setScoreTest({ isSide1: false, lowValue: '4', setTo: 5, winBy: 1, expectation: [5, 4] });
  setScoreTest({ isSide1: true, lowValue: '1', setTo: 5, winBy: 1, expectation: [1, 5] });
});

it('falls back to advantage (winBy 2) when winBy is omitted on a no-tiebreak set', () => {
  // setTo=5, no tiebreak, no winBy: default advantage set; low=4 → high=6 (lowValue + 2)
  setScoreTest({ isSide1: true, lowValue: '4', setTo: 5, expectation: [4, 6] });
});

function setScoreTest(input) {
  const result = getSetComplement({ ...input });
  expect(result).toEqual(input.expectation);
}

function tiebreakTest(input) {
  const result = getTiebreakComplement({ ...input });
  expect(result).toEqual(input.expectation);
}
