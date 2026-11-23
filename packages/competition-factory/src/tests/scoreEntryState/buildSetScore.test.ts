/**
 * `buildSetScore` derives the winner's tiebreak points from the loser's with the factory's `getTiebreakComplement`,
 * the same rule a keystroke uses (`typeDigit` with `complement`). It used to restate that rule by hand, with a TB7
 * default; the two agreed on every legal score and disagreed on the impossible ones pinned last below.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSetScore,
  createScoreEntryModel,
  matchUpConfigFor,
  toFactorySet,
  typeDigit,
  setCell,
} from '../../scoreEntryState';

// constants and types
import type { CellRef } from '../../scoreEntryState';

const G = (setIndex: number, side: 1 | 2): CellRef => ({ setIndex, side, kind: 'games' });
const TB = (setIndex: number, side: 1 | 2): CellRef => ({ setIndex, side, kind: 'tiebreak' });

const tiebreaks = (matchUpFormat: string, side1: string, side2: string, low: string) => {
  const { side1TiebreakScore, side2TiebreakScore } = buildSetScore(
    0,
    side1,
    side2,
    low,
    matchUpConfigFor(matchUpFormat),
  );
  return [side1TiebreakScore, side2TiebreakScore];
};

describe('buildSetScore derives the tiebreak winner from the loser with the factory complement', () => {
  it('to the target, then by two past it, on the side that won the games', () => {
    expect(tiebreaks('SET3-S:6/TB7', '7', '6', '3')).toEqual([7, 3]);
    expect(tiebreaks('SET3-S:6/TB7', '6', '7', '3')).toEqual([3, 7]);
    expect(tiebreaks('SET3-S:6/TB7', '7', '6', '6')).toEqual([8, 6]);
    expect(tiebreaks('SET3-S:6/TB7', '7', '6', '12')).toEqual([14, 12]);
    expect(tiebreaks('SET3-S:6/TB10', '7', '6', '10')).toEqual([12, 10]);
    expect(tiebreaks('SET3-S:6/TB7NOAD', '7', '6', '6')).toEqual([7, 6]);
  });

  it('the set winner comes with it', () => {
    expect(buildSetScore(0, '6', '7', '5', matchUpConfigFor('SET3-S:6/TB7'))).toEqual({
      setNumber: 1,
      side1Score: 6,
      side2Score: 7,
      side1TiebreakScore: 5,
      side2TiebreakScore: 7,
      winningSide: 2,
    });
  });

  it('agrees with a keystroke: the loser typing their points derives the same pair', () => {
    for (const [matchUpFormat, low] of [
      ['SET3-S:6/TB7', 4],
      ['SET3-S:6/TB7', 9],
      ['SET3-S:6/TB10', 13],
      ['SET3-S:6/TB7NOAD', 5],
    ] as const) {
      let model = createScoreEntryModel({ matchUpFormat });
      model = setCell(setCell(model, G(0, 1), 7), G(0, 2), 6);
      for (const digit of String(low))
        model = typeDigit(model, { cell: TB(0, 2), digit: Number(digit), complement: true });
      const keyed = toFactorySet(model.sets[0], 0, matchUpConfigFor(matchUpFormat));

      expect(tiebreaks(matchUpFormat, '7', '6', String(low))).toEqual([
        keyed.side1TiebreakScore,
        keyed.side2TiebreakScore,
      ]);
    }
  });

  it('impossible input: a no-ad tiebreak lost on its own target is clamped as a keystroke clamps it', () => {
    // a no-ad tiebreak to 7 cannot be lost with 7 points; the hand-written rule recorded 8-7
    expect(tiebreaks('SET3-S:6/TB7NOAD', '7', '6', '7')).toEqual([7, 6]);
  });

  it('impossible input: a set whose format has no tiebreak records only the points typed', () => {
    // the hand-written rule invented a tiebreak to 7 here and recorded 7-0
    expect(tiebreaks('SET3-S:6', '7', '6', '0')).toEqual([undefined, 0]);
    expect(tiebreaks('SET3X-S:T10', '6', '7', '3')).toEqual([3, undefined]);
    expect('side1TiebreakScore' in buildSetScore(0, '7', '6', '0', matchUpConfigFor('SET3-S:6'))).toEqual(false);
  });
});
