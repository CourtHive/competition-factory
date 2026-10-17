import { conforms, games } from '../../testHarness/scoringConformance/conformance';
import { describe, it } from 'vitest';

/*
 * Conformance: tie-break sets that differ from the standard set — an early (or late) tie-break,
 * No-Ad games, a sudden-death tie-break, the one-game set, the consecutive-points game and the deuce
 * cap — and their final-set variants.
 * Every expected outcome below is written from the rule it cites, not recorded from the engine.
 *
 * Sources: ITF Rules of Tennis 2026 — Rule 5 (score in a game), Rule 5(b) (tie-break game), Rule 6
 * (score in a set), Rule 7 (score in a match), and the appendix of alternative procedures and scoring
 * methods (Appendix VI in the 2026 edition): the No-Ad game (a deciding point at deuce); short sets
 * (first to four games by two, a tie-break at four all or, alternatively, at three all); the match
 * tie-break in lieu of the final set. Formats no rulebook publishes are scored from the factory's
 * grammar (`documentation/docs/codes/matchup-format.mdx`: `@N` is the tie-break at N games all;
 * `TB{n}NOAD` a tie-break won by one at the target; `-G:{n}C` a game won by `n` points in a row;
 * `-G:TN{n}D` a traditional game whose `n`th deuce is decided by the next point — `3D` is Padel's star
 * point, up to two advantages) and are marked `engine-defined`.
 */

const DEUCE = '111222';

/** `n` games all, every game won to love, the sides alternating. */
const gamesAll = (n: number) => games('12'.repeat(n));

/** A set won to love by `side` in a format whose games are four points. */
const loveSet = (side: '1' | '2', count: number) => games(side.repeat(count));

/** Games won by `n` straight points, in order. */
const runs = (winners: string, n: number) => [...winners.replaceAll(' ', '')].map((side) => side.repeat(n)).join(' ');

