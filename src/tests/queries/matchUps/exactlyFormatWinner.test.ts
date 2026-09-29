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

describe('an AGGREGATE format is not answered by counting sets', () => {
  it('gives no winner even where one side took most of the bolts', () => {
    // Six bolts to side 1 — enough to decide the non-aggregate form above — and this must still say
    // nothing, because in an aggregate format the bolts won are not what decides the match.
    expect(winnerOf(bolts(6, 3), NINE_BOLTS_AGGREGATE)).toBeUndefined();
  });

  it('gives no winner even where one side took EVERY bolt', () => {
    expect(winnerOf(bolts(9, 0), NINE_BOLTS_AGGREGATE)).toBeUndefined();
  });

  it('does not answer by points either — it has no opinion at all, which is the honest one', () => {
    // Side 2 leads 132-78 on aggregate while side 1 leads 6-3 on bolts. Nothing in `analyzeMatchUp`
    // sums points, so it names neither. That gap is real and is recorded in `TASKS.md`; what this
    // pins is that the gap stays SILENT rather than being filled with the bolt count.
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

    expect(winnerOf(sets, NINE_BOLTS_AGGREGATE)).toBeUndefined();
  });
});
