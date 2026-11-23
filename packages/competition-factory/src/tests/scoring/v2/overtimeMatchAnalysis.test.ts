import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import { describe, expect, it } from 'vitest';

/**
 * The static analysis a score-entry card reads (overtime activation S6, before the gate): an overtime period is
 * played to the overtime segment, and an overtime format's match is decided where the scoring engine decides it.
 * Measured on dev 2026-11-04: `analyzeMatchUp` named side 1 the winner of `O:2X` after the first extra-time period,
 * and `analyzeSet` gave an extra-time period regulation's 45 minutes.
 */

const F1 = 'HAL2XA-S:T45P-O:2X/T15P-F:TB1';
const F2 = 'QTR4XA-S:T12P-O:U/T5P';
const F3 = 'PER3XA-S:T20P-O:USD/T20P';
const F4 = 'PER3XA-S:T20P-O:1SD/T5P-F:TB1';
const F5 = 'HAL2XA-S:T40P-O:1/T10P';
const SO = 'HAL2XA-S:T45P-O:2X/T15P-F:SO5';

const asSets = (pairs: number[][]) =>
  pairs.map(([a, b], i) => ({ setNumber: i + 1, side1Score: a, side2Score: b }) as any);
const winnerOf = (matchUpFormat: string, pairs: number[][]) =>
  (analyzeMatchUp({ matchUp: { matchUpFormat, score: { sets: asSets(pairs) } } } as any) as any).calculatedWinningSide;
const formatOfSet = (matchUpFormat: string, setNumber: number) =>
  analyzeSet({ setObject: { setNumber }, matchUpScoringFormat: parse(matchUpFormat) }).setFormat;

describe('an overtime period is played to the overtime segment', () => {
  it.each([
    [F1, 2, 45],
    [F1, 3, 15],
    [F1, 4, 15],
    [F2, 4, 12],
    [F2, 5, 5],
    [F2, 9, 5],
    [F4, 4, 5],
    [F5, 3, 10],
  ])('%s set %i: %i minutes', (format, setNumber, minutes) => {
    expect(formatOfSet(format, setNumber)?.minutes).toEqual(minutes);
  });

  it('and the decider to -F:', () => {
    expect(formatOfSet(F1, 5)).toEqual({ tiebreakSet: { tiebreakTo: 1 } });
    expect(formatOfSet(SO, 5)).toEqual({ shootout: 5 });
  });

  it('a shootout tally names its winner', () => {
    const setObject = { setNumber: 5, side1Score: 3, side2Score: 4 };
    expect(analyzeSet({ setObject, matchUpScoringFormat: parse(SO) }).winningSide).toEqual(2);
  });
});

describe('an overtime match is decided where the scoring engine decides it', () => {
  it.each([
    [
      'an exact block is played to its end',
      F1,
      [
        [1, 0],
        [0, 1],
        [1, 0],
      ],
      undefined,
    ],
    [
      'an exact block, ahead at its end',
      F1,
      [
        [1, 0],
        [0, 1],
        [1, 0],
        [0, 0],
      ],
      1,
    ],
    [
      'an exact block, level at its end, owes its decider',
      F1,
      [
        [1, 0],
        [0, 1],
        [1, 0],
        [0, 1],
      ],
      undefined,
    ],
    [
      'regulation decides',
      F5,
      [
        [2, 0],
        [0, 1],
      ],
      1,
    ],
    [
      'a finite period, ahead',
      F5,
      [
        [1, 0],
        [0, 1],
        [0, 1],
      ],
      2,
    ],
    [
      'unlimited, level',
      F2,
      [
        [20, 20],
        [20, 20],
        [20, 20],
        [20, 20],
        [5, 5],
      ],
      undefined,
    ],
    [
      'unlimited, ahead',
      F2,
      [
        [20, 20],
        [20, 20],
        [20, 20],
        [20, 20],
        [5, 5],
        [7, 5],
      ],
      1,
    ],
    [
      'sudden death',
      F3,
      [
        [1, 0],
        [0, 1],
        [0, 0],
        [0, 1],
      ],
      2,
    ],
    [
      'a shootout',
      SO,
      [
        [1, 0],
        [0, 1],
        [0, 0],
        [0, 0],
        [4, 3],
      ],
      1,
    ],
  ])('%s', (_, format, pairs, winningSide) => {
    expect(winnerOf(format, pairs)).toEqual(winningSide);
  });

  it('a one-point decider', () => {
    const sets = [
      ...asSets([
        [1, 0],
        [0, 1],
        [0, 0],
        [0, 0],
      ]),
      { setNumber: 5, side1TiebreakScore: 0, side2TiebreakScore: 1 },
    ];
    const result: any = analyzeMatchUp({ matchUp: { matchUpFormat: F1, score: { sets } } } as any);
    expect(result.calculatedWinningSide).toEqual(2);
  });
});
