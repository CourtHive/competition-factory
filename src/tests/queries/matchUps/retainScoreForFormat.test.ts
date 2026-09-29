import { retainScoreForFormat } from '@Query/matchUp/retainScoreForFormat';
import { describe, expect, it } from 'vitest';

/**
 * What survives a change of `matchUpFormat`.
 *
 * The scenario CA gave is the first test, verbatim: someone enters two sets, realises the third is a
 * match tiebreak, and changes format. The first two sets must not move; a part-entered third must go.
 *
 * ── These assert the SETS, not a count ──
 *
 * A length check passes for a utility that kept the wrong two. Every case below asserts which sets
 * survived by value, and the discarded ones too, because the caller has to quote them back to the
 * operator and a `discarded` that is merely non-empty is no use for that.
 */

const STANDARD = 'SET3-S:6/TB7';
/** CA's target: no-ad games, and a match tiebreak as the decider. */
const NOAD_WITH_MATCH_TIEBREAK = 'SET3-S:6NOAD/TB7-F:TB10';

const set = (setNumber: number, side1Score: number, side2Score: number, winningSide?: number) => ({
  setNumber,
  side1Score,
  side2Score,
  ...(winningSide ? { winningSide } : {}),
});

describe("CA's scenario — the third set becomes a tiebreak", () => {
  it('keeps both finished sets and trims the part-entered third', () => {
    const sets = [set(1, 6, 4, 1), set(2, 6, 3, 1), set(3, 2, 1)];

    const result = retainScoreForFormat({
      sets,
      matchUpFormat: NOAD_WITH_MATCH_TIEBREAK,
      previousMatchUpFormat: STANDARD,
    });

    expect(result.sets).toEqual([sets[0], sets[1]]);
    expect(result.discarded).toEqual([sets[2]]);
    expect(result.unchanged).toBe(false);
  });

  it('says WHY, so the caller can quote it', () => {
    const result = retainScoreForFormat({
      sets: [set(1, 6, 4, 1), set(2, 6, 3, 1), set(3, 2, 1)],
      matchUpFormat: NOAD_WITH_MATCH_TIEBREAK,
      previousMatchUpFormat: STANDARD,
    });

    expect(typeof result.reason).toBe('string');
    expect(result.reason?.length).toBeGreaterThan(0);
  });

  it('touches nothing when only the first two sets exist', () => {
    // The same format change, with no third set to lose: it must cost the operator nothing at all.
    const sets = [set(1, 6, 4, 1), set(2, 6, 3, 1)];

    const result = retainScoreForFormat({
      sets,
      matchUpFormat: NOAD_WITH_MATCH_TIEBREAK,
      previousMatchUpFormat: STANDARD,
    });

    expect(result.sets).toEqual(sets);
    expect(result.discarded).toEqual([]);
    expect(result.unchanged).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

describe('a set whose own rule did not change is left alone, finished or not', () => {
  it('keeps a PART-ENTERED set when its position is unaffected', () => {
    // CA's ruling on this, 2026-09-29: trim what the new format invalidates, not every trailing
    // partial. Here only the DECIDING set's rule moved, and the part-entered set is the second — which
    // the change did not touch, so it stays.
    const sets = [set(1, 6, 4, 1), set(2, 3, 1)];

    const result = retainScoreForFormat({
      sets,
      matchUpFormat: 'SET3-S:6/TB7-F:TB10',
      previousMatchUpFormat: STANDARD,
    });

    expect(result.sets).toEqual(sets);
    expect(result.unchanged).toBe(true);
  });

  it('drops that same partial once its OWN rule moves', () => {
    // The control for the test above, and the pair is the point: identical score, and the only
    // difference is whether the change reached the set in question. Shortening the format to a
    // best-of-two makes the SECOND set the decider, so `F:TB10` now governs the very set that holds
    // the partial — while the first set's rule is untouched and it stays.
    const sets = [set(1, 6, 4, 1), set(2, 3, 1)];

    const result = retainScoreForFormat({
      sets,
      matchUpFormat: 'SET2-S:6/TB7-F:TB10',
      previousMatchUpFormat: STANDARD,
    });

    expect(result.sets).toEqual([sets[0]]);
    expect(result.discarded).toEqual([sets[1]]);
  });

  it('a format the grammar cannot read takes nothing away, rather than everything', () => {
    // `SET2X-S:TB10` does NOT parse — measured, though `SET2X-S:T10` does. An earlier version of the
    // test above used it and passed for the wrong reason: nothing was discarded because nothing could
    // be judged, not because the sets had survived a comparison. Pinned so the next reader is not
    // caught by the same string, and so the fail-safe direction is the asserted one.
    const sets = [set(1, 6, 4, 1), set(2, 3, 1)];

    const result = retainScoreForFormat({ sets, matchUpFormat: 'SET2X-S:TB10', previousMatchUpFormat: STANDARD });

    expect(result.sets).toEqual(sets);
    expect(result.unchanged).toBe(true);
  });
});

describe('a set is kept or dropped WHOLE', () => {
  it('discards a 7-6 rather than trimming it to its games when the tiebreak is resized', () => {
    // CA, 2026-09-29: "drop whole". Keeping 7-6 with its points discarded would leave the set in the
    // one state the interface treats as unfinished, and reopen it mid-tiebreak.
    const sets = [
      { setNumber: 1, side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 3, winningSide: 1 },
    ];

    const result = retainScoreForFormat({
      sets,
      matchUpFormat: 'SET3-S:6/TB10',
      previousMatchUpFormat: STANDARD,
    });

    expect(result.sets).toEqual([]);
    expect(result.discarded).toEqual(sets);
  });

  it('never rescales — a match tiebreak does not become a set score', () => {
    // A 10-8 moving to a TB7 is discarded, not rewritten as 7-5. Asserted because the tempting
    // "helpful" behaviour is exactly the one that invents a score nobody played.
    const sets = [
      { setNumber: 1, side1Score: 0, side2Score: 0, side1TiebreakScore: 10, side2TiebreakScore: 8, winningSide: 1 },
    ];

    const result = retainScoreForFormat({
      sets,
      matchUpFormat: 'SET1-S:6/TB7',
      previousMatchUpFormat: 'SET1-S:TB10',
    });

    expect(result.sets).toEqual([]);
    expect(result.discarded).toEqual(sets);
    // and nothing in the output resembles a rewritten score
    expect(result.discarded[0]).toEqual(sets[0]);
  });
});

describe('everything after the first casualty goes with it', () => {
  it('does not keep a later set having dropped an earlier one', () => {
    // A score is a sequence. Keeping set 3 having dropped set 2 would renumber it into a claim nobody
    // made — the operator would see their third set presented as their second.
    const sets = [set(1, 7, 5, 1), set(2, 44, 3), set(3, 6, 2, 1)];

    const result = retainScoreForFormat({
      sets,
      matchUpFormat: 'SET3-S:6NOAD',
      previousMatchUpFormat: STANDARD,
    });

    expect(result.sets).toEqual([sets[0]]);
    expect(result.discarded).toEqual([sets[1], sets[2]]);
  });

  it("drops sets beyond the new format's count", () => {
    const sets = [set(1, 6, 4, 1), set(2, 4, 6, 2), set(3, 6, 3, 1)];

    const result = retainScoreForFormat({
      sets,
      matchUpFormat: 'SET1-S:6/TB7',
      previousMatchUpFormat: 'SET3-S:6/TB7',
    });

    expect(result.sets).toEqual([sets[0]]);
    expect(result.discarded).toEqual([sets[1], sets[2]]);
    expect(result.reason).toContain('beyond');
  });
});

describe('the edges, which a caller will hit', () => {
  it('an identical format changes nothing', () => {
    const sets = [set(1, 6, 4, 1), set(2, 3, 1)];
    const result = retainScoreForFormat({ sets, matchUpFormat: STANDARD, previousMatchUpFormat: STANDARD });

    expect(result.sets).toEqual(sets);
    expect(result.unchanged).toBe(true);
  });

  it('an empty score stays empty and is reported as unchanged', () => {
    const result = retainScoreForFormat({ sets: [], matchUpFormat: STANDARD, previousMatchUpFormat: 'SET1-S:TB10' });

    expect(result.sets).toEqual([]);
    expect(result.unchanged).toBe(true);
  });

  it('an unparseable target format takes nothing away', () => {
    // Nothing can be shown to be invalid against a format that does not parse, so nothing is removed.
    // Discarding on an unreadable format would lose a score to a typo.
    const sets = [set(1, 6, 4, 1)];
    const result = retainScoreForFormat({ sets, matchUpFormat: 'NONSENSE', previousMatchUpFormat: STANDARD });

    expect(result.sets).toEqual(sets);
    expect(result.unchanged).toBe(true);
  });

  it('called with nothing at all, answers rather than throwing', () => {
    expect(retainScoreForFormat()).toEqual({ sets: [], discarded: [], unchanged: true });
  });

  it('without the previous format, an unaffected PARTIAL cannot be recognised and is dropped', () => {
    // Stated as a property rather than left to be discovered: rule 2 needs the format being moved FROM,
    // and a caller that omits it gets the conservative answer. The dialog always knows both.
    const sets = [set(1, 6, 4, 1), set(2, 3, 1)];

    const withPrevious = retainScoreForFormat({ sets, matchUpFormat: STANDARD, previousMatchUpFormat: STANDARD });
    const without = retainScoreForFormat({ sets, matchUpFormat: STANDARD });

    expect(withPrevious.sets).toEqual(sets);
    expect(without.sets).toEqual([sets[0]]);
  });
});
