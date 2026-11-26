/**
 * The score-entry model and its transitions.
 *
 * Three things are asserted about EVERY transition, because they are the contract that makes this a
 * state engine rather than a tidier object: it returns a new model and leaves its argument untouched
 * (every input here is deep-frozen, so a write would throw); it returns the SAME object when it refuses,
 * so a caller can tell a refusal by identity; and it never decides anything about tennis itself — the
 * complements, ceilings and completeness all come from the factory, which is why the expected values
 * below are quoted from measurements of it rather than reasoned out.
 */
import { chooseSideEnding, chooseMatchEnding, emptyScoreEntryState } from '../../scoreEntryState';
import { deepFreeze, frozen, enter, typed, G, TB } from './scoreEntryModelTestHelpers';
import { matchUpStatusConstants } from '@Constants/index';
import { describe, it, expect } from 'vitest';
import {
  replaceSets,
  clearScore,
  createScoreEntryModel,
  switchApproach,
  chooseEnding,
  changeFormat,
  typeDigit,
  clearCell,
  clearAll,
  setCell,
} from '../../scoreEntryState';

const { RETIRED, WALKOVER, SUSPENDED } = matchUpStatusConstants;

const STANDARD = 'SET3-S:6/TB7';
const MATCH_TIEBREAK = 'SET1-S:TB10';
const TIMED = 'SET3X-S:T10';
const BEST_OF_FIVE = 'SET5-S:6/TB7';
const MATCH_TIEBREAK_DECIDER = 'SET3-S:6/TB7-F:TB10';

describe('createScoreEntryModel', () => {
  it('opens under the standard format with every set empty and no ending', () => {
    const model = createScoreEntryModel();

    expect(model.matchUpFormat).toBe(STANDARD);
    expect(model.approach).toBe('dynamicSets');
    expect(model.sets).toEqual([{}, {}, {}]);
    expect(model.ending).toBe(emptyScoreEntryState);
  });

  it('holds exactly as many sets as the format plays', () => {
    expect(createScoreEntryModel({ matchUpFormat: BEST_OF_FIVE }).sets).toHaveLength(5);
    expect(createScoreEntryModel({ matchUpFormat: MATCH_TIEBREAK }).sets).toHaveLength(1);
    // An `exactly` format plays every one of its sets.
    expect(createScoreEntryModel({ matchUpFormat: 'SET9X-S:T10' }).sets).toHaveLength(9);
  });

  it('seeds a saved score cell by cell, a set lost to love included', () => {
    const model = createScoreEntryModel({
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 0, winningSide: 1 },
        { setNumber: 2, side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 3, winningSide: 1 },
      ],
    });

    // `0` is a score, not an empty cell.
    expect(model.sets[0]).toEqual({ side1: 6, side2: 0 });
    expect(model.sets[1]).toEqual({ side1: 7, side2: 6, tiebreak1: 7, tiebreak2: 3 });
  });

  it('seeds a match tiebreak from its POINTS, which a saved set keeps in the tiebreak fields', () => {
    const model = createScoreEntryModel({
      matchUpFormat: MATCH_TIEBREAK,
      sets: [
        { setNumber: 1, side1Score: 0, side2Score: 0, side1TiebreakScore: 10, side2TiebreakScore: 8, winningSide: 1 },
      ],
    });

    expect(model.sets[0]).toEqual({ side1: 10, side2: 8 });
  });

  it('holds a saved record to the same invariant as a typed one: a set past the decider is trimmed on open', () => {
    const model = createScoreEntryModel({
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 2, winningSide: 1 },
        { setNumber: 2, side1Score: 6, side2Score: 2, winningSide: 1 },
        { setNumber: 3, side1Score: 6, side2Score: 3, winningSide: 1 },
      ],
    });

    expect(model.sets).toEqual([{ side1: 6, side2: 2 }, { side1: 6, side2: 2 }, {}]);
  });

  it('hydrates the ending from a saved matchUp through the existing engine', () => {
    const model = createScoreEntryModel({ matchUp: { matchUpStatus: RETIRED, winningSide: 2 } });

    // The side the ending HAPPENED TO, not the winner — `hydrateScoreEntryState`'s inversion, unchanged.
    expect(model.ending).toEqual({ sideEnding: { sideNumber: 1, status: RETIRED }, reasonCode: undefined });
  });
});

