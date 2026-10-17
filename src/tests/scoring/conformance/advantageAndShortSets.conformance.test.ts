import { conforms, games } from '../../testHarness/scoringConformance/conformance';
import { describe, it } from 'vitest';

/*
 * Conformance: sets with no tie-break — advantage sets, No-Ad games, the win-by-one set (`WB1`) and the
 * consecutive-points game (`-G:{n}C`) — and their final-set variants.
 * Every expected outcome below is written from the rule it cites, not recorded from the engine.
 *
 * Sources: ITF Rules of Tennis 2026 — Rule 5 (score in a game), Rule 6 (score in a set: the advantage
 * set, two clear games), Rule 7 (score in a match), and the appendix of alternative procedures and
 * scoring methods (Appendix VI in the 2026 edition: the No-Ad game, a deciding point at deuce; short
 * sets). Formats no rulebook publishes are scored from the factory's own grammar
 * (`documentation/docs/codes/matchup-format.mdx`: `{games}` is an advantage set won by two unless `WB{n}`
 * overrides it; `WB1` is first to `setTo` games outright; `-G:{n}C` is a game won by the first side to
 * win `n` points in a row) and are marked `engine-defined`.
 */

/** A set won to love by `side` in a format whose games are four points. */
const loveSet = (side: '1' | '2', count: number) => games(side.repeat(count));

/** Games won by `n` straight points, in order: `runs('12', 3)` is side 1 then side 2, each 3 in a row. */
const runs = (winners: string, n: number) => [...winners.replaceAll(' ', '')].map((side) => side.repeat(n)).join(' ');

const DEUCE = '111222';

describe('SET3-S:6 — advantage sets, best of three (Rules 5, 6, 7)', () => {
  const format = 'SET3-S:6';

  it('Rule 5: from deuce a game needs two consecutive points', () => {
    conforms(format, `${DEUCE} 12 11`, { sets: [[1, 0]], complete: false });
    conforms(format, `${DEUCE} 1`, { sets: [[0, 0]], complete: false });
  });

  it('Rule 6: six games with a two-game margin win the set (6-4)', () => {
    conforms(format, games('1212121211'), { sets: [[6, 4]], complete: false });
  });

  it('Rule 6: at 6-5 there is no margin of two; 7-5 wins the set', () => {
    conforms(format, games('12121212121'), { sets: [[6, 5]], complete: false });
    conforms(format, games('121212121211'), { sets: [[7, 5]], complete: false });
  });

  it('Rule 6: an advantage set plays on past six all — 7-6 is not a set, 8-6 is', () => {
    const sixAll = games('12'.repeat(6));
    conforms(format, `${sixAll} ${games('1')}`, { sets: [[7, 6]], complete: false });
    conforms(format, `${sixAll} ${games('11')}`, { sets: [[8, 6]], complete: false });
    conforms(format, `${games('12'.repeat(9))} ${games('22')}`, { sets: [[9, 11]], complete: false });
  });

  it('Rule 7: two sets win the match; one set all goes to a third', () => {
    conforms(format, `${loveSet('1', 6)} ${loveSet('2', 6)}`, {
      sets: [
        [6, 0],
        [0, 6],
      ],
      complete: false,
    });
    conforms(format, `${loveSet('1', 6)} ${loveSet('2', 6)} ${games('12'.repeat(6))} ${games('22')}`, {
      sets: [
        [6, 0],
        [0, 6],
        [6, 8],
      ],
      winningSide: 2,
      complete: true,
    });
  });

  it('SET1-S:8 — a pro set: 8-7 is not the match, 9-7 is (Rule 6 margin)', () => {
    conforms('SET1-S:8', games('121212121212121'), { sets: [[8, 7]], complete: false });
    conforms('SET1-S:8', games('1212121212121211'), { sets: [[9, 7]], winningSide: 1, complete: true });
  });

  it('SET5-S:6 — Rule 7: three advantage sets win a best-of-five match', () => {
    conforms('SET5-S:6', `${loveSet('2', 6)} ${loveSet('2', 6)} ${games('1212121222')}`, {
      sets: [
        [0, 6],
        [0, 6],
        [4, 6],
      ],
      winningSide: 2,
      complete: true,
    });
  });
});

