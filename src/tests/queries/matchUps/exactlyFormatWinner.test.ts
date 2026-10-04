import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { describe, expect, it } from 'vitest';

/**
 * Who has won a format that plays EVERY set.
 *
 * `calculatedWinningSide` tested `maxSetsCount === setsToWin`. A best-of ends the moment a side
 * reaches `setsToWin`, so equality is exact there. An `exactly` format plays all N sets whatever the
 * running score, so the winner routinely exceeds it — and under equality the match reported no winner
 * at all. Nine bolts taken 6-3, or 9-0, resolved `undefined`.
 *
 * ── Aggregate formats are a different question, and this does not answer it ──
 *
 * CA, 2026-09-29: *"Sets to win is not a consideration when the format is INTENNSE."* An aggregate
 * format is decided by total points across the bolts, not by how many bolts each side took. Nothing
 * here sums points, so aggregate keeps returning `undefined` — the last describe holds that, because
 * the dangerous outcome is not silence but a confident answer to the wrong question.
 */

/** Nine ten-minute bolts; `setsToWin` is 5. `SET9-…` does not parse — the nine-set form is `SET9X`. */
const NINE_BOLTS = 'SET9X-S:T10';
/** The same, scored by AGGREGATE points — an INTENNSE shape. */
const NINE_BOLTS_AGGREGATE = 'SET9XA-S:T10';
const BEST_OF_THREE = 'SET3-S:6/TB7';

/** A full set of bolts, `a` of them won by side 1 and `b` by side 2. */
function bolts(a: number, b: number) {
  return [
    ...Array.from({ length: a }, (_unused, index) => ({
      setNumber: index + 1,
      side1Score: 22,
      side2Score: 21,
      winningSide: 1,
    })),
    ...Array.from({ length: b }, (_unused, index) => ({
      setNumber: a + index + 1,
      side1Score: 21,
      side2Score: 22,
      winningSide: 2,
    })),
  ];
}

const winnerOf = (sets: any[], matchUpFormat: string) =>
  analyzeMatchUp({ matchUp: { score: { sets }, matchUpFormat }, matchUpFormat }).calculatedWinningSide;

describe('an `exactly` format is decided by who won the MOST sets', () => {
  it.each([
    [5, 4, 1],
    [6, 3, 1],
    [7, 2, 1],
    [9, 0, 1],
    [4, 5, 2],
    [3, 6, 2],
    [0, 9, 2],
  ])('nine bolts taken %i-%i resolves side %i', (a, b, expected) => {
    // Only the 5-4 row passed before: every other one exceeded `setsToWin` and returned `undefined`.
    expect(winnerOf(bolts(a, b), NINE_BOLTS)).toEqual(expected);
  });

  it('is still undecided while bolts remain and neither side has five', () => {
    // Eight played, four each: the ninth can still settle it.
    expect(winnerOf(bolts(4, 4), NINE_BOLTS)).toBeUndefined();
  });

  it('refuses a drawn set count rather than picking one', () => {
    // An even `exactly` can finish level. `maxSetsInstances === 1` is what keeps this honest, and it
    // is unchanged by the fix — asserted so a later simplification cannot drop it.
    expect(winnerOf(bolts(4, 4), 'SET8X-S:T10')).toBeUndefined();
  });
});

