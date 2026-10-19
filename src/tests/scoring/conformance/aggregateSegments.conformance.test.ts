import type { SetOutcome } from '../../testHarness/scoringConformance/conformance';
import { segmentConforms } from '../../testHarness/scoringConformance/segments';
import { describe, it } from 'vitest';

/*
 * Conformance: aggregate formats — timed segments on every root, decided by the total across
 * segments, with and without exactly-N and a decider for a level total.
 * Every expected outcome below is written from the format definition it cites, not recorded from the
 * engine. These formats have no published rulebook; the definition is the authority:
 *
 * - documentation/docs/scoring-engine/format-support.md, "Aggregate Scoring": "The -A modifier
 *   switches from 'first to win N sets' to 'play all sets, aggregate total.' … Sets won are not
 *   consulted. Every set must be recorded, and a tied total names no winner until a deciding point
 *   breaks it." "An aggregate exactly format (XA) may record one set more than N: a level total goes
 *   to a sudden-death decider (-F:), which is set N + 1 and not one of the N sets".
 * - documentation/docs/codes/matchup-format.mdx: roots HAL/QTR/PER/RND/INN "Number of segments";
 *   `A` "Aggregate scoring across segments"; "In an XA format, -F: describes the sudden-death decider
 *   that settles level aggregate totals (SET3XA-S:T10-F:TB1)"; `T{minutes}` games-based,
 *   `T{minutes}P` points-based.
 * - documentation/docs/governors/matchup-format-governor.md, aggregateDeciderSetNumber: "-F: … governs
 *   set N + 1, never set N".
 *
 * Readings used: a segment's total is its games (G) or points (P); the aggregate is the sum of the
 * segments' totals; a timed segment closes only when its time is up (`|`); a one-point tiebreak set is
 * recorded the way a match tie-break is (`[1, 0, [1, 0]]`). `-F:TB1` is the docs' "sudden-death
 * decider", so one point decides it with or without NOAD.
 *
 * A level total with no declared decider is COMPLETED without a winner, and no further segment is
 * played (scoring-engine spec § 9.3 rule 4, § 9.7; CA 2026-10-18, decision 12). Until then these cases
 * pinned it as not complete, which is how v1 played on.
 */

const seq = (...parts: string[]) => parts.join(' ');
const END = '|';
const gameSegment = (winners: string) => seq(`g${winners}`, END);
const pointSegment = (winners: string) => seq(winners, END);

/**
 * The aggregate cases for a format of `count` segments. Side 1 takes the first segment by `count`
 * units; side 2 takes every other segment by one, so side 2 wins more segments (count ≥ 3) while
 * side 1 wins the total, `count` to `count - 1`. The level stream gives side 2 one unit more in the
 * first segment, so the totals are `count` all.
 */
function aggregateStreams(count: number, close: (winners: string) => string) {
  const first = close('1'.repeat(count));
  const others = Array.from({ length: count - 1 }, () => close('2'));
  const firstSet: SetOutcome = [count, 0];
  const otherSets = others.map((): SetOutcome => [0, 1]);
  return {
    win: { spec: seq(first, ...others), sets: [firstSet, ...otherSets] },
    unfinished: { spec: seq(first, ...others.slice(1)), sets: [firstSet, ...otherSets.slice(1)] },
    level: { spec: seq(close(`${'1'.repeat(count)}2`), ...others), sets: [[count, 1] as SetOutcome, ...otherSets] },
  };
}

function aggregateCases(code: string, count: number, close: (winners: string) => string) {
  const { win, unfinished, level } = aggregateStreams(count, close);
  segmentConforms(code, win.spec, { sets: win.sets, winningSide: 1, complete: true });
  if (count > 1) segmentConforms(code, unfinished.spec, { sets: unfinished.sets, complete: false });
  // level, with no declared decider: complete, and no winner (§ 9.7; CA 2026-10-18)
  segmentConforms(code, level.spec, { sets: level.sets, complete: true });
}

const ROOT_CODES: [string, string, number][] = [
  ['HAL', 'HAL2A-S:T45', 2],
  ['HAL', 'HAL2A-S:T30', 2],
  ['HAL', 'HAL2A-S:T20', 2],
  ['HAL', 'HAL2A-S:T15', 2],
  ['HAL', 'HAL2A-S:T25', 2],
  ['QTR', 'QTR4A-S:T12', 4],
  ['QTR', 'QTR4A-S:T10', 4],
  ['QTR', 'QTR1A-S:T10', 1],
  ['QTR', 'QTR4A-S:T8', 4],
  ['QTR', 'QTR4A-S:T15', 4],
  ['PER', 'PER3A-S:T20', 3],
  ['PER', 'PER1A-S:T5', 1],
  ['PER', 'PER2A-S:T3', 2],
  ['PER', 'PER3A-S:T3', 3],
  ['RND', 'RND12A-S:T3', 12],
  ['RND', 'RND4A-S:T3', 4],
  ['RND', 'RND6A-S:T3', 6],
  ['RND', 'RND3A-S:T5', 3],
  ['RND', 'RND5A-S:T5', 5],
  ['RND', 'RND10A-S:T3', 10],
  ['SET', 'SET3A-S:T10', 3],
  ['SET', 'SET1XA-S:T10', 1],
  ['SET', 'SET1A-S:T10', 1],
  ['SET', 'SET1A-S:T20', 1],
];

