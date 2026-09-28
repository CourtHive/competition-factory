import { getSetComplement, getTiebreakComplement, getMaxSetScore } from '@Query/matchUp/getComplement';
import { describe, expect, it } from 'vitest';

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

/**
 * `getMaxSetScore` — the largest games score a side can legally reach.
 *
 * Added for score-ENTRY interfaces, which must refuse a keystroke that cannot become a legal score. The
 * cases that matter most are the three where there is NO ceiling, because a consumer that assumes one
 * rejects legitimate scores: `courthive-components` hand-rolled this and returned 7 for a match tiebreak
 * to ten, which is live in its shipping scoring modal.
 */
describe('getMaxSetScore', () => {
  it('caps a standard set at setTo + 1, reachable only through the tiebreak', () => {
    // A set to six with a tiebreak at six can end 7-6 and no higher.
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 6 })).toBe(7);
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 6, opponentScore: 6 })).toBe(7);
  });

  it('tightens to setTo when the opponent cannot have forced a tiebreak', () => {
    // 7 is reachable only at six-all, so a side facing 3 tops out at 6. This is what lets an interface
    // refuse an impossible PAIR as it is typed rather than validating it afterwards.
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 6, opponentScore: 3 })).toBe(6);
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 6, opponentScore: 0 })).toBe(6);
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 6, opponentScore: 5 })).toBe(6);
  });

  it('caps at setTo when the tiebreak comes BELOW setTo', () => {
    // S:6/TB7@5 — the tiebreak at five-all settles it, so neither side passes six.
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 5 })).toBe(6);
    expect(getMaxSetScore({ setTo: 5, tiebreakAt: 4 })).toBe(5);
  });

  it('caps a no-ad tiebreak set at setTo, with no extra game', () => {
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 6, NoAD: true })).toBe(6);
  });

  it('caps a first-past-the-post set at setTo', () => {
    // No tiebreak and a one-game margin: whoever reaches setTo has won it.
    expect(getMaxSetScore({ setTo: 5, winBy: 1 })).toBe(5);
    expect(getMaxSetScore({ setTo: 4, winBy: 1 })).toBe(4);
  });

  // ── The three formats with NO ceiling ──

  it('returns undefined for a TIMED set, where games accumulate until the clock stops', () => {
    expect(getMaxSetScore({ timed: true })).toBeUndefined();
    // Even given a setTo, a timed set has no score ceiling.
    expect(getMaxSetScore({ timed: true, setTo: 6, tiebreakAt: 6 })).toBeUndefined();
  });

  it('returns undefined for an ADVANTAGE set, which can run to 24-22', () => {
    // No tiebreak and a two-game margin. 1968 Wimbledon reached 24-22, so any ceiling would be wrong.
    expect(getMaxSetScore({ setTo: 6 })).toBeUndefined();
    expect(getMaxSetScore({ setTo: 6, winBy: 2 })).toBeUndefined();
  });

  it('returns undefined for a TIEBREAK-ONLY set, which can end 12-10', () => {
    // The case the hand-rolled version got wrong: it read `setTo`, which such a format does not carry,
    // and capped a match tiebreak to ten at SEVEN.
    expect(getMaxSetScore({ tiebreakTo: 10 })).toBeUndefined();
    expect(getMaxSetScore({ tiebreakTo: 7 })).toBeUndefined();
  });

  it('returns undefined when it knows nothing about the format', () => {
    // Refusing to guess. A consumer handed a number here would clamp entry against an invented ceiling.
    expect(getMaxSetScore({})).toBeUndefined();
  });

  it('agrees with getSetComplement about the top of a standard set', () => {
    // The two answer neighbouring questions and must not disagree: the highest complement any low value
    // produces is the highest score the set can reach.
    const complements = [0, 1, 2, 3, 4, 5, 6]
      .map((lowValue) => getSetComplement({ lowValue, setTo: 6, tiebreakAt: 6, isSide1: true }))
      .filter((pair): pair is number[] => Array.isArray(pair))
      .map((pair) => pair[1]);

    expect(Math.max(...complements)).toBe(getMaxSetScore({ setTo: 6, tiebreakAt: 6 }));
  });
});