describe('a BEST-OF format is untouched, which is most of tennis', () => {
  it.each([
    [2, 0, 1],
    [2, 1, 1],
    [1, 2, 2],
  ])('best of three taken %i-%i resolves side %i', (a, b, expected) => {
    const sets = [
      ...Array.from({ length: a }, (_unused, index) => ({
        setNumber: index + 1,
        side1Score: 6,
        side2Score: 4,
        winningSide: 1,
      })),
      ...Array.from({ length: b }, (_unused, index) => ({
        setNumber: a + index + 1,
        side1Score: 4,
        side2Score: 6,
        winningSide: 2,
      })),
    ];
    expect(winnerOf(sets, BEST_OF_THREE)).toEqual(expected);
  });

  it('one set each is undecided', () => {
    const sets = [
      { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
      { setNumber: 2, side1Score: 4, side2Score: 6, winningSide: 2 },
    ];
    expect(winnerOf(sets, BEST_OF_THREE)).toBeUndefined();
  });

  it('a MALFORMED best of three — three sets to one side — still resolves nobody', () => {
    // THE control on the scope of the change. A best-of cannot legitimately exceed `setsToWin`, so a
    // score that does is corrupt and this must go on refusing it. Were the new comparison applied to
    // every format rather than to `exactly` ones, this would start naming a winner for a score that
    // cannot exist — which is how a narrow fix becomes a wide one without anyone deciding to.
    const sets = [
      { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
      { setNumber: 2, side1Score: 6, side2Score: 4, winningSide: 1 },
      { setNumber: 3, side1Score: 6, side2Score: 4, winningSide: 1 },
    ];
    expect(winnerOf(sets, BEST_OF_THREE)).toBeUndefined();
  });
});

describe('an AGGREGATE format is decided on POINTS', () => {
  // CA's ruling, 2026-09-29: *"Sets to win is not a consideration when the format is INTENNSE ...
  // INTENNSE doesn't have games, so the aggregate is across all bolts."*
  //
  // This describe previously pinned the OPPOSITE — that an aggregate format yields no winner however
  // the bolts fall. That was correct while nothing summed points: no opinion beat the bolt-count
  // winner. It is superseded now that the sum exists, and the cases below are the same scores with the
  // answers CA specified.

  /** Bolts won 22-21 / 21-22, so the bolt count and the points agree. */
  const totalsOf = (a: number, b: number) => [a * 22 + b * 21, a * 21 + b * 22];

  it.each([
    [6, 3, 1],
    [9, 0, 1],
    [3, 6, 2],
  ])('nine aggregate bolts taken %i-%i resolves side %i on points', (a, b, expected) => {
    expect(winnerOf(bolts(a, b), NINE_BOLTS_AGGREGATE)).toEqual(expected);
  });

  it('reports the totals it decided on', () => {
    const analysis = analyzeMatchUp({
      matchUp: { score: { sets: bolts(6, 3) }, matchUpFormat: NINE_BOLTS_AGGREGATE },
      matchUpFormat: NINE_BOLTS_AGGREGATE,
    });

    expect(analysis.aggregateScores).toEqual(totalsOf(6, 3));
  });

  it('follows the POINTS where they disagree with the bolts — the case that makes this a rule', () => {
    // Six bolts to side 1, and side 2 ahead 132-78 on points. Counting bolts would name side 1
    // confidently and wrongly, which is exactly what CA's ruling exists to prevent.
    const sets = [
      ...Array.from({ length: 6 }, (_unused, index) => ({
        setNumber: index + 1,
        side1Score: 12,
        side2Score: 11,
        winningSide: 1,
      })),
      ...Array.from({ length: 3 }, (_unused, index) => ({
        setNumber: 7 + index,
        side1Score: 2,
        side2Score: 22,
        winningSide: 2,
      })),
    ];

    const analysis = analyzeMatchUp({
      matchUp: { score: { sets }, matchUpFormat: NINE_BOLTS_AGGREGATE },
      matchUpFormat: NINE_BOLTS_AGGREGATE,
    });

    expect(analysis.aggregateScores).toEqual([78, 132]);
    expect(analysis.calculatedWinningSide).toEqual(2);
  });
});

describe("INTENNSE's own format, and the one case that stays open", () => {
  /** What the INTENNSE_2026 fixture actually uses for singles. */
  const INTENNSE_SINGLES = 'SET2XA-S:T10';

  const twoBolts = (a1: number, a2: number, b1: number, b2: number) => [
    { setNumber: 1, side1Score: a1, side2Score: a2, ...(a1 !== a2 ? { winningSide: a1 > a2 ? 1 : 2 } : {}) },
    { setNumber: 2, side1Score: b1, side2Score: b2, ...(b1 !== b2 ? { winningSide: b1 > b2 ? 1 : 2 } : {}) },
  ];

  it('resolves a two-bolt sweep, which reported nobody before', () => {
    expect(winnerOf(twoBolts(22, 21, 22, 21), INTENNSE_SINGLES)).toEqual(1);
  });

  it('resolves a SPLIT on points, which is the whole point of aggregate scoring', () => {
    // One bolt each, and side 1 far ahead on points: 40-22.
    expect(winnerOf(twoBolts(30, 10, 10, 12), INTENNSE_SINGLES)).toEqual(1);
    // The mirror, so the direction is asserted and not assumed: 16-40.
    expect(winnerOf(twoBolts(11, 10, 5, 30), INTENNSE_SINGLES)).toEqual(2);
  });

  it('resolves a bolt that ended TIED, which has no winningSide at all', () => {
    // A timed bolt can finish level and is then excluded from `completedSets`, so nothing that counts
    // sets can see it. The aggregate reads its points regardless: 21-21 then 22-20 is 43-41.
    expect(winnerOf(twoBolts(21, 21, 22, 20), INTENNSE_SINGLES)).toEqual(1);
  });

  it('stays UNDECIDED only when the points are exactly level — the sudden-death case', () => {
    // CA: *"The only case where SET2XA-S:T10 never resolves a winner is if both sides score the same
    // exact number of points."* `undefined` means a decider is owed, not that the match ended level.
    expect(winnerOf(twoBolts(22, 21, 20, 21), INTENNSE_SINGLES)).toBeUndefined();
  });

  it('and the sudden-death point, once recorded, settles it through the same sum', () => {
    // Nothing models the decider. A point added to the final bolt makes the totals differ and the
    // winner falls out — which is why no new mechanism was needed for it.
    expect(winnerOf(twoBolts(22, 21, 21, 21), INTENNSE_SINGLES)).toEqual(1);
  });

  it("reads a TIEBREAK decider's point from the tiebreak fields, not the games", () => {
    // `SET3XA-S:T10-F:TB1` puts a sudden-death point in a tiebreak-only final set, whose games are 0-0
    // by construction. Reading the games alone would add nothing for it and leave the two level bolts
    // tied forever — the one point that settles the match would be the one point not counted.
    //
    // CA has said the decider need not appear in the matchUpFormat for INTENNSE; this is the case where
    // it DOES, and the sum has to handle it either way.
    const DECIDER_FORMAT = 'SET3XA-S:T10-F:TB1';
    // the decider is set 4, after all three bolts (CA, 2026-10-04: never one of the three)
    const sets = [
      { setNumber: 1, side1Score: 20, side2Score: 21, winningSide: 2 },
      { setNumber: 2, side1Score: 21, side2Score: 20, winningSide: 1 },
      { setNumber: 3, side1Score: 15, side2Score: 15 },
      { setNumber: 4, side1Score: 0, side2Score: 0, side1TiebreakScore: 0, side2TiebreakScore: 1, winningSide: 2 },
    ];

    const analysis = analyzeMatchUp({
      matchUp: { score: { sets }, matchUpFormat: DECIDER_FORMAT },
      matchUpFormat: DECIDER_FORMAT,
    });

    // 56-56 across the bolts, and the decider's single point to side 2.
    expect(analysis.aggregateScores).toEqual([56, 57]);
    expect(analysis.calculatedWinningSide).toEqual(2);
  });

  it('gives no winner while a bolt is still missing', () => {
    // CA: *"INTENNSE requires all sets recorded to be included in the aggregate total."* A running
    // total taken before the last bolt is in names a leader, and a leader is not a winner.
    const analysis = analyzeMatchUp({
      matchUp: {
        score: { sets: [{ setNumber: 1, side1Score: 22, side2Score: 21, winningSide: 1 }] },
        matchUpFormat: INTENNSE_SINGLES,
      },
      matchUpFormat: INTENNSE_SINGLES,
    });

    expect(analysis.calculatedWinningSide).toBeUndefined();
    expect(analysis.aggregateScores).toBeUndefined();
  });
});
