import { conforms } from '../../testHarness/scoringConformance/conformance';
import { describe, it } from 'vitest';

/*
 * Conformance: sets that are a single race to a target number of points (`-S:TB{n}`), the shape
 * pickleball, squash, table tennis, badminton, volleyball and esports maps all write a game in.
 * Every expected outcome below is written from the rule it cites, not recorded from the engine.
 *
 * How a tiebreak-only set is recorded (CODES; docs governors/score-governor.md, matchup-governor.md):
 * a finished one is a game won `1-0` in its game fields, with its points in the tiebreak-point fields,
 * so `11-9` reads `[1, 0, [11, 9]]`. A set still in play has no game won yet, and its running points
 * are the game in progress, not tiebreak points: `[0, 0]`, as a tennis game in play leaves a set `[0, 0]`.
 * The cases that stop short of the target say "not won"; the cases that play on say how it was won.
 *
 * Sources:
 * - CODES matchUpFormat grammar (documentation/docs/codes/matchup-format.mdx): `TB{n}` is first to n,
 *   win by two; `NOAD` is sudden death at the target (win by one); `@RALLY` is rally scoring, every
 *   rally scores whoever served; `-F:` is the final segment's format; `X` exactly N; `A` aggregate.
 * - documentation/docs/scoring-engine/format-support.md: tiebreak-only formats, "Aggregate Scoring",
 *   "Exactly N Sets". The engine does not model side-out: without `@RALLY` it scores every point it
 *   is given (decided 2026-10-17), so side-out formats are held to the race only.
 * - USA Pickleball Official Rulebook, Rule 4 (games to 11, win by 2; best of three).
 * - World Squash Singles Rules, Rule 2 (point-a-rally to 11, two clear; best of five).
 * - ITTF Handbook, Laws 2.11 (a game: first to 11, two clear at 10-all) and 2.12 (best of an odd
 *   number of games).
 * - BWF Laws of Badminton, Law 7 (21 points, two clear at 20-all; best of three). The 30-point cap is
 *   not expressible in `TB21` and is not tested.
 * - FIVB Official Volleyball Rules, Rule 6 (a set to 25 with a two-point lead; the deciding fifth set
 *   to 15 with a two-point lead; three sets win).
 * - VALORANT competitive rules: a map is first to 13 rounds; at 12-12 overtime runs until a side
 *   leads by two.
 * Codes with no rulebook are marked engine-defined and held to the CODES definition alone.
 */

/** `n` points in a row to `side`. */
const run = (side: '1' | '2', n: number) => side.repeat(n);
/** Points alternating side 1, side 2, until each side has `n`: an `n`-all score. */
const level = (n: number) => '12'.repeat(n);