describe('bestOf+aggregate | HAL/QTR/PER/RND/SET | timed(G) — every segment played, the total decides', () => {
  it.each(ROOT_CODES)(
    'engine-defined: %s %s — the larger total over all %i segments wins, though fewer segments were won',
    (_root, code, count) => aggregateCases(code, count, gameSegment),
  );

  it('engine-defined: HAL2A-S:T45 — a big first-half lead is not a win; the second half must be played', () => {
    segmentConforms('HAL2A-S:T45', gameSegment('1111111'), { sets: [[7, 0]], complete: false });
  });

  it('engine-defined: QTR4A-S:T12 — winning three quarters of four is not consulted; the total is', () => {
    segmentConforms('QTR4A-S:T12', seq(gameSegment('1'), gameSegment('1'), gameSegment('1'), gameSegment('2222')), {
      sets: [
        [1, 0],
        [1, 0],
        [1, 0],
        [0, 4],
      ],
      winningSide: 2,
      complete: true,
    });
  });
});

describe('exactly+aggregate | INN | timed(G) — INN4XA-S:T12', () => {
  it('engine-defined: exactly four timed innings; the total decides; a level total names no winner', () => {
    aggregateCases('INN4XA-S:T12', 4, gameSegment);
  });
});

describe('exactly+aggregate | SET | timed(G) — SET{N}XA-S:T10', () => {
  it.each([
    ['SET3XA-S:T10', 3],
    ['SET4XA-S:T10', 4],
    ['SET2XA-S:T10', 2],
    ['SET9XA-S:T10', 9],
  ] as [string, number][])(
    'engine-defined: %s — all %i segments played, the total decides; a level total names no winner',
    (code, count) => aggregateCases(code, count, gameSegment),
  );
});

describe('exactly+aggregate | SET | timed(P) — SET{N}XA-S:T10P (INTENNSE)', () => {
  it.each([
    ['SET7XA-S:T10P', 7],
    ['SET5XA-S:T10P', 5],
    ['SET3XA-S:T10P', 3],
    ['SET2XA-S:T10P', 2],
  ] as [string, number][])(
    'engine-defined: %s — all %i points segments played, the point total decides; level names no winner',
    (code, count) => aggregateCases(code, count, pointSegment),
  );

  it('engine-defined: SET3XA-S:T10P — points accumulate in a segment with no target until time', () => {
    segmentConforms('SET3XA-S:T10P', '11111111111', { sets: [[11, 0]], complete: false });
  });
});

describe('exactly+aggregate | SET | timed(G) | final:tiebreakSet — -F:TB1 settles a level total', () => {
  it.each([
    ['SET3XA-S:T10-F:TB1', 3],
    ['SET2XA-S:T20-F:TB1', 2],
    ['SET2XA-S:T10-F:TB1', 2],
  ] as [string, number][])(
    'engine-defined: %s — a level total after all %i segments is not a result; an unequal one needs no decider',
    (code, count) => {
      const { level, win } = aggregateStreams(count, gameSegment);
      segmentConforms(code, level.spec, { sets: level.sets, complete: false });
      // an unequal total needs no decider: nothing past set N is recorded
      segmentConforms(code, seq(win.spec, '2'), { sets: win.sets, winningSide: 1, complete: true });
    },
  );
});

describe('exactly+aggregate | SET | timed(G) | final:tiebreakSet(noAD) — SET3XA-S:T10-F:TB1NOAD', () => {
  it('engine-defined: a level total goes to a sudden-death point as set four', () => {
    const { level } = aggregateStreams(3, gameSegment);
    segmentConforms('SET3XA-S:T10-F:TB1NOAD', seq(level.spec, '1'), {
      sets: [...level.sets, [1, 0, [1, 0]]],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('exactly+aggregate | SET | timed(G) | final:timed(P) — SET3XA-S:T10-F:T10P', () => {
  const format = 'SET3XA-S:T10-F:T10P';
  const { level, win } = aggregateStreams(3, gameSegment);

  it('engine-defined: the -F: decider is set four, timed and points-based: points do not close it', () => {
    segmentConforms(format, seq(level.spec, '112'), { sets: [...level.sets, [2, 1]], complete: false });
  });

  it('engine-defined: when the decider’s time is up the side ahead on points wins the match', () => {
    segmentConforms(format, seq(level.spec, pointSegment('112')), {
      sets: [...level.sets, [2, 1]],
      winningSide: 1,
      complete: true,
    });
  });

  it('engine-defined: the -F: format does not govern set three: an unequal total ends the match there', () => {
    segmentConforms(format, win.spec, { sets: win.sets, winningSide: 1, complete: true });
  });
});

describe('-F:TB1 — the sudden-death decider of a level aggregate', () => {
  // Definition: "In an XA format, -F: describes the sudden-death decider that settles level aggregate
  // totals (SET3XA-S:T10-F:TB1)" (matchup-format.mdx), and "a tied total names no winner until a
  // deciding point breaks it" (format-support.md). So one point after a level total decides the match.
  // Found by these cases on 2026-10-17: the engine read `TB1` by the generic rule (first to 1, win by
  // two), so a single point did not decide. A one-point target is sudden death (CA 2026-10-17); fixed.
  it.each([
    ['SET3XA-S:T10-F:TB1', 3],
    ['SET2XA-S:T20-F:TB1', 2],
    ['SET2XA-S:T10-F:TB1', 2],
  ] as [string, number][])('%s — after a level total over %i segments one point decides', (code, count) => {
    const { level } = aggregateStreams(count, gameSegment);
    segmentConforms(code, seq(level.spec, '2'), {
      sets: [...level.sets, [0, 1, [0, 1]]],
      winningSide: 2,
      complete: true,
    });
  });
});