describe('typeDigit', () => {
  it('writes a digit into an empty cell and nothing else', () => {
    const model = frozen();
    const next = typeDigit(model, { cell: G(0, 2), digit: 4 });

    expect(next).not.toBe(model);
    expect(next.sets).toEqual([{ side2: 4 }, {}, {}]);
    expect(model.sets).toEqual([{}, {}, {}]);
  });

  it('appends a second digit only where the format allows the number it makes', () => {
    // A set to ten allows 11, so `1` then `0` is a ten.
    const long = typeDigit(typeDigit(frozen({ matchUpFormat: 'SET3-S:10/TB7' }), { cell: G(0, 1), digit: 1 }), {
      cell: G(0, 1),
      digit: 0,
    });
    expect(long.sets[0]).toEqual({ side1: 10 });

    // A set to six tops out at 7, so `1` then `0` is refused: the same model comes back.
    const one = typeDigit(frozen(), { cell: G(0, 1), digit: 1 });
    expect(typeDigit(one, { cell: G(0, 1), digit: 0 })).toBe(one);
  });

  it('never takes a third digit, even where no ceiling exists', () => {
    const two = typeDigit(typeDigit(frozen({ matchUpFormat: TIMED }), { cell: G(0, 1), digit: 2 }), {
      cell: G(0, 1),
      digit: 2,
    });
    expect(two.sets[0]).toEqual({ side1: 22 });
    expect(typeDigit(two, { cell: G(0, 1), digit: 2 })).toBe(two);
  });

  it("takes the ceiling from the factory, given the opponent's games", () => {
    // 7 against 5 is 7-5, won outright — `#5043(factory)`. Pinned because a factory that tightened
    // this to 6 shipped for a day.
    expect(typeDigit(enter(frozen(), 0, undefined, 5), { cell: G(0, 1), digit: 7 }).sets[0]).toEqual({
      side1: 7,
      side2: 5,
    });
    // 7 against 6 is a tiebreak set.
    expect(typeDigit(enter(frozen(), 0, undefined, 6), { cell: G(0, 1), digit: 7 }).sets[0]).toEqual({
      side1: 7,
      side2: 6,
    });

    // 7 against 3 cannot happen: 7 is reachable only through a tiebreak at six-all.
    const facingThree = enter(frozen(), 0, undefined, 3);
    expect(typeDigit(facingThree, { cell: G(0, 1), digit: 7 })).toBe(facingThree);
    expect(typeDigit(facingThree, { cell: G(0, 1), digit: 6 }).sets[0]).toEqual({ side1: 6, side2: 3 });

    // An 8 in a set to six is a typo whatever the opponent has.
    const empty = frozen();
    expect(typeDigit(empty, { cell: G(0, 1), digit: 8 })).toBe(empty);
  });

  it('refuses a digit that is not one, and a cell that does not exist', () => {
    const model = frozen();
    expect(typeDigit(model, { cell: G(0, 1), digit: 10 })).toBe(model);
    expect(typeDigit(model, { cell: G(0, 1), digit: -1 })).toBe(model);
    expect(typeDigit(model, { cell: G(0, 1), digit: 1.5 })).toBe(model);
    expect(typeDigit(model, { cell: G(3, 1), digit: 4 })).toBe(model);
    expect(typeDigit(model, { cell: { setIndex: 0, side: 3 as any, kind: 'games' }, digit: 4 })).toBe(model);
  });

  describe('the smart complement is a transition', () => {
    it('writes the factory complement opposite a digit typed into an EMPTY set', () => {
      // `getSetComplement`: 4 → 6, and 6 → 7 (a six-all is a tiebreak, so the other side has seven).
      expect(typeDigit(frozen(), { cell: G(0, 2), digit: 4, complement: true }).sets[0]).toEqual({
        side1: 6,
        side2: 4,
      });
      expect(typeDigit(frozen(), { cell: G(0, 1), digit: 6, complement: true }).sets[0]).toEqual({
        side1: 6,
        side2: 7,
      });
    });

    it('writes nothing opposite where the factory has no single answer', () => {
      // A 7 could have beaten a 5 or a 6; the factory returns the value in both slots and nothing is inferred.
      expect(typeDigit(frozen(), { cell: G(0, 2), digit: 7, complement: true }).sets[0]).toEqual({ side2: 7 });
    });

    it('infers the whole PAIR from a first digit, over whatever the other cell held', () => {
      // The shipping dialog's rule, pinned by the keyboard tests: a 4 typed into an empty cell says the set
      // was 6-4. Firing only once per set is the caller's policy, held beside its Smart toggle.
      const withSeven = enter(frozen(), 0, 7);
      expect(typeDigit(withSeven, { cell: G(0, 2), digit: 4, complement: true }).sets[0]).toEqual({
        side1: 6,
        side2: 4,
      });
    });

    it('never fires from a cell that already holds a digit — a second digit is a correction', () => {
      const one = typeDigit(frozen({ matchUpFormat: 'SET3-S:10/TB7' }), { cell: G(0, 2), digit: 1 });
      expect(typeDigit(one, { cell: G(0, 2), digit: 0, complement: true }).sets[0]).toEqual({ side2: 10 });
    });

    it('is off unless asked for', () => {
      expect(typeDigit(frozen(), { cell: G(0, 2), digit: 4 }).sets[0]).toEqual({ side2: 4 });
    });
  });

  describe('an ordinary tiebreak', () => {
    const sevenSix = typed(STANDARD, [7, 6]);

    it('takes points into either tiebreak cell, deriving nothing by default', () => {
      expect(typeDigit(sevenSix, { cell: TB(0, 2), digit: 3 }).sets[0]).toEqual({ side1: 7, side2: 6, tiebreak2: 3 });
    });

    it("derives the winner's points from the LOSER's when asked", () => {
      const next = typeDigit(sevenSix, { cell: TB(0, 2), digit: 3, complement: true });
      expect(next.sets[0]).toEqual({ side1: 7, side2: 6, tiebreak1: 7, tiebreak2: 3 });

      // A tiebreak to seven ends 8-6: the factory's win-by-two, not a local `Math.max`.
      expect(typeDigit(sevenSix, { cell: TB(0, 2), digit: 6, complement: true }).sets[0]).toMatchObject({
        tiebreak1: 8,
        tiebreak2: 6,
      });
      // No-ad: a 6 completes to 7. The FIELD is `NoAD` and the parameter `tiebreakNoAd`; see `tiebreakEntry.ts`.
      expect(
        typeDigit(typed('SET3-S:6/TB7NOAD', [7, 6]), { cell: TB(0, 2), digit: 6, complement: true }).sets[0],
      ).toMatchObject({
        tiebreak1: 7,
        tiebreak2: 6,
      });
    });

    it("derives nothing from the WINNER's cell, whose 7 could have beaten anything", () => {
      expect(typeDigit(sevenSix, { cell: TB(0, 1), digit: 7, complement: true }).sets[0]).toEqual({
        side1: 7,
        side2: 6,
        tiebreak1: 7,
      });
    });

    it('has no tiebreak cell in a tiebreak-only set', () => {
      const model = frozen({ matchUpFormat: MATCH_TIEBREAK });
      expect(typeDigit(model, { cell: TB(0, 1), digit: 3 })).toBe(model);
    });
  });

  describe('a tiebreak-only set takes ONE typed number and derives the other', () => {
    it('completes the pair from the lower score on whichever row it was typed', () => {
      const model = frozen({ matchUpFormat: MATCH_TIEBREAK });
      // `getTiebreakComplement`: max(tiebreakTo, low + 2) — 8 → 10.
      expect(typeDigit(model, { cell: G(0, 2), digit: 8, complement: true }).sets[0]).toEqual({ side1: 10, side2: 8 });
      expect(typeDigit(model, { cell: G(0, 1), digit: 8, complement: true }).sets[0]).toEqual({ side1: 8, side2: 10 });
      // Without the flag the typed number stands alone — Dynamic Sets with its Smart toggle off.
      expect(typeDigit(model, { cell: G(0, 2), digit: 8 }).sets[0]).toEqual({ side2: 8 });
    });

    it('extends the typed number with the next digit and re-derives: `1` then `0` is a ten', () => {
      const one = typeDigit(frozen({ matchUpFormat: MATCH_TIEBREAK }), { cell: G(0, 2), digit: 1, complement: true });
      expect(one.sets[0]).toEqual({ side1: 10, side2: 1 });

      const ten = typeDigit(one, { cell: G(0, 2), digit: 0, complement: true });
      expect(ten.sets[0]).toEqual({ side1: 12, side2: 10 });
    });

    it('starts a new lower score on the OTHER row when typed there — the row names the loser', () => {
      const twelveTen = typeDigit(
        typeDigit(frozen({ matchUpFormat: MATCH_TIEBREAK }), { cell: G(0, 2), digit: 1, complement: true }),
        {
          cell: G(0, 2),
          digit: 0,
          complement: true,
        },
      );
      expect(typeDigit(twelveTen, { cell: G(0, 1), digit: 5, complement: true }).sets[0]).toEqual({
        side1: 5,
        side2: 10,
      });
    });

    it('applies to the deciding set of a format whose decider is a match tiebreak', () => {
      const model = typed(MATCH_TIEBREAK_DECIDER, [6, 4], [4, 6]);
      expect(typeDigit(model, { cell: G(2, 1), digit: 8, complement: true }).sets[2]).toEqual({ side1: 8, side2: 10 });
    });
  });
});