describe('SET3-S:TB11 — pickleball, best of three games to 11 (USA Pickleball Rule 4; every point given counts)', () => {
  const format = 'SET3-S:TB11';

  it('Rule 4: ten points do not win a game to 11', () => {
    conforms(format, run('1', 10), { sets: [[0, 0]], complete: false });
  });

  it('Rule 4: the eleventh point wins the game when two clear', () => {
    conforms(format, run('1', 11), { sets: [[1, 0, [11, 0]]], complete: false });
    conforms(format, `${level(9)} 11`, { sets: [[1, 0, [11, 9]]], complete: false });
  });

  it('Rule 4: at 10-10 eleven points is not enough; the game goes on until two clear', () => {
    conforms(format, `${level(10)} 1`, { sets: [[0, 0]], complete: false });
    conforms(format, `${level(10)} 11`, { sets: [[1, 0, [12, 10]]], complete: false });
    conforms(format, `${level(10)} 12 12 12 11`, { sets: [[1, 0, [15, 13]]], complete: false });
  });

  it('Rule 4: two games win the match', () => {
    conforms(format, `${run('1', 11)} ${level(9)} 11`, {
      sets: [
        [1, 0, [11, 0]],
        [1, 0, [11, 9]],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('Rule 4: one game all goes to a third game', () => {
    conforms(format, `${run('1', 11)} ${run('2', 11)} ${run('1', 5)}`, {
      sets: [
        [1, 0, [11, 0]],
        [0, 1, [0, 11]],
        [0, 0],
      ],
      complete: false,
    });
    conforms(format, `${run('1', 11)} ${run('2', 11)} ${level(10)} 22`, {
      sets: [
        [1, 0, [11, 0]],
        [0, 1, [0, 11]],
        [0, 1, [10, 12]],
      ],
      winningSide: 2,
      complete: true,
    });
  });

  it('a point after the match ends changes nothing', () => {
    conforms(format, `${run('1', 11)} ${run('1', 11)} 2`, {
      sets: [
        [1, 0, [11, 0]],
        [1, 0, [11, 0]],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET5-S:TB11 — squash PAR-11, best of five (World Squash Rule 2)', () => {
  const format = 'SET5-S:TB11';

  it('Rule 2: at 10-all a game is won by two clear points', () => {
    conforms(format, `${level(10)} 21 22`, { sets: [[0, 1, [11, 13]]], complete: false });
  });

  it('Rule 2: three games win; two do not', () => {
    conforms(format, `${run('1', 11)} ${run('1', 11)}`, {
      sets: [
        [1, 0, [11, 0]],
        [1, 0, [11, 0]],
      ],
      complete: false,
    });
    conforms(format, `${run('1', 11)} ${run('2', 11)} ${run('1', 11)} ${level(9)} 11`, {
      sets: [
        [1, 0, [11, 0]],
        [0, 1, [0, 11]],
        [1, 0, [11, 0]],
        [1, 0, [11, 9]],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET7-S:TB11 — table tennis, best of seven (ITTF Laws 2.11, 2.12)', () => {
  const format = 'SET7-S:TB11';
  const game = { 1: run('1', 11), 2: run('2', 11) };

  it('Law 2.12: three games all goes to a seventh; four games win', () => {
    const threeAll = `${game[1]} ${game[2]} ${game[1]} ${game[2]} ${game[1]} ${game[2]}`;
    conforms(format, threeAll, {
      sets: [
        [1, 0, [11, 0]],
        [0, 1, [0, 11]],
        [1, 0, [11, 0]],
        [0, 1, [0, 11]],
        [1, 0, [11, 0]],
        [0, 1, [0, 11]],
      ],
      complete: false,
    });
    conforms(format, `${threeAll} ${level(10)} 11`, {
      sets: [
        [1, 0, [11, 0]],
        [0, 1, [0, 11]],
        [1, 0, [11, 0]],
        [0, 1, [0, 11]],
        [1, 0, [11, 0]],
        [0, 1, [0, 11]],
        [1, 0, [12, 10]],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET3-S:TB21 — badminton, best of three games to 21 (BWF Law 7)', () => {
  const format = 'SET3-S:TB21';

  it('Law 7: twenty points do not win; the twenty-first does', () => {
    conforms(format, run('1', 20), { sets: [[0, 0]], complete: false });
    conforms(format, `${level(19)} 11`, { sets: [[1, 0, [21, 19]]], complete: false });
  });

  it('Law 7: at 20-all the side that first gains a two-point lead wins the game', () => {
    conforms(format, `${level(20)} 1`, { sets: [[0, 0]], complete: false });
    conforms(format, `${level(20)} 12 11`, { sets: [[1, 0, [23, 21]]], complete: false });
  });

  it('Law 7: two games win the match', () => {
    conforms(format, `${run('2', 21)} ${run('2', 21)}`, {
      sets: [
        [0, 1, [0, 21]],
        [0, 1, [0, 21]],
      ],
      winningSide: 2,
      complete: true,
    });
  });
});

describe('SET1-S:TB10 — a single tiebreak to ten is the match (engine-defined: CODES TB{n})', () => {
  it('first to ten, two clear, wins the match', () => {
    conforms('SET1-S:TB10', run('1', 9), { sets: [[0, 0]], complete: false });
    conforms('SET1-S:TB10', `${level(9)} 11`, { sets: [[1, 0, [11, 9]]], winningSide: 1, complete: true });
  });
});

describe('SET5-S:TB25-F:TB15 — volleyball: sets to 25, a deciding fifth set to 15 (FIVB Rule 6)', () => {
  const format = 'SET5-S:TB25-F:TB15';
  const set = { 1: run('1', 25), 2: run('2', 25) };
  const twoAll = `${set[1]} ${set[2]} ${set[1]} ${set[2]}`;
  const twoAllSets: [number, number, [number, number]][] = [
    [1, 0, [25, 0]],
    [0, 1, [0, 25]],
    [1, 0, [25, 0]],
    [0, 1, [0, 25]],
  ];

  it('Rule 6: an ordinary set is to 25; fifteen points win nothing there', () => {
    conforms(format, run('1', 15), { sets: [[0, 0]], complete: false });
    conforms(format, run('1', 24), { sets: [[0, 0]], complete: false });
  });

  it('Rule 6: at 24-24 play continues until a two-point lead', () => {
    conforms(format, `${level(24)} 1`, { sets: [[0, 0]], complete: false });
    conforms(format, `${level(24)} 21 22`, { sets: [[0, 1, [25, 27]]], complete: false });
  });

  it('Rule 6: at two sets all the deciding set is to 15', () => {
    conforms(format, `${twoAll} ${run('1', 14)}`, {
      sets: [...twoAllSets, [0, 0]],
      complete: false,
    });
    conforms(format, `${twoAll} ${run('1', 15)}`, {
      sets: [...twoAllSets, [1, 0, [15, 0]]],
      winningSide: 1,
      complete: true,
    });
  });

  it('Rule 6: the deciding set at 14-14 also needs a two-point lead', () => {
    conforms(format, `${twoAll} ${level(14)} 1`, {
      sets: [...twoAllSets, [0, 0]],
      complete: false,
    });
    conforms(format, `${twoAll} ${level(14)} 12 22`, {
      sets: [...twoAllSets, [0, 1, [15, 17]]],
      winningSide: 2,
      complete: true,
    });
  });

  it('Rule 6: three sets win the match; the final-set format is never reached', () => {
    conforms(format, `${set[1]} ${set[1]} ${set[1]}`, {
      sets: [
        [1, 0, [25, 0]],
        [1, 0, [25, 0]],
        [1, 0, [25, 0]],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET3-S:TB15-F:TB11 — games to 15, a deciding game to 11 (engine-defined: CODES TB{n}, -F:)', () => {
  const format = 'SET3-S:TB15-F:TB11';
  const oneAll = `${run('1', 15)} ${run('2', 15)}`;
  const oneAllSets: [number, number, [number, number]][] = [
    [1, 0, [15, 0]],
    [0, 1, [0, 15]],
  ];

  it('-S:TB15: eleven points do not win an ordinary game', () => {
    conforms(format, run('1', 11), { sets: [[0, 0]], complete: false });
    conforms(format, `${level(14)} 11`, { sets: [[1, 0, [16, 14]]], complete: false });
  });

  it('-F:TB11: the deciding game is to 11, two clear', () => {
    conforms(format, `${oneAll} ${level(9)} 22`, {
      sets: [...oneAllSets, [0, 1, [9, 11]]],
      winningSide: 2,
      complete: true,
    });
    conforms(format, `${oneAll} ${level(10)} 1`, {
      sets: [...oneAllSets, [0, 0]],
      complete: false,
    });
  });
});

describe('SET3-S:TB11@RALLY — rally scoring to 11, win by two (CODES @RALLY)', () => {
  const format = 'SET3-S:TB11@RALLY';

  it('@RALLY: every rally scores, whoever served; the race is to 11, two clear', () => {
    conforms(format, run('1', 10), { sets: [[0, 0]], complete: false });
    conforms(format, `${level(9)} 11`, { sets: [[1, 0, [11, 9]]], complete: false });
    conforms(format, `${level(10)} 2`, { sets: [[0, 0]], complete: false });
    conforms(format, `${level(10)} 21 21 22`, { sets: [[0, 1, [12, 14]]], complete: false });
  });

  it('two games win the match', () => {
    conforms(format, `${run('1', 11)} ${run('2', 11)} ${level(10)} 11`, {
      sets: [
        [1, 0, [11, 0]],
        [0, 1, [0, 11]],
        [1, 0, [12, 10]],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('SET1-S:TB11@RALLY — one rally game is the match', () => {
    conforms('SET1-S:TB11@RALLY', run('2', 11), { sets: [[0, 1, [0, 11]]], winningSide: 2, complete: true });
  });
});

describe('SET5-S:TB21@RALLY-F:TB15@RALLY — MLP: four rally games to 21, a fifth to 15 (CODES pickleball table)', () => {
  const format = 'SET5-S:TB21@RALLY-F:TB15@RALLY';
  const game = { 1: run('1', 21), 2: run('2', 21) };
  const twoAll = `${game[1]} ${game[2]} ${game[1]} ${game[2]}`;
  const twoAllSets: [number, number, [number, number]][] = [
    [1, 0, [21, 0]],
    [0, 1, [0, 21]],
    [1, 0, [21, 0]],
    [0, 1, [0, 21]],
  ];

  it('an ordinary game is to 21, two clear', () => {
    conforms(format, run('1', 20), { sets: [[0, 0]], complete: false });
    conforms(format, `${level(20)} 11`, { sets: [[1, 0, [22, 20]]], complete: false });
  });

  it('the fifth game is to 15, two clear, and decides the match', () => {
    conforms(format, `${twoAll} ${level(14)} 1`, { sets: [...twoAllSets, [0, 0]], complete: false });
    conforms(format, `${twoAll} ${level(13)} 11`, {
      sets: [...twoAllSets, [1, 0, [15, 13]]],
      winningSide: 1,
      complete: true,
    });
  });

  it('three games win the match before a fifth', () => {
    conforms(format, `${game[2]} ${game[2]} ${game[2]}`, {
      sets: [
        [0, 1, [0, 21]],
        [0, 1, [0, 21]],
        [0, 1, [0, 21]],
      ],
      winningSide: 2,
      complete: true,
    });
  });
});

describe('SET3-S:TB11NOAD — no-advantage games to 11 (CODES NOAD; every point given counts)', () => {
  const format = 'SET3-S:TB11NOAD';

  it('NOAD: ten points do not win; eleven do', () => {
    conforms(format, run('1', 10), { sets: [[0, 0]], complete: false });
    conforms(format, run('1', 11), { sets: [[1, 0, [11, 0]]], complete: false });
  });

  it('NOAD: sudden death — at 10-10 the next point wins the game by one', () => {
    conforms(format, `${level(10)} 2`, { sets: [[0, 1, [10, 11]]], complete: false });
  });

  it('two games win the match', () => {
    conforms(format, `${level(10)} 1 ${level(10)} 1`, {
      sets: [
        [1, 0, [11, 10]],
        [1, 0, [11, 10]],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('SET3-S:TB15NOAD — first to 15 wins (CODES pickleball table): 15-14 is a game', () => {
    conforms('SET3-S:TB15NOAD', `${level(14)} 1`, { sets: [[1, 0, [15, 14]]], complete: false });
  });
});

describe('SET3-S:TB11NOAD@RALLY — rally games to 11, won by one (CODES @RALLY, NOAD)', () => {
  const format = 'SET3-S:TB11NOAD@RALLY';

  it('at 10-10 the next rally wins the game', () => {
    conforms(format, `${level(10)} 1`, { sets: [[1, 0, [11, 10]]], complete: false });
    conforms(format, run('2', 10), { sets: [[0, 0]], complete: false });
  });

  it('two games win the match', () => {
    conforms(format, `${run('2', 11)} ${level(10)} 2`, {
      sets: [
        [0, 1, [0, 11]],
        [0, 1, [10, 11]],
      ],
      winningSide: 2,
      complete: true,
    });
  });

  it('SET3-S:TB21NOAD@RALLY — at 20-20 the next rally wins', () => {
    conforms('SET3-S:TB21NOAD@RALLY', `${level(20)} 1`, { sets: [[1, 0, [21, 20]]], complete: false });
  });
});

describe('SET3-S:TB21NOAD@RALLY-F:TB15NOAD@RALLY — no-advantage rally games, a deciding game to 15 (CODES)', () => {
  const format = 'SET3-S:TB21NOAD@RALLY-F:TB15NOAD@RALLY';
  const oneAll = `${run('1', 21)} ${run('2', 21)}`;
  const oneAllSets: [number, number, [number, number]][] = [
    [1, 0, [21, 0]],
    [0, 1, [0, 21]],
  ];

  it('an ordinary game: fifteen points win nothing, 21-20 wins', () => {
    conforms(format, run('1', 15), { sets: [[0, 0]], complete: false });
    conforms(format, `${level(20)} 2`, { sets: [[0, 1, [20, 21]]], complete: false });
  });

  it('the deciding game is to 15 and at 14-14 the next rally wins the match', () => {
    conforms(format, `${oneAll} ${run('1', 14)}`, { sets: [...oneAllSets, [0, 0]], complete: false });
    conforms(format, `${oneAll} ${level(14)} 1`, {
      sets: [...oneAllSets, [1, 0, [15, 14]]],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET3A-S:TB11 — aggregate: every game played, the most points wins (format-support "Aggregate Scoring")', () => {
  const format = 'SET3A-S:TB11';

  it('A: two games won is not a win; every game is played', () => {
    conforms(format, `${run('1', 11)} ${run('1', 11)}`, {
      sets: [
        [1, 0, [11, 0]],
        [1, 0, [11, 0]],
      ],
      complete: false,
    });
  });

  it('A: games won are not consulted — the side with more points across all three wins', () => {
    // side 1 wins two games 11-9; side 2 wins one 11-0: points 22-29, side 2 wins with one game
    conforms(format, `${level(9)} 11 ${level(9)} 11 ${run('2', 11)}`, {
      sets: [
        [1, 0, [11, 9]],
        [1, 0, [11, 9]],
        [0, 1, [0, 11]],
      ],
      winningSide: 2,
      complete: true,
    });
  });

  it('A: a level total names no winner', () => {
    // 13-11, 0-11, 11-2: side 1 won two games, points 24-24. No decider is declared, so the match is
    // complete without a winner and no fourth game is played (spec § 9.3, § 9.7; CA 2026-10-18).
    conforms(format, `${level(11)} 11 ${run('2', 11)} ${run('2', 2)}${run('1', 11)}`, {
      sets: [
        [1, 0, [13, 11]],
        [0, 1, [0, 11]],
        [1, 0, [11, 2]],
      ],
      complete: true,
    });
  });
});

describe('HAL2X-S:TB11, HAL3X-S:TB11 — exactly N halves, each a race to 11 (format-support "Exactly N Sets")', () => {
  it('X: in HAL3X a two-halves lead is not a win while a half remains', () => {
    conforms('HAL3X-S:TB11', `${run('1', 11)} ${run('1', 11)}`, {
      sets: [
        [1, 0, [11, 0]],
        [1, 0, [11, 0]],
      ],
      complete: false,
    });
  });

  it('X: once every half is played the side with more halves wins, a sweep included', () => {
    conforms('HAL3X-S:TB11', `${run('1', 11)} ${run('1', 11)} ${level(10)} 22`, {
      sets: [
        [1, 0, [11, 0]],
        [1, 0, [11, 0]],
        [0, 1, [10, 12]],
      ],
      winningSide: 1,
      complete: true,
    });
    conforms('HAL3X-S:TB11', `${run('2', 11)} ${run('2', 11)} ${run('2', 11)}`, {
      sets: [
        [0, 1, [0, 11]],
        [0, 1, [0, 11]],
        [0, 1, [0, 11]],
      ],
      winningSide: 2,
      complete: true,
    });
  });

  it('X: each half is a race to 11, two clear', () => {
    conforms('HAL2X-S:TB11', `${level(10)} 1`, { sets: [[0, 0]], complete: false });
    conforms('HAL2X-S:TB11', `${level(10)} 11`, { sets: [[1, 0, [12, 10]]], complete: false });
  });

  it('X: in HAL2X both halves won is a win', () => {
    conforms('HAL2X-S:TB11', `${run('1', 11)} ${run('1', 11)}`, {
      sets: [
        [1, 0, [11, 0]],
        [1, 0, [11, 0]],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('FRM7-S:TB11 — table tennis best of seven under the FRM root (ITTF Laws 2.11, 2.12)', () => {
  const format = 'FRM7-S:TB11';

  it('Law 2.11: at 10-all a game needs two clear points', () => {
    conforms(format, `${level(10)} 1`, { sets: [[0, 0]], complete: false });
    conforms(format, `${level(10)} 12 11`, { sets: [[1, 0, [13, 11]]], complete: false });
  });

  it('Law 2.12: three games is not a win; four games win', () => {
    const three = `${run('1', 11)} ${run('1', 11)} ${run('1', 11)}`;
    const threeSets: [number, number, [number, number]][] = [
      [1, 0, [11, 0]],
      [1, 0, [11, 0]],
      [1, 0, [11, 0]],
    ];
    conforms(format, three, { sets: threeSets, complete: false });
    conforms(format, `${three} ${level(9)} 11`, {
      sets: [...threeSets, [1, 0, [11, 9]]],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('MAP3-S:TB13, MAP5-S:TB13 — esports maps first to 13 rounds (VALORANT competitive rules)', () => {
  it('a map is first to 13 rounds; twelve win nothing', () => {
    conforms('MAP3-S:TB13', run('1', 12), { sets: [[0, 0]], complete: false });
    conforms('MAP3-S:TB13', `${level(11)} 22`, { sets: [[0, 1, [11, 13]]], complete: false });
  });

  it('overtime at 12-12: the map goes on until a side leads by two rounds', () => {
    conforms('MAP3-S:TB13', `${level(12)} 1`, { sets: [[0, 0]], complete: false });
    conforms('MAP3-S:TB13', `${level(12)} 12 21 11`, { sets: [[1, 0, [16, 14]]], complete: false });
  });

  it('two maps win a best of three; three a best of five', () => {
    conforms('MAP3-S:TB13', `${run('1', 13)} ${run('2', 13)} ${run('1', 13)}`, {
      sets: [
        [1, 0, [13, 0]],
        [0, 1, [0, 13]],
        [1, 0, [13, 0]],
      ],
      winningSide: 1,
      complete: true,
    });
    conforms('MAP5-S:TB13', `${run('2', 13)} ${run('2', 13)}`, {
      sets: [
        [0, 1, [0, 13]],
        [0, 1, [0, 13]],
      ],
      complete: false,
    });
  });
});

// Exactly N is a format on every root and every kind of set (CA 2026-10-25): the SET root reads as HAL does.
describe('SET3X-S:TB11, SET2X-S:TB10 — exactly N tiebreak sets on the SET root', () => {
  it('X: a two-set lead is not a win while a set remains', () => {
    conforms('SET3X-S:TB11', `${run('1', 11)} ${run('1', 11)}`, {
      sets: [
        [1, 0, [11, 0]],
        [1, 0, [11, 0]],
      ],
      complete: false,
    });
  });

  it('X: once every set is played the side with more sets wins', () => {
    conforms('SET3X-S:TB11', `${run('1', 11)} ${run('1', 11)} ${run('2', 11)}`, {
      sets: [
        [1, 0, [11, 0]],
        [1, 0, [11, 0]],
        [0, 1, [0, 11]],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('X: a level count of sets names no winner, and no set beyond N is recorded', () => {
    conforms('SET2X-S:TB10', `${run('1', 10)} ${run('2', 10)} 1`, {
      sets: [
        [1, 0, [10, 0]],
        [0, 1, [0, 10]],
      ],
      complete: true,
    });
  });
});

describe('SET3XA-S:TB11 — exactly three tiebreak sets, aggregate (spec § 9.3)', () => {
  const format = 'SET3XA-S:TB11';

  it('XA: games won are not consulted — the side with more points across all three wins', () => {
    conforms(format, `${level(9)} 11 ${level(9)} 11 ${run('2', 11)}`, {
      sets: [
        [1, 0, [11, 9]],
        [1, 0, [11, 9]],
        [0, 1, [0, 11]],
      ],
      winningSide: 2,
      complete: true,
    });
  });

  it('XA: a level total with no declared decider names no winner, and no fourth set is played', () => {
    conforms(format, `${level(11)} 11 ${run('2', 11)} ${run('2', 2)}${run('1', 11)}`, {
      sets: [
        [1, 0, [13, 11]],
        [0, 1, [0, 11]],
        [1, 0, [11, 2]],
      ],
      complete: true,
    });
  });
});

describe('HAL2X-S:TB11 — a level count of halves (format-support "Exactly N Sets")', () => {
  /*
   * A non-aggregate exactly format is decided on sets won once all N are recorded; a level count names
   * no winner, and no set beyond N is recorded. Found by these cases on 2026-10-17: the engine named
   * side 1 the winner of a level match (both sides had reached setsToWin); fixed. A level count is
   * COMPLETED without a winner, with no declared decider (spec § 9.2 rule 3, § 9.7; CA 2026-10-18,
   * decision 18); these pinned it as not complete until then.
   */
  it('X: a level count of halves names no winner', () => {
    conforms('HAL2X-S:TB11', `${run('1', 11)} ${run('2', 11)}`, {
      sets: [
        [1, 0, [11, 0]],
        [0, 1, [0, 11]],
      ],
      complete: true,
    });
  });

  it('X: no half beyond N is recorded', () => {
    conforms('HAL2X-S:TB11', `${run('1', 11)} ${run('2', 11)} 1`, {
      sets: [
        [1, 0, [11, 0]],
        [0, 1, [0, 11]],
      ],
      complete: true,
    });
  });
});
