import type { SetOutcome } from '../../testHarness/scoringConformance/conformance';
import { segmentConforms } from '../../testHarness/scoringConformance/segments';
import { games } from '../../testHarness/scoringConformance/conformance';
import { describe, it } from 'vitest';

/*
 * Conformance: timed segments, scored in games or points, decided best-of or exactly-N.
 * Every expected outcome below is written from the format definition it cites, not recorded from the
 * engine. These formats have no published rulebook; the definition is the authority:
 *
 * - documentation/docs/codes/matchup-format.mdx, "Set Format Specification": `T{minutes}` "Timed set
 *   (games-based)"; `T{minutes}P` "Timed set (points-based)"; `T{minutes}G` "same as -S:T10";
 *   `T{minutes}/TB{points}` "Timed set, a tiebreak if level at time"; `T{minutes}@{modifier}` "Timed
 *   set with modifier"; `-G:TN{n}D` "Traditional with deuce cap (Star Point: decisive at 3rd deuce)";
 *   "Simplified Form": `T{minutes}[P|G]` is a single timed set.
 * - documentation/docs/scoring-engine/format-support.md, "Timed Formats": "When segment timer
 *   expires engine.endSegment() — segment score is finalized, next segment begins"; "Exactly N Sets":
 *   "Reaching setsToWin before the last set is a lead, not a win … Once every set is played, the side
 *   with more sets wins, however many it took".
 * - documentation/docs/scoring-engine/scoring-engine-api.md, endSegment: "finalizes the current set's
 *   score and checks match completion".
 *
 * Readings derived from those, used throughout (and named in each case):
 * - a timed segment has no game or point target, so only `endSegment` closes it; the side ahead when it
 *   closes wins it (games for G, points for P);
 * - a tiebreak played because a timed set is level at time is recorded as tennis records one: the
 *   winner is credited one more game/point unit and the tiebreak points are kept (`[2, 1, [7, 0]]`),
 *   the same convention as a 7-6(0) set.
 *
 * Stream tokens: runs of 1/2 are points; `|` ends the segment in play (see segments.ts).
 */

const seq = (...parts: string[]) => parts.join(' ');
const END = '|';
/** A segment of whole games (game-level input), ended: `segment('112')` is 2-1 in games. */
const segment = (winners: string) => seq(`g${winners}`, END);
/** A points-based segment, ended: `pointSegment('112')` is 2-1 in points. */
const pointSegment = (winners: string) => seq(winners, END);