describe('setCell', () => {
  it('records the value given, legal or not — legality is a selector question', () => {
    expect(setCell(frozen(), G(0, 1), 44).sets[0]).toEqual({ side1: 44 });
  });

  it('empties a cell with undefined, and clearCell is that', () => {
    const model = typed(STANDARD, [6, 4]);
    expect(setCell(model, G(0, 2), undefined).sets[0]).toEqual({ side1: 6 });
    expect(clearCell(model, G(0, 2)).sets[0]).toEqual({ side1: 6 });
  });

  it('refuses a no-op and a bad value by identity', () => {
    const model = typed(STANDARD, [6, 4]);
    expect(setCell(model, G(0, 1), 6)).toBe(model);
    expect(setCell(model, G(0, 1), -1)).toBe(model);
    expect(setCell(model, G(0, 1), 2.5)).toBe(model);
    expect(setCell(model, G(9, 1), 2)).toBe(model);
  });

  it('forgets a tiebreak whose games no longer call for one', () => {
    const withPoints = setCell(setCell(typed(STANDARD, [7, 6]), TB(0, 1), 7), TB(0, 2), 3);
    expect(withPoints.sets[0]).toEqual({ side1: 7, side2: 6, tiebreak1: 7, tiebreak2: 3 });

    // 7-6 edited down to 7-3: no tiebreak was played, so its points go with it.
    expect(setCell(withPoints, G(0, 2), 3).sets[0]).toEqual({ side1: 7, side2: 3 });
    // But not while the set is mid-retype: a lone 7 may be about to become 7-6 again.
    expect(clearCell(withPoints, G(0, 2)).sets[0]).toEqual({ side1: 7, tiebreak1: 7, tiebreak2: 3 });
  });

  it('a 0-0 pair is no points — the gesture for declining them once a complement has filled them', () => {
    const toLove = setCell(setCell(typed(STANDARD, [7, 6]), TB(0, 1), 7), TB(0, 2), 0);
    expect(toLove.sets[0]).toEqual({ side1: 7, side2: 6, tiebreak1: 7, tiebreak2: 0 });
    // a 0 over the derived 7: no tiebreak finishes 0-0, so the pair goes and the set is a bare 7-6
    expect(setCell(toLove, TB(0, 1), 0).sets[0]).toEqual({ side1: 7, side2: 6 });
    // a lone 0 is points — a tiebreak to love in the making
    expect(setCell(typed(STANDARD, [7, 6]), TB(0, 2), 0).sets[0]).toEqual({ side1: 7, side2: 6, tiebreak2: 0 });
  });

  it('keeps a tiebreak typed ONTO games that do not call for one, so error can say so', () => {
    // The Dial Pad's rule: a stray 3 on a 6-2 is shown and refused, never quietly dropped. Only a change
    // to the GAMES forgets a tiebreak; a change to the tiebreak itself is the operator speaking.
    const strayPoints = typeDigit(typed(STANDARD, [6, 2]), { cell: TB(0, 2), digit: 3, complement: true });
    expect(strayPoints.sets[0]).toEqual({ side1: 6, side2: 2, tiebreak1: 7, tiebreak2: 3 });
    expect(setCell(strayPoints, TB(0, 2), 4).sets[0]).toMatchObject({ tiebreak2: 4 });
  });

  describe('no set exists beyond the one that decides the match', () => {
    it('the sequence 6-2, 2-6, a third set, then set 2 edited to 6-2 — the third set goes', () => {
      const three = typed(STANDARD, [6, 2], [2, 6], [6, 3]);
      expect(three.sets[2]).toEqual({ side1: 6, side2: 3 });

      const decidedEarly = enter(three, 1, 6, 2);
      expect(decidedEarly.sets).toEqual([{ side1: 6, side2: 2 }, { side1: 6, side2: 2 }, {}]);
    });

    it('holds through typeDigit as well as setCell', () => {
      const three = typed(STANDARD, [6, 2], [2, 6], [6, 3]);
      const decidedEarly = typeDigit(setCell(clearCell(three, G(1, 2)), G(1, 1), 6), { cell: G(1, 2), digit: 2 });
      expect(decidedEarly.sets[2]).toEqual({});
    });

    it('a half-entered set beyond the decider goes too', () => {
      const partialThird = enter(typed(STANDARD, [6, 2], [2, 6]), 2, 3);
      expect(enter(partialThird, 1, 6, 2).sets[2]).toEqual({});
    });

    it('never trims an `exactly` format, which plays every set', () => {
      const bolts = typed(TIMED, [22, 21], [22, 21], [22, 21]);
      expect(bolts.sets).toEqual([
        { side1: 22, side2: 21 },
        { side1: 22, side2: 21 },
        { side1: 22, side2: 21 },
      ]);
    });

    it('a best-of-five is decided at three, and keeps its third', () => {
      const five = typed(BEST_OF_FIVE, [6, 2], [6, 2], [6, 2]);
      expect(five.sets).toEqual([{ side1: 6, side2: 2 }, { side1: 6, side2: 2 }, { side1: 6, side2: 2 }, {}, {}]);
    });
  });
});