describe('SET3-S:6-F:6 — an advantage final set declared the same as the others (Rule 6)', () => {
  const format = 'SET3-S:6-F:6';
  const oneSetAll = `${loveSet('1', 6)} ${loveSet('2', 6)}`;

  it('the final set has no tie-break either: 7-6 is not the match', () => {
    conforms(format, `${oneSetAll} ${games('12'.repeat(6))} ${games('1')}`, {
      sets: [
        [6, 0],
        [0, 6],
        [7, 6],
      ],
      complete: false,
    });
  });

  it('the final set is won two games clear and decides the match', () => {
    conforms(format, `${oneSetAll} ${games('12'.repeat(7))} ${games('11')}`, {
      sets: [
        [6, 0],
        [0, 6],
        [9, 7],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('SET5-S:6-F:6 — the fifth set is an advantage set: 6-4 decides the match', () => {
    const twoSetsAll = `${oneSetAll} ${oneSetAll}`;
    conforms('SET5-S:6-F:6', `${twoSetsAll} ${games('1212121211')}`, {
      sets: [
        [6, 0],
        [0, 6],
        [6, 0],
        [0, 6],
        [6, 4],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET3-S:6NOAD — advantage sets of No-Ad games (Appendix VI No-Ad; Rule 6)', () => {
  const format = 'SET3-S:6NOAD';

  it('No-Ad: at deuce one deciding point wins the game', () => {
    conforms(format, `${DEUCE} 1`, { sets: [[1, 0]], complete: false });
    conforms(format, `${DEUCE} 2`, { sets: [[0, 1]], complete: false });
  });

  it('No-Ad: at deuce the game is not yet won', () => {
    conforms(format, DEUCE, { sets: [[0, 0]], complete: false });
  });

  it('No-Ad changes the game, not the set: 6-5 is not a set, 7-5 is', () => {
    conforms(format, games('12121212121'), { sets: [[6, 5]], complete: false });
    conforms(format, games('121212121211'), { sets: [[7, 5]], complete: false });
  });

  it('No-Ad changes the game, not the set: no tie-break at six all, 8-6 wins', () => {
    const sixAll = games('12'.repeat(6));
    conforms(format, `${sixAll} ${games('1')}`, { sets: [[7, 6]], complete: false });
    conforms(format, `${sixAll} ${games('11')}`, { sets: [[8, 6]], complete: false });
  });

  it('Rule 7: two sets win the match', () => {
    conforms(format, `${loveSet('1', 6)} ${games('1212121211')}`, {
      sets: [
        [6, 0],
        [6, 4],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('SET1-S:5NOAD — a single set: five games two clear win the match, 5-4 does not', () => {
    conforms('SET1-S:5NOAD', games('121212121'), { sets: [[5, 4]], complete: false });
    conforms('SET1-S:5NOAD', games('12121212 11'), { sets: [[6, 4]], winningSide: 1, complete: true });
  });
});

describe('SET3-S:4NOAD-F:TB7 — short advantage sets of No-Ad games, a tie-break in lieu of the final set', () => {
  const format = 'SET3-S:4NOAD-F:TB7';
  const oneSetAll = `${loveSet('1', 4)} ${loveSet('2', 4)}`;

  it('No-Ad: the deciding point at deuce', () => {
    conforms(format, `${DEUCE} 2`, { sets: [[0, 1]], complete: false });
  });

  it('Rule 6 margin: 4-3 is not a set, 5-3 is', () => {
    conforms(format, games('1212121'), { sets: [[4, 3]], complete: false });
    conforms(format, games('12121211'), { sets: [[5, 3]], complete: false });
  });

  it('at one set all a seven-point tie-break decides the match', () => {
    conforms(format, `${oneSetAll} 1111111`, {
      sets: [
        [4, 0],
        [0, 4],
        [1, 0, [7, 0]],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('Rule 5(b): the deciding tie-break continues until a margin of two points', () => {
    conforms(format, `${oneSetAll} ${'12'.repeat(6)} 22`, {
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

describe('SET3-S:5WB1 — win-by-one sets (engine-defined: grammar `WB1`, first to five outright)', () => {
  const format = 'SET3-S:5WB1';

  it('engine-defined: four all is not a set', () => {
    conforms(format, games('12121212'), { sets: [[4, 4]], complete: false });
  });

  it('engine-defined: the first side to five games wins the set, by one (5-4, 4-5)', () => {
    conforms(format, games('121212121'), { sets: [[5, 4]], complete: false });
    conforms(format, games('121212122'), { sets: [[4, 5]], complete: false });
  });

  it('engine-defined: games stay advantage games (Rule 5)', () => {
    conforms(format, `${DEUCE} 1`, { sets: [[0, 0]], complete: false });
  });

  it('engine-defined: two win-by-one sets win the match', () => {
    conforms(format, `${games('121212121')} ${games('212121212')} ${games('121212121')}`, {
      sets: [
        [5, 4],
        [4, 5],
        [5, 4],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('SET1-S:5WB1 — engine-defined: 5-4 ends a one-set match', () => {
    conforms('SET1-S:5WB1', games('212121212'), { sets: [[4, 5]], winningSide: 2, complete: true });
  });
});

describe('SET3-S:4NOADWB1 — win-by-one short sets of No-Ad games (engine-defined: grammar `NOADWB1`)', () => {
  const format = 'SET3-S:4NOADWB1';

  it('No-Ad: at deuce the next point wins the game', () => {
    conforms(format, `${DEUCE} 1`, { sets: [[1, 0]], complete: false });
    conforms(format, DEUCE, { sets: [[0, 0]], complete: false });
  });

  it('engine-defined: three all is not a set; the first to four wins it, 4-3', () => {
    conforms(format, games('121212'), { sets: [[3, 3]], complete: false });
    conforms(format, games('1212121'), { sets: [[4, 3]], complete: false });
  });

  it('engine-defined: two sets win the match', () => {
    conforms(format, `${games('2121212')} ${games('1212121')} ${loveSet('2', 4)}`, {
      sets: [
        [3, 4],
        [4, 3],
        [0, 4],
      ],
      winningSide: 2,
      complete: true,
    });
  });

  it('SET1-S:4NOADWB1 — engine-defined: a deciding point closes the one-set match at 4-3', () => {
    conforms('SET1-S:4NOADWB1', `${games('121212')} ${DEUCE} 1`, { sets: [[4, 3]], winningSide: 1, complete: true });
  });
});

describe('SET3-S:4WB1-F:TB7 — win-by-one short sets, a tie-break in lieu of the final set (engine-defined)', () => {
  const format = 'SET3-S:4WB1-F:TB7';

  it('engine-defined: 4-3 wins a set; 3-3 does not', () => {
    conforms(format, games('121212'), { sets: [[3, 3]], complete: false });
    conforms(format, games('1212122'), { sets: [[3, 4]], complete: false });
  });

  it('at one set all a seven-point tie-break, by two, decides the match', () => {
    conforms(format, `${games('1212121')} ${games('2121212')} ${'12'.repeat(6)} 11`, {
      sets: [
        [4, 3],
        [3, 4],
        [1, 0, [8, 6]],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('two sets win the match with no tie-break played', () => {
    conforms(format, `${games('1212121')} ${games('1212121')}`, {
      sets: [
        [4, 3],
        [4, 3],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET5-S:5WB1-G:3C — TYPTI win-by-one: games of three consecutive points (engine-defined)', () => {
  const format = 'SET5-S:5WB1-G:3C';

  it('engine-defined: three points in a row win a game', () => {
    conforms(format, '111', { sets: [[1, 0]], complete: false });
  });

  it('engine-defined: a broken run starts again; alternating points never finish a game', () => {
    conforms(format, '11211', { sets: [[0, 0]], complete: false });
    conforms(format, '112111', { sets: [[1, 0]], complete: false });
    conforms(format, '12'.repeat(10), { sets: [[0, 0]], complete: false });
  });

  it('engine-defined: the first side to five games wins the set, 5-4', () => {
    conforms(format, runs('12121212', 3), { sets: [[4, 4]], complete: false });
    conforms(format, runs('121212121', 3), { sets: [[5, 4]], complete: false });
  });

  it('engine-defined: three sets win a best-of-five match', () => {
    const setTo1 = runs('11111', 3);
    const setTo2 = runs('22222', 3);
    conforms(format, `${setTo1} ${setTo2} ${setTo1}`, {
      sets: [
        [5, 0],
        [0, 5],
        [5, 0],
      ],
      complete: false,
    });
    conforms(format, `${setTo1} ${setTo2} ${setTo1} ${runs('212121212', 3)}`, {
      sets: [
        [5, 0],
        [0, 5],
        [5, 0],
        [4, 5],
      ],
      complete: false,
    });
    conforms(format, `${setTo1} ${setTo2} ${setTo1} ${setTo1}`, {
      sets: [
        [5, 0],
        [0, 5],
        [5, 0],
        [5, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET5-S:5-G:3C — TYPTI games in an advantage set (engine-defined: `WB2` is the implicit default)', () => {
  const format = 'SET5-S:5-G:3C';

  it('engine-defined: three points in a row win a game', () => {
    conforms(format, '111 222', { sets: [[1, 1]], complete: false });
  });

  it('engine-defined: 5-4 is not a set without `WB1`; 6-4 is', () => {
    conforms(format, runs('121212121', 3), { sets: [[5, 4]], complete: false });
    conforms(format, runs('1212121211', 3), { sets: [[6, 4]], complete: false });
  });

  it('engine-defined: no tie-break — 6-5 is not a set, 7-5 is', () => {
    conforms(format, runs('12121212121', 3), { sets: [[6, 5]], complete: false });
    conforms(format, runs('121212121211', 3), { sets: [[7, 5]], complete: false });
  });

  it('engine-defined: three sets win the match', () => {
    const setTo2 = runs('22222', 3);
    conforms(format, `${setTo2} ${setTo2} ${setTo2}`, {
      sets: [
        [0, 5],
        [0, 5],
        [0, 5],
      ],
      winningSide: 2,
      complete: true,
    });
  });

  it('SET3-S:4-G:2C — engine-defined: two in a row win a game; a set needs two clear', () => {
    conforms('SET3-S:4-G:2C', '1212', { sets: [[0, 0]], complete: false });
    conforms('SET3-S:4-G:2C', '12 11', { sets: [[1, 0]], complete: false });
    conforms('SET3-S:4-G:2C', runs('1212121', 2), { sets: [[4, 3]], complete: false });
    conforms('SET3-S:4-G:2C', `${runs('121212 11', 2)} ${runs('1111', 2)}`, {
      sets: [
        [5, 3],
        [4, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});