describe('SET3-S:4/TB5@3 — short sets, tie-break at three all (Appendix VI short sets, alternative)', () => {
  const format = 'SET3-S:4/TB5@3';

  it('short sets: four games with a margin of two win the set (4-2); 3-2 does not', () => {
    conforms(format, games('12121'), { sets: [[3, 2]], complete: false });
    conforms(format, games('121211'), { sets: [[4, 2]], complete: false });
  });

  it('short sets: at three all a tie-break decides the set — first to five points', () => {
    conforms(format, `${gamesAll(3)} 11111`, { sets: [[4, 3, [5, 0]]], complete: false });
  });

  it('Rule 5(b): a five-point tie-break without NOAD still needs a margin of two', () => {
    conforms(format, `${gamesAll(3)} ${'12'.repeat(4)} 22`, { sets: [[3, 4, [4, 6]]], complete: false });
  });

  it('Rule 7: two sets win the match', () => {
    conforms(format, `${gamesAll(3)} 11111 ${games('121211')}`, {
      sets: [
        [4, 3, [5, 0]],
        [4, 2],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('SET3-S:6/TB7@5 — a tie-break at five all: 6-4 wins outright, 5-5 goes to the tie-break', () => {
    conforms('SET3-S:6/TB7@5', games('1212121211'), { sets: [[6, 4]], complete: false });
    conforms('SET3-S:6/TB7@5', `${gamesAll(5)} 2222222`, { sets: [[5, 6, [0, 7]]], complete: false });
  });

  it('SET1-S:8/TB7@7 — a pro set with the tie-break at seven all: 7-6 is not the match', () => {
    conforms('SET1-S:8/TB7@7', games('1212121212121'), { sets: [[7, 6]], complete: false });
    conforms('SET1-S:8/TB7@7', games('12121212121211'), { sets: [[8, 6]], winningSide: 1, complete: true });
    conforms('SET1-S:8/TB7@7', `${gamesAll(7)} 1111111`, { sets: [[8, 7, [7, 0]]], winningSide: 1, complete: true });
  });

  it('SET3-S:6/TB7@12 — a late tie-break: six all plays on as an advantage set until twelve all', () => {
    conforms('SET3-S:6/TB7@12', `${gamesAll(6)} ${games('1')}`, { sets: [[7, 6]], complete: false });
    conforms('SET3-S:6/TB7@12', `${gamesAll(6)} ${games('11')}`, { sets: [[8, 6]], complete: false });
    conforms('SET3-S:6/TB7@12', `${gamesAll(12)} 1111111`, { sets: [[13, 12, [7, 0]]], complete: false });
  });
});

describe('SET3-S:4/TB7@3-F:TB7 — short sets, a seven-point tie-break in lieu of the final set', () => {
  const format = 'SET3-S:4/TB7@3-F:TB7';

  it('at three all a seven-point tie-break decides the set', () => {
    conforms(format, `${gamesAll(3)} ${'12'.repeat(6)} 11`, { sets: [[4, 3, [8, 6]]], complete: false });
  });

  it('at one set all a seven-point tie-break, by two, decides the match', () => {
    conforms(format, `${loveSet('1', 4)} ${loveSet('2', 4)} ${'12'.repeat(6)} 22`, {
      sets: [
        [4, 0],
        [0, 4],
        [0, 1, [6, 8]],
      ],
      winningSide: 2,
      complete: true,
    });
  });
});

describe('SET3-S:4NOAD/TB7@3 — short sets of No-Ad games, tie-break at three all (Appendix VI)', () => {
  const format = 'SET3-S:4NOAD/TB7@3';

  it('No-Ad: at deuce the next point wins the game', () => {
    conforms(format, `${DEUCE} 2`, { sets: [[0, 1]], complete: false });
    conforms(format, DEUCE, { sets: [[0, 0]], complete: false });
  });

  it('short sets: 3-2 is not a set, 4-2 is', () => {
    conforms(format, games('12121'), { sets: [[3, 2]], complete: false });
    conforms(format, games('121211'), { sets: [[4, 2]], complete: false });
  });

  it('Rule 5(b): the tie-break at three all is to seven by two — No-Ad games do not make it sudden death', () => {
    conforms(format, `${gamesAll(3)} ${'12'.repeat(6)} 11`, { sets: [[4, 3, [8, 6]]], complete: false });
  });

  it('Rule 7: two sets win the match', () => {
    conforms(format, `${games('121211')} ${gamesAll(3)} 1111111`, {
      sets: [
        [4, 2],
        [4, 3, [7, 0]],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET3-S:4NOAD/TB5@3-F:TB10 — No-Ad short sets, a match tie-break in lieu of the final set', () => {
  const format = 'SET3-S:4NOAD/TB5@3-F:TB10';

  it('at three all a five-point tie-break by two decides the set', () => {
    conforms(format, `${gamesAll(3)} 11111`, { sets: [[4, 3, [5, 0]]], complete: false });
    conforms(format, `${gamesAll(3)} ${'12'.repeat(4)} 11`, { sets: [[4, 3, [6, 4]]], complete: false });
  });

  it('Appendix VI: at one set all a match tie-break to ten, by two, decides the match', () => {
    const oneSetAll = `${loveSet('1', 4)} ${loveSet('2', 4)}`;
    conforms(format, `${oneSetAll} ${'1'.repeat(10)}`, {
      sets: [
        [4, 0],
        [0, 4],
        [1, 0, [10, 0]],
      ],
      winningSide: 1,
      complete: true,
    });
    conforms(format, `${oneSetAll} ${'12'.repeat(9)} 22`, {
      sets: [
        [4, 0],
        [0, 4],
        [0, 1, [9, 11]],
      ],
      winningSide: 2,
      complete: true,
    });
  });
});

describe('SET5-S:5NOAD/TB9NOAD@4 — World TeamTennis: No-Ad games, a sudden-death tie-break at four all', () => {
  const format = 'SET5-S:5NOAD/TB9NOAD@4';

  it('No-Ad: at deuce the next point wins the game', () => {
    conforms(format, `${DEUCE} 1`, { sets: [[1, 0]], complete: false });
  });

  it('engine-defined: five games two clear win the set (5-3); 4-3 does not', () => {
    conforms(format, games('1212121'), { sets: [[4, 3]], complete: false });
    conforms(format, games('12121211'), { sets: [[5, 3]], complete: false });
  });

  it('engine-defined: TB9NOAD — the tie-break at four all is won at nine, by one (9-8)', () => {
    conforms(format, `${gamesAll(4)} ${'12'.repeat(8)} 1`, { sets: [[5, 4, [9, 8]]], complete: false });
    conforms(format, `${gamesAll(4)} ${'2'.repeat(9)}`, { sets: [[4, 5, [0, 9]]], complete: false });
  });

  it('Rule 7: three sets win a best-of-five match', () => {
    const set = loveSet('1', 5);
    conforms(format, `${set} ${set}`, {
      sets: [
        [5, 0],
        [5, 0],
      ],
      complete: false,
    });
    conforms(format, `${set} ${set} ${gamesAll(4)} ${'12'.repeat(8)} 1`, {
      sets: [
        [5, 0],
        [5, 0],
        [5, 4, [9, 8]],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET1-S:6/TB5NOAD@5 — one set, a sudden-death five-point tie-break at five all', () => {
  const format = 'SET1-S:6/TB5NOAD@5';

  it('Rule 5: games are advantage games', () => {
    conforms(format, `${DEUCE} 1`, { sets: [[0, 0]], complete: false });
  });

  it('5-4 is not the set; 6-4 is, and ends the match', () => {
    conforms(format, games('121212121'), { sets: [[5, 4]], complete: false });
    conforms(format, games('1212121211'), { sets: [[6, 4]], winningSide: 1, complete: true });
  });

  it('Appendix VI short set tie-break: at four points all a deciding point wins it (5-4)', () => {
    conforms(format, `${gamesAll(5)} ${'12'.repeat(4)} 2`, { sets: [[5, 6, [4, 5]]], winningSide: 2, complete: true });
  });
});

describe('SET3-S:6NOAD/TB7 — No-Ad games in tie-break sets (Appendix VI No-Ad; Rules 5(b), 6)', () => {
  const format = 'SET3-S:6NOAD/TB7';

  it('No-Ad: at deuce the next point wins the game', () => {
    conforms(format, `${DEUCE} 1`, { sets: [[1, 0]], complete: false });
  });

  it('No-Ad changes the game, not the set: 6-5 is not a set, 7-5 is', () => {
    conforms(format, games('12121212121'), { sets: [[6, 5]], complete: false });
    conforms(format, games('121212121211'), { sets: [[7, 5]], complete: false });
  });

  it('Rule 5(b): the tie-break at six all is to seven by two', () => {
    conforms(format, `${gamesAll(6)} ${'12'.repeat(6)} 11`, { sets: [[7, 6, [8, 6]]], complete: false });
  });

  it('Rule 7: two sets win the match', () => {
    conforms(format, `${loveSet('2', 6)} ${gamesAll(6)} 2222222`, {
      sets: [
        [0, 6],
        [6, 7, [0, 7]],
      ],
      winningSide: 2,
      complete: true,
    });
  });

  it('SET3-S:6NOAD/TB7@6 — `@6` is the default spelled out: the same tie-break at six all', () => {
    conforms('SET3-S:6NOAD/TB7@6', `${gamesAll(6)} 1111111`, { sets: [[7, 6, [7, 0]]], complete: false });
  });
});

describe('SET3-S:6NOAD/TB7-F:TB10 — No-Ad games, a match tie-break in lieu of the final set', () => {
  const format = 'SET3-S:6NOAD/TB7-F:TB10';
  const oneSetAll = `${loveSet('1', 6)} ${loveSet('2', 6)}`;

  it('No-Ad changes the game, not the set: 6-5 is not a set', () => {
    conforms(format, games('12121212121 2'), { sets: [[6, 6]], complete: false });
  });

  it('Appendix VI: the match tie-break is first to ten, by two (11-9)', () => {
    conforms(format, `${oneSetAll} ${'12'.repeat(9)} 11`, {
      sets: [
        [6, 0],
        [0, 6],
        [1, 0, [11, 9]],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('two sets win the match with no tie-break played', () => {
    conforms(format, `${loveSet('2', 6)} ${games('1212121222 22')}`, {
      sets: [
        [0, 6],
        [4, 6],
      ],
      winningSide: 2,
      complete: true,
    });
  });
});

describe('SET3-S:6NOAD/TB7NOAD — No-Ad games and a sudden-death tie-break (engine-defined `TB7NOAD`)', () => {
  const format = 'SET3-S:6NOAD/TB7NOAD';

  it('No-Ad: at deuce the next point wins the game', () => {
    conforms(format, `${DEUCE} 2`, { sets: [[0, 1]], complete: false });
  });

  it('engine-defined: at six points all in the tie-break the next point wins it (7-6)', () => {
    conforms(format, `${gamesAll(6)} ${'12'.repeat(6)} 1`, { sets: [[7, 6, [7, 6]]], complete: false });
  });

  it('No-Ad changes neither the set margin: 6-5 is not a set', () => {
    conforms(format, games('12121212121 2'), { sets: [[6, 6]], complete: false });
  });

  it('Rule 7: two sets win the match', () => {
    conforms(format, `${loveSet('1', 6)} ${gamesAll(6)} ${'12'.repeat(6)} 1`, {
      sets: [
        [6, 0],
        [7, 6, [7, 6]],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET3-S:6/TB7NOAD — advantage games, a sudden-death tie-break (engine-defined `TB7NOAD`)', () => {
  const format = 'SET3-S:6/TB7NOAD';

  it('Rule 5: games stay advantage games', () => {
    conforms(format, `${DEUCE} 1`, { sets: [[0, 0]], complete: false });
  });

  it('engine-defined: at six points all in the tie-break the next point wins it', () => {
    conforms(format, `${gamesAll(6)} ${'12'.repeat(6)} 2`, { sets: [[6, 7, [6, 7]]], complete: false });
  });

  it('Rule 6: 6-5 is not a set', () => {
    conforms(format, games('12121212121 2'), { sets: [[6, 6]], complete: false });
  });

  it('SET1-S:6/TB7NOAD — a sudden-death tie-break ends a one-set match', () => {
    conforms('SET1-S:6/TB7NOAD', `${gamesAll(6)} ${'12'.repeat(6)} 1`, {
      sets: [[7, 6, [7, 6]]],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET3-S:4/TB5-G:3C — consecutive-points games in a tie-break set (engine-defined)', () => {
  const format = 'SET3-S:4/TB5-G:3C';

  it('engine-defined: three points in a row win a game; a broken run starts again', () => {
    conforms(format, '11211', { sets: [[0, 0]], complete: false });
    conforms(format, '112111', { sets: [[1, 0]], complete: false });
  });

  it('Rule 6 margin: 4-3 is not a set; 4-2 is', () => {
    conforms(format, runs('1212121 2', 3), { sets: [[4, 4]], complete: false });
    conforms(format, runs('121211', 3), { sets: [[4, 2]], complete: false });
  });

  it('engine-defined: the tie-break at four all scores point by point, to five by two — not by runs', () => {
    conforms(format, `${runs('12121212', 3)} ${'12'.repeat(4)} 11`, { sets: [[5, 4, [6, 4]]], complete: false });
  });

  it('Rule 7: two sets win the match', () => {
    conforms(format, `${runs('1111', 3)} ${runs('1111', 3)}`, {
      sets: [
        [4, 0],
        [4, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('SET3-S:6/TB7-G:3C — engine-defined: 6-5 is not a set; six all goes to a seven-point tie-break', () => {
    conforms('SET3-S:6/TB7-G:3C', runs('12121212121 2', 3), { sets: [[6, 6]], complete: false });
    conforms('SET3-S:6/TB7-G:3C', `${runs('12'.repeat(6), 3)} ${'12'.repeat(6)} 22`, {
      sets: [[6, 7, [6, 8]]],
      complete: false,
    });
  });
});

describe('SET3-S:6/TB7-G:TN3D — the star point: the third deuce is decided by one point (engine-defined)', () => {
  const format = 'SET3-S:6/TB7-G:TN3D';

  it('engine-defined: an advantage converted before the cap wins the game as usual', () => {
    conforms(format, `${DEUCE} 11`, { sets: [[1, 0]], complete: false });
  });

  it('engine-defined: at the first and second deuce the game goes on', () => {
    conforms(format, `${DEUCE} 12 1`, { sets: [[0, 0]], complete: false });
    conforms(format, `${DEUCE} 12 12`, { sets: [[0, 0]], complete: false });
  });

  it('engine-defined: at the third deuce the next point wins the game', () => {
    conforms(format, `${DEUCE} 12 12 1`, { sets: [[1, 0]], complete: false });
    conforms(format, `${DEUCE} 21 21 2`, { sets: [[0, 1]], complete: false });
  });

  it('Rule 5(b): the cap governs games, not the tie-break — six all is still won by two', () => {
    conforms(format, `${gamesAll(6)} ${'12'.repeat(6)} 11`, { sets: [[7, 6, [8, 6]]], complete: false });
  });

  it('Rule 7: two sets win the match', () => {
    conforms(format, `${DEUCE} 12 12 2 ${games('22222')} ${loveSet('2', 6)}`, {
      sets: [
        [0, 6],
        [0, 6],
      ],
      winningSide: 2,
      complete: true,
    });
  });

  it('SET3-S:6/TB7-G:TN1D — engine-defined golden point: the first deuce is decided by one point', () => {
    conforms('SET3-S:6/TB7-G:TN1D', `${DEUCE} 2`, { sets: [[0, 1]], complete: false });
    conforms('SET3-S:6/TB7-G:TN1D', DEUCE, { sets: [[0, 0]], complete: false });
    conforms('SET3-S:6/TB7-G:TN1D', `${gamesAll(6)} ${'12'.repeat(6)} 11`, {
      sets: [[7, 6, [8, 6]]],
      complete: false,
    });
  });

  it('SET3-S:6/TB7-G:TN2D — engine-defined: the second deuce is decided by one point', () => {
    conforms('SET3-S:6/TB7-G:TN2D', `${DEUCE} 12`, { sets: [[0, 0]], complete: false });
    conforms('SET3-S:6/TB7-G:TN2D', `${DEUCE} 12 2`, { sets: [[0, 1]], complete: false });
  });

  it('SET1-S:6/TB7-G:TN2D — engine-defined: a capped game can close a one-set match', () => {
    conforms('SET1-S:6/TB7-G:TN2D', `${games('11111')} ${DEUCE} 12 1`, {
      sets: [[6, 0]],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET3-S:6/TB7-G:TN3D-F:TB10 — star point games, a match tie-break in lieu of the final set', () => {
  const format = 'SET3-S:6/TB7-G:TN3D-F:TB10';

  it('engine-defined: the star point decides a game in the ordinary sets', () => {
    conforms(format, `${DEUCE} 21 21 1`, { sets: [[1, 0]], complete: false });
  });

  it('engine-defined: the cap does not reach the match tie-break — it is won by two (11-9)', () => {
    conforms(format, `${DEUCE} 12 12 1 ${games('11111')} ${loveSet('2', 6)} ${'12'.repeat(9)} 11`, {
      sets: [
        [6, 0],
        [0, 6],
        [1, 0, [11, 9]],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET3-S:1/TB7 — the one-game set', () => {
  it('Rule 5: games stay advantage games', () => {
    conforms('SET3-S:1/TB7', `${DEUCE} 1`, { sets: [[0, 0]], complete: false });
  });
});

/*
 * Fixed 2026-10-17 (CA: "Rule 6: margin of two"); found by these cases.
 *
 * `S:1/TB7` read by Rule 6 (and Appendix VI short sets) at `setTo` 1: the first side to one game wins
 * the set PROVIDED there is a margin of two games, and at one game all a tie-break is played. The
 * format declares that tie-break (`/TB7`, at one all), which no score could reach if one game won the
 * set. So 1-0 is not a set, 2-0 is, and 1-1 goes to the tie-break (2-1).
 *
 * Observed: the engine closes the set at 1-0 (`addPoint`'s `setTo === 1` branch: "first to 1 game
 * wins"), so a following game opens set two — `[[1, 0], [0, 1]]` where the rule gives `[[1, 1]]`, and
 * `games('11')` is a finished best-of-three match `[[1, 0], [1, 0]]` where the rule gives one set
 * `[[2, 0]]`. The factory's own `checkSetIsComplete` (two-game margin, no tie-break reached) would call
 * that 1-0 incomplete, so the engine and the set analysis disagree with each other as well.
 */
describe('SET3-S:1/TB7 — the one-game set by Rule 6', () => {
  const format = 'SET3-S:1/TB7';

  // expected [[1, 1]] (1-0 has no margin of two); observed [[1, 0], [0, 1]], complete false
  it('SET3-S:1/TB7 — engine-defined: one game with no margin of two is not a set', () => {
    conforms(format, games('12'), { sets: [[1, 1]], complete: false });
  });

  // expected [[2, 0]], complete false; observed [[1, 0], [1, 0]], winningSide 1, complete true
  it('SET3-S:1/TB7 — engine-defined: two games to love win the set', () => {
    conforms(format, games('11'), { sets: [[2, 0]], complete: false });
  });

  // expected [[2, 1, [7, 0]]]; observed [[1, 0], [0, 1], [1, 0]], winningSide 1:
  // the tie-break points are played as a third set
  it('SET3-S:1/TB7 — engine-defined: at one game all a seven-point tie-break decides the set', () => {
    conforms(format, `${games('12')} 1111111`, { sets: [[2, 1, [7, 0]]], complete: false });
  });

  // expected [[2, 0], [2, 0]], winningSide 1; observed [[1, 0], [1, 0]] — the match was already over after two games
  it('SET3-S:1/TB7 — engine-defined: two sets win the match', () => {
    conforms(format, games('1111'), {
      sets: [
        [2, 0],
        [2, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});