describe('clearAll', () => {
  it('empties every set and un-chooses the ending, keeping the format and approach', () => {
    const model = deepFreeze(chooseEnding(typed(STANDARD, [6, 4]), { kind: 'match', status: SUSPENDED }));
    const cleared = clearAll(model);

    expect(cleared.sets).toEqual([{}, {}, {}]);
    expect(cleared.ending).toBe(emptyScoreEntryState);
    expect(cleared.matchUpFormat).toBe(model.matchUpFormat);
    expect(cleared.approach).toBe(model.approach);
  });

  it('is a no-op on an empty model, by identity', () => {
    const model = frozen();
    expect(clearAll(model)).toBe(model);
  });
});

describe('chooseEnding delegates to scoreEntryState and leaves the score alone', () => {
  it('a side ending', () => {
    const model = typed(STANDARD, [6, 4]);
    const next = chooseEnding(model, { kind: 'side', sideNumber: 1, status: WALKOVER });

    expect(next.ending).toEqual(chooseSideEnding(model.ending, 1, WALKOVER));
    // The SETS are the same array: a walkover suppresses the score through the selectors, it does not
    // delete what was typed.
    expect(next.sets).toBe(model.sets);
  });

  it('a match ending, and every control is a toggle', () => {
    const model = frozen();
    const chosen = chooseEnding(model, { kind: 'match', status: SUSPENDED });
    expect(chosen.ending).toEqual(chooseMatchEnding(model.ending, SUSPENDED));

    const unchosen = chooseEnding(chosen, { kind: 'match', status: SUSPENDED });
    expect(unchosen.ending.matchEnding).toBeUndefined();
  });

  it('both sides out, only where the ending has a double form', () => {
    const walkover = deepFreeze(chooseEnding(frozen(), { kind: 'side', sideNumber: 1, status: WALKOVER }));
    expect(chooseEnding(walkover, { kind: 'bothSidesOut' }).ending.bothSidesOut).toBe(true);

    const retired = deepFreeze(chooseEnding(frozen(), { kind: 'side', sideNumber: 1, status: RETIRED }));
    expect(chooseEnding(retired, { kind: 'bothSidesOut' })).toBe(retired);
  });

  it('a reason code', () => {
    const suspended = deepFreeze(chooseEnding(frozen(), { kind: 'match', status: SUSPENDED }));
    expect(chooseEnding(suspended, { kind: 'reasonCode', code: 'RJ' }).ending.reasonCode).toBe('RJ');
  });
});