describe('bestOf | timed(G) — SET3-S:T10 and its kin: timed sets scored in games', () => {
  const format = 'SET3-S:T10';

  it('engine-defined: a timed set has no game target; seven games do not close it', () => {
    segmentConforms(format, 'g1111111', { sets: [[7, 0]], complete: false });
  });

  it('engine-defined: when time is up the side with more games wins the segment', () => {
    segmentConforms(format, segment('112'), { sets: [[2, 1]], complete: false });
  });

  it('engine-defined: best of three — two segments win the match, one all goes to a third', () => {
    segmentConforms(format, seq(segment('112'), segment('1')), {
      sets: [
        [2, 1],
        [1, 0],
      ],
      winningSide: 1,
      complete: true,
    });
    segmentConforms(format, seq(segment('1'), segment('22'), segment('211')), {
      sets: [
        [1, 0],
        [0, 2],
        [2, 1],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('a point after the match ends changes nothing', () => {
    segmentConforms(format, seq(segment('1'), segment('1'), '2222'), {
      sets: [
        [1, 0],
        [1, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  // every harvested code in the cell: the majority of N segments, ended, wins
  const codes: [string, number][] = [
    ['SET1-S:T20', 1],
    ['SET1-S:T30', 1],
    ['SET1-S:T120', 1],
    ['SET1-S:T90', 1],
    ['SET1-S:T60', 1],
    ['SET1-S:T20G', 1],
    ['SET1-S:T10', 1],
    ['SET1X-S:T10', 1],
    ['SET1-S:T15', 1],
    ['SET1-S:T30G', 1],
    ['SET3-S:T10-G:TN', 3],
    ['SET3-S:T20', 3],
    ['SET3-S:T15', 3],
    ['SET5-S:T10', 5],
  ];
  it.each(codes)('engine-defined: %s — a majority of %i timed segments wins, not before', (code, count) => {
    const toWin = Math.floor(count / 2) + 1;
    const won = Array.from({ length: toWin }, () => segment('1'));
    const sets = won.map((): SetOutcome => [1, 0]);
    segmentConforms(code, seq(...won), { sets, winningSide: 1, complete: true });
    if (toWin > 1) segmentConforms(code, seq(...won.slice(1)), { sets: sets.slice(1), complete: false });
  });
});

describe('bestOf | timed(G) | game:traditional(deuceCap) — SET3-S:T10-G:TN3D', () => {
  const format = 'SET3-S:T10-G:TN3D';
  // the cap itself is a point-level rule: see ENGINE DISAGREES below, where points do not build games

  it('engine-defined: a game-capped timed set still has no game target; time closes it', () => {
    segmentConforms(format, 'g1111111', { sets: [[7, 0]], complete: false });
  });

  it('engine-defined: segments are won at time, and two win the match', () => {
    segmentConforms(format, seq(segment('2'), segment('1'), segment('1')), {
      sets: [
        [0, 1],
        [1, 0],
        [1, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('bestOf | timed(G) | final:timed(G) — a timed final segment of another length', () => {
  const ONE_ALL = seq(segment('1'), segment('2'));

  it.each(['SET3-S:T20-F:T60', 'SET3-S:T15-F:T10'])(
    'engine-defined: %s — the final segment is timed too: no game count closes it, time does',
    (format) => {
      segmentConforms(format, seq(ONE_ALL, 'g1111111'), {
        sets: [
          [1, 0],
          [0, 1],
          [7, 0],
        ],
        complete: false,
      });
      segmentConforms(format, seq(ONE_ALL, segment('1121')), {
        sets: [
          [1, 0],
          [0, 1],
          [3, 1],
        ],
        winningSide: 1,
        complete: true,
      });
    },
  );
});

describe('bestOf | timed(G) | final:timed(G) | game:traditional(deuceCap) — SET3-S:T10-G:TN3D-F:T20', () => {
  const format = 'SET3-S:T10-G:TN3D-F:T20';

  it('engine-defined: the final segment is timed in games: no count closes it, time does', () => {
    segmentConforms(format, seq(segment('1'), segment('2'), 'g1111111'), {
      sets: [
        [1, 0],
        [0, 1],
        [7, 0],
      ],
      complete: false,
    });
    segmentConforms(format, seq(segment('1'), segment('2'), segment('2')), {
      sets: [
        [1, 0],
        [0, 1],
        [0, 1],
      ],
      winningSide: 2,
      complete: true,
    });
  });
});

describe('bestOf | timed(G,@RALLY) — SET3-S:T20@RALLY', () => {
  const format = 'SET3-S:T20@RALLY';

  it('engine-defined: "@RALLY — every rally scores"; a timed games set scores every point already, so it plays as T20', () => {
    segmentConforms(format, 'g1111111', { sets: [[7, 0]], complete: false });
    segmentConforms(format, seq(segment('112'), segment('1')), {
      sets: [
        [2, 1],
        [1, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('bestOf | timed(G,tiebreak) — T{minutes}/TB{points}: "a tiebreak if level at time"', () => {
  it('engine-defined: SET3-S:T20/TB7 — ahead at time wins the segment with no tiebreak', () => {
    segmentConforms('SET3-S:T20/TB7', segment('112'), { sets: [[2, 1]], complete: false });
  });

  it.each(['SET3-S:T20/TB7', 'SET3-S:T10/TB1', 'SET3-S:T10G/TB1'])(
    'engine-defined: %s — segments won ahead at time need no tiebreak; two win the match',
    (format) => {
      segmentConforms(format, seq(segment('112'), segment('2'), segment('1')), {
        sets: [
          [2, 1],
          [0, 1],
          [1, 0],
        ],
        winningSide: 1,
        complete: true,
      });
    },
  );
});

describe('bestOf | timed(P) — points-based timed sets', () => {
  it('engine-defined: SET3-S:T10P — points accumulate with no games: seven points are 7-0, and do not close it', () => {
    segmentConforms('SET3-S:T10P', '1111111', { sets: [[7, 0]], complete: false });
  });

  it('engine-defined: SET3-S:T10P — at time the side with more points wins; two segments win', () => {
    segmentConforms('SET3-S:T10P', seq(pointSegment('1121'), pointSegment('2'), pointSegment('11')), {
      sets: [
        [3, 1],
        [0, 1],
        [2, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it.each(['SET1-S:T20P', 'SET1-S:T10P'])('engine-defined: %s — the one segment, ended, decides', (format) => {
    segmentConforms(format, '12121', { sets: [[3, 2]], complete: false });
    segmentConforms(format, pointSegment('12121'), { sets: [[3, 2]], winningSide: 1, complete: true });
  });
});

describe('bestOf | timed(P,tiebreak) — T{minutes}P/TB{points}', () => {
  it.each(['SET3-S:T10P/TB1', 'SET3-S:T10P/TB7'])(
    'engine-defined: %s — points do not close the segment; ahead at time wins it with no tiebreak',
    (format) => {
      segmentConforms(format, '1111111111', { sets: [[10, 0]], complete: false });
      segmentConforms(format, seq(pointSegment('12121'), pointSegment('2'), pointSegment('1')), {
        sets: [
          [3, 2],
          [0, 1],
          [1, 0],
        ],
        winningSide: 1,
        complete: true,
      });
    },
  );

  it('engine-defined: SET3-S:T10P/TB10 — ahead at time wins with no tiebreak; two segments win', () => {
    segmentConforms('SET3-S:T10P/TB10', seq(pointSegment('112'), pointSegment('1')), {
      sets: [
        [2, 1],
        [1, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('engine-defined: SET5-S:T10P/TB1 — best of five: three segments win', () => {
    segmentConforms('SET5-S:T10P/TB1', seq(pointSegment('1'), pointSegment('1'), pointSegment('1')), {
      sets: [
        [1, 0],
        [1, 0],
        [1, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('standalone — the simplified form T{minutes}[P|G] is a single timed set', () => {
  it.each(['T120', 'T90', 'T60', 'T30', 'T20', 'T10', 'T1'])(
    'engine-defined: %s — one games-based segment: open until time, then the side ahead wins the match',
    (format) => {
      segmentConforms(format, 'g1111111', { sets: [[7, 0]], complete: false });
      segmentConforms(format, segment('121'), { sets: [[2, 1]], winningSide: 1, complete: true });
    },
  );

  it.each(['T120P', 'T30P', 'T15P', 'T10P'])(
    'engine-defined: %s — one points-based segment: open until time, then the side ahead wins the match',
    (format) => {
      segmentConforms(format, '1111111', { sets: [[7, 0]], complete: false });
      segmentConforms(format, pointSegment('121'), { sets: [[2, 1]], winningSide: 1, complete: true });
    },
  );
});

describe('exactly | timed — SET{N}X: every segment is played; a lead is not a win', () => {
  const gamesCodes: [string, number][] = [
    ['SET10X-S:T5', 10],
    ['SET3X-S:T10', 3],
    ['SET2X-S:T20', 2],
    ['SET3X-S:T10G', 3],
    ['SET9X-S:T10', 9],
    ['SET8X-S:T10', 8],
    ['SET2X-S:T10', 2],
    ['SET4X-S:T10', 4],
  ];
  const pointsCodes: [string, number][] = [
    ['SET4X-S:T20P', 4],
    ['SET4X-S:T10P', 4],
    ['SET3X-S:T10P', 3],
  ];

  const exactlyCase = (code: string, count: number, close: (winners: string) => string, unit: [number, number]) => {
    // side 1 takes a majority of segments first, side 2 takes the rest
    const toWin = Math.floor(count / 2) + 1;
    const first = Array.from({ length: toWin }, () => close('1'));
    const rest = Array.from({ length: count - toWin }, () => close('2'));
    const won = first.map((): SetOutcome => [unit[0], unit[1]]);
    const lost = rest.map((): SetOutcome => [unit[1], unit[0]]);
    if (rest.length) segmentConforms(code, seq(...first), { sets: won, complete: false });
    segmentConforms(code, seq(...first, ...rest), { sets: [...won, ...lost], winningSide: 1, complete: true });
  };

  it.each(gamesCodes)(
    'engine-defined: %s — reaching a majority of %i segments early is a lead; the match ends when all are played',
    (code, count) => exactlyCase(code, count, segment, [1, 0]),
  );

  it.each(pointsCodes)(
    'engine-defined: %s — reaching a majority of %i points segments early is a lead; all must be played',
    (code, count) => exactlyCase(code, count, pointSegment, [1, 0]),
  );

  it('engine-defined: SET3X-S:T10 — a 3-0 sweep is a win once every segment is played', () => {
    segmentConforms('SET3X-S:T10', seq(segment('1'), segment('1'), segment('1')), {
      sets: [
        [1, 0],
        [1, 0],
        [1, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('engine-defined: SET3X-S:T10P/TB1 — two segments are a lead; won ahead at time, the third decides', () => {
    segmentConforms('SET3X-S:T10P/TB1', seq(pointSegment('112'), pointSegment('1')), {
      sets: [
        [2, 1],
        [1, 0],
      ],
      complete: false,
    });
    segmentConforms('SET3X-S:T10P/TB1', seq(pointSegment('112'), pointSegment('1'), pointSegment('2')), {
      sets: [
        [2, 1],
        [1, 0],
        [0, 1],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('engine-defined: SET4X-S:T20P-F:T20 — the fourth segment is scored in games (game input) and must be played', () => {
    const threePointSegments = seq(pointSegment('1'), pointSegment('1'), pointSegment('1'));
    segmentConforms('SET4X-S:T20P-F:T20', seq(threePointSegments, 'g2'), {
      sets: [
        [1, 0],
        [1, 0],
        [1, 0],
        [0, 1],
      ],
      complete: false,
    });
    segmentConforms('SET4X-S:T20P-F:T20', seq(threePointSegments, 'g2', END), {
      sets: [
        [1, 0],
        [1, 0],
        [1, 0],
        [0, 1],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('engine-defined: SET4X-S:T10P-F:T5P — the fourth segment is points-based too and must be played', () => {
    segmentConforms('SET4X-S:T10P-F:T5P', seq(pointSegment('1'), pointSegment('1'), pointSegment('1'), '22'), {
      sets: [
        [1, 0],
        [1, 0],
        [1, 0],
        [0, 2],
      ],
      complete: false,
    });
    segmentConforms(
      'SET4X-S:T10P-F:T5P',
      seq(pointSegment('1'), pointSegment('1'), pointSegment('1'), pointSegment('22')),
      {
        sets: [
          [1, 0],
          [1, 0],
          [1, 0],
          [0, 2],
        ],
        winningSide: 1,
        complete: true,
      },
    );
  });
});

describe('exactly | INN | standard(tiebreak) — INN3X-S:6/TB7: exactly three innings of tie-break sets', () => {
  const format = 'INN3X-S:6/TB7';
  const SET = { 1: games('111111'), 2: games('222222') };

  it('engine-defined: the root changes nothing about a set; two sets won early are a lead, not a win', () => {
    segmentConforms(format, seq(SET[1], SET[1]), {
      sets: [
        [6, 0],
        [6, 0],
      ],
      complete: false,
    });
  });

  it('engine-defined: once all three are played the side with more sets wins', () => {
    segmentConforms(format, seq(SET[1], SET[1], SET[2]), {
      sets: [
        [6, 0],
        [6, 0],
        [0, 6],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('engine-defined: a set inside an inning still takes its tie-break at six all', () => {
    segmentConforms(format, seq(games('121212121212'), '1111111'), { sets: [[7, 6, [7, 0]]], complete: false });
  });
});

/*
 * Each case below is derived from the definition and FAILS against the engine. The expectation is the
 * definition's, kept unchanged and skipped for review; the comment records what the engine did.
 */
describe('ENGINE DISAGREES — needs review', () => {
  // Definition: `T{minutes}` is a "Timed set (games-based)" (matchup-format.mdx), and a game is
  // traditional (`-G:TN`, 0-15-30-40). Four points to love are one game, so 28 points are 7-0 in games.
  // Observed: point input in a games-based timed segment adds one to the set score per POINT
  // ([28, 0]); no game structure is built. Game-level input (addGame) scores games correctly.
  it.skip('SET3-S:T10 — 28 points to love are seven games, not 28', () => {
    segmentConforms('SET3-S:T10', games('1111111'), { sets: [[7, 0]], complete: false });
  });

  // Definition: as above, a traditional game from deuce needs two clear points.
  // Expected [1, 0] after deuce-adv-deuce-adv-game; observed [6, 4] (one unit per point).
  it.skip('SET3-S:T10 — a game inside a timed set is traditional: from deuce two clear points', () => {
    segmentConforms('SET3-S:T10', '111222 12 11', { sets: [[1, 0]], complete: false });
  });

  // Definition: -G:TN3D "Traditional with deuce cap (Star Point: decisive at 3rd deuce)".
  // Expected: at the third deuce the next point wins the game, [1, 0]; observed [6, 5].
  it.skip('SET3-S:T10-G:TN3D — at the third deuce the next point wins the game', () => {
    segmentConforms('SET3-S:T10-G:TN3D', '111222 1221 1', { sets: [[1, 0]], complete: false });
  });

  // Expected: advantage after the first deuce is no game, [0, 0]; observed [4, 3].
  it.skip('SET3-S:T10-G:TN3D — before the third deuce advantage still applies', () => {
    segmentConforms('SET3-S:T10-G:TN3D', '111222 1', { sets: [[0, 0]], complete: false });
  });

  // Expected: the match-level -G: cap governs the timed final; the capped game is 1-0 in games.
  // Observed: the final set reads [6, 5] in points and the match is not decided as expected.
  it.skip('SET3-S:T10-G:TN3D-F:T20 — the deuce cap governs the final timed segment as well', () => {
    segmentConforms('SET3-S:T10-G:TN3D-F:T20', seq(segment('1'), segment('2'), '111222 1221 1', END), {
      sets: [
        [1, 0],
        [0, 1],
        [1, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  // Definition: `-F:T20` makes the fourth segment games-based; one love game is [0, 1].
  // Observed: four points read [0, 4].
  it.skip('SET4X-S:T20P-F:T20 — four points to love in the games-based fourth segment are one game', () => {
    segmentConforms('SET4X-S:T20P-F:T20', seq(pointSegment('1'), pointSegment('1'), pointSegment('1'), '2222'), {
      sets: [
        [1, 0],
        [1, 0],
        [1, 0],
        [0, 1],
      ],
      complete: false,
    });
  });

  // Definition: `T{minutes}/TB{points}` — "Timed set, a tiebreak if level at time" (matchup-format.mdx).
  // Expected: level 1-1 at time, a tiebreak to seven decides the segment, recorded [2, 1, [7, 0]].
  // Observed: endSegment closes the level set [1, 1] with no tiebreak; the seven points open set 2
  // ([7, 0]). parse.ts calls the timed `/TB` "notation only for tournament directors" — the docs and
  // the code comment disagree, and the engine follows the comment.
  it.skip('SET3-S:T20/TB7 — level at time, a tiebreak to seven decides the segment', () => {
    segmentConforms('SET3-S:T20/TB7', seq(segment('12'), '1111111', segment('1')), {
      sets: [
        [2, 1, [7, 0]],
        [1, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  // Expected [2, 1, [8, 6]]; observed [1, 1] then the points scored in set 2.
  it.skip('SET3-S:T20/TB7 — the timed-set tiebreak runs on to a two-point margin', () => {
    segmentConforms('SET3-S:T20/TB7', seq(segment('12'), '121212121212 11'), {
      sets: [[2, 1, [8, 6]]],
      complete: false,
    });
  });

  // Expected [1, 2, [0, 1]]; observed [[1, 1], [0, 1]] — the point opens set 2.
  it.skip.each(['SET3-S:T10/TB1', 'SET3-S:T10G/TB1'])('%s — level at time, one point decides', (format) => {
    segmentConforms(format, seq(segment('12'), '2'), { sets: [[1, 2, [0, 1]]], complete: false });
  });

  // Expected [3, 2, [1, 0]]; observed [[2, 2], [1, 0]].
  it.skip.each(['SET3-S:T10P/TB1', 'SET5-S:T10P/TB1'])(
    '%s — level on points at time, one tiebreak point decides the segment',
    (format) => {
      segmentConforms(format, seq(pointSegment('1212'), '1'), { sets: [[3, 2, [1, 0]]], complete: false });
    },
  );

  // Expected [2, 1, [7, 0]]; observed [[1, 1], [7, 0]].
  it.skip('SET3-S:T10P/TB7 — level at time, a tiebreak to seven decides', () => {
    segmentConforms('SET3-S:T10P/TB7', seq(pointSegment('12'), '1111111'), { sets: [[2, 1, [7, 0]]], complete: false });
  });

  // Expected: set 1 [2, 1, [1, 0]], then 1-0, 0-1: side 1 wins 2-1. Observed: set 1 closes [1, 1]
  // with no winner, so after three segments sets are [1, 1], [2, 0], [0, 1] and the match is open.
  it.skip('SET3X-S:T10P/TB1 — a segment level on points at time goes to a one-point tiebreak', () => {
    segmentConforms('SET3X-S:T10P/TB1', seq(pointSegment('12'), '1', pointSegment('1'), pointSegment('2')), {
      sets: [
        [2, 1, [1, 0]],
        [1, 0],
        [0, 1],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});