describe('changeFormat keeps what the new format has not invalidated', () => {
  it('is a no-op for the same format, by identity', () => {
    const model = typed(STANDARD, [6, 4]);
    expect(changeFormat(model, STANDARD)).toBe(model);
  });

  it('grows to a best-of-five without touching the sets typed', () => {
    const next = changeFormat(typed(STANDARD, [6, 4], [3, 2]), BEST_OF_FIVE);
    expect(next.matchUpFormat).toBe(BEST_OF_FIVE);
    expect(next.sets).toEqual([{ side1: 6, side2: 4 }, { side1: 3, side2: 2 }, {}, {}, {}]);
  });

  it('cuts to the set count of a shorter format', () => {
    expect(changeFormat(typed(STANDARD, [6, 4], [3, 2]), 'SET1-S:6/TB7').sets).toEqual([{ side1: 6, side2: 4 }]);
  });

  it('the example: the first two sets survive a match-tiebreak decider, a part-entered third does not', () => {
    const partialThird = enter(typed(STANDARD, [6, 4], [4, 6]), 2, 3);
    const next = changeFormat(partialThird, MATCH_TIEBREAK_DECIDER);
    expect(next.sets).toEqual([{ side1: 6, side2: 4 }, { side1: 4, side2: 6 }, {}]);
  });

  it('keeps a part-entered set whose position keeps the same rule', () => {
    const partialSecond = enter(typed(STANDARD, [6, 4]), 1, 3);
    // Only the DECIDER changes here; set 2's rule is what it was, so its lone 3 is nobody's business.
    expect(changeFormat(partialSecond, MATCH_TIEBREAK_DECIDER).sets[1]).toEqual({ side1: 3 });
  });

  it('carries the ending across', () => {
    const model = deepFreeze(chooseEnding(typed(STANDARD, [6, 4]), { kind: 'match', status: SUSPENDED }));
    expect(changeFormat(model, BEST_OF_FIVE).ending).toBe(model.ending);
  });
});

describe('switchApproach', () => {
  it('changes only the approach: the sets are the sets whichever region shows them', () => {
    const model = typed(STANDARD, [6, 4]);
    const next = switchApproach(model, 'dialPad');

    expect(next.approach).toBe('dialPad');
    expect(next.sets).toBe(model.sets);
    expect(next.ending).toBe(model.ending);
  });

  it('is a no-op for the same approach, by identity', () => {
    const model = frozen();
    expect(switchApproach(model, 'dynamicSets')).toBe(model);
  });
});

describe('replaceSets — the Free Score boundary', () => {
  it('replaces every set from a factory-shaped array, held to the same invariants as opening a saved score', () => {
    const model = typed(STANDARD, [6, 4]);
    const next = replaceSets(model, [
      { setNumber: 1, side1Score: 6, side2Score: 2, winningSide: 1 },
      { setNumber: 2, side1Score: 6, side2Score: 2, winningSide: 1 },
      { setNumber: 3, side1Score: 6, side2Score: 3, winningSide: 1 },
    ]);

    // A set past the decider is trimmed, exactly as on open.
    expect(next.sets).toEqual([{ side1: 6, side2: 2 }, { side1: 6, side2: 2 }, {}]);
    expect(next.ending).toBe(model.ending);
  });

  it('is a no-op by identity when the sets are what the model already holds', () => {
    const model = typed(STANDARD, [6, 4], [3, 2]);
    expect(
      replaceSets(model, [
        { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
        { setNumber: 2, side1Score: 3, side2Score: 2 },
      ]),
    ).toBe(model);
  });

  it('empties the sets when given none', () => {
    expect(replaceSets(typed(STANDARD, [6, 4]), []).sets).toEqual([{}, {}, {}]);
  });
});

describe('clearScore — what a score-clearing ending does', () => {
  it('empties every set and keeps the ending', () => {
    const walkover = deepFreeze(
      chooseEnding(typed(STANDARD, [6, 4]), { kind: 'side', sideNumber: 1, status: WALKOVER }),
    );
    const cleared = clearScore(walkover);

    expect(cleared.sets).toEqual([{}, {}, {}]);
    expect(cleared.ending).toBe(walkover.ending);
  });

  it('is a no-op by identity when there is nothing to clear', () => {
    const model = frozen();
    expect(clearScore(model)).toBe(model);
  });
});
