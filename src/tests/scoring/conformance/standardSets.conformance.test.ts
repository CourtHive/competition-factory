import { conforms, games, servers } from '../../testHarness/scoringConformance/conformance';
import { describe, expect, it } from 'vitest';

/*
 * Conformance: tennis sets decided by a tiebreak, and the ways a final set may differ.
 * Every expected outcome below is written from the rule it cites, not recorded from the engine.
 *
 * Sources: ITF Rules of Tennis 2026 — Rule 5 (score in a game), Rule 5(b) (tie-break game),
 * Rule 6 (score in a set: advantage set, tie-break set), Rule 7 (score in a match), and Appendix VI
 * (alternative procedures: short sets, match tie-break in lieu of the final set).
 */

const SIX_ALL = games('121212121212');
const SET_TO_LOVE = { 1: games('111111'), 2: games('222222') };

describe('SET3-S:6/TB7 — best of three tie-break sets (Rules 5, 6, 7)', () => {
  const format = 'SET3-S:6/TB7';

  it('Rule 5: four straight points win a game', () => {
    conforms(format, '1111', { sets: [[1, 0]], complete: false });
  });

  it('Rule 5: from deuce a game needs two consecutive points', () => {
    // 40-40, advantage side 1, deuce, advantage side 1, game
    conforms(format, '111222 12 11', { sets: [[1, 0]], complete: false });
    // 40-40, advantage side 1: no game yet
    conforms(format, '111222 1', { sets: [[0, 0]], complete: false });
  });

  it('Rule 6: the first side to six games, two clear, wins the set', () => {
    conforms(format, games('1212121211'), { sets: [[6, 4]], complete: false });
  });

  it('Rule 6: at 6-5 there is no tie-break; 7-5 wins the set', () => {
    conforms(format, games('121212121211'), { sets: [[7, 5]], complete: false });
  });

  it('Rule 5(b): at six games all a tie-break decides the set, first to seven points', () => {
    conforms(format, `${SIX_ALL} 1111111`, { sets: [[7, 6, [7, 0]]], complete: false });
  });

  it('Rule 5(b): the tie-break continues until a margin of two points', () => {
    conforms(format, `${SIX_ALL} 121212121212 11`, { sets: [[7, 6, [8, 6]]], complete: false });
  });

  it('Rule 7: two sets win a best-of-three match', () => {
    conforms(format, `${SET_TO_LOVE[1]} ${SET_TO_LOVE[1]}`, {
      sets: [
        [6, 0],
        [6, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('Rule 7: one set all goes to a third set', () => {
    conforms(format, `${SET_TO_LOVE[1]} ${SET_TO_LOVE[2]} ${SET_TO_LOVE[1]}`, {
      sets: [
        [6, 0],
        [0, 6],
        [6, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('a point after the match ends changes nothing', () => {
    conforms(format, `${SET_TO_LOVE[1]} ${SET_TO_LOVE[1]} 2`, {
      sets: [
        [6, 0],
        [6, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('service alternates game by game (the player who received serves the next game)', () => {
    expect(servers(format, games('12'))).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });
});

describe('SET5-S:6/TB7 — best of five (Rule 7)', () => {
  const format = 'SET5-S:6/TB7';
  it('three sets win; two do not', () => {
    conforms(format, `${SET_TO_LOVE[1]} ${SET_TO_LOVE[1]}`, {
      sets: [
        [6, 0],
        [6, 0],
      ],
      complete: false,
    });
    conforms(format, `${SET_TO_LOVE[1]} ${SET_TO_LOVE[2]} ${SET_TO_LOVE[1]} ${SET_TO_LOVE[1]}`, {
      sets: [
        [6, 0],
        [0, 6],
        [6, 0],
        [6, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('SET3-S:4/TB7 — short sets (Appendix VI: first to four games, tie-break at four all)', () => {
  it('the tie-break comes at four games all', () => {
    conforms('SET3-S:4/TB7', `${games('12121212')} 1111111`, { sets: [[5, 4, [7, 0]]], complete: false });
  });
});

const ONE_SET_ALL = `${SET_TO_LOVE[1]} ${SET_TO_LOVE[2]}`;

describe('final sets that differ from the ordinary set', () => {
  it('-F:6 — an advantage final set (Rule 6): no tie-break at six all, two games clear', () => {
    conforms('SET3-S:6/TB7-F:6', `${ONE_SET_ALL} ${SIX_ALL} ${games('11')}`, {
      sets: [
        [6, 0],
        [0, 6],
        [8, 6],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('-F:6/TB10 — the final set tie-break is first to ten (Appendix VI)', () => {
    conforms('SET3-S:6/TB7-F:6/TB10', `${ONE_SET_ALL} ${SIX_ALL} 1111111111`, {
      sets: [
        [6, 0],
        [0, 6],
        [7, 6, [10, 0]],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('-F:TB10 — a match tie-break in lieu of the final set, first to ten by two (Appendix VI)', () => {
    conforms('SET3-S:6/TB7-F:TB10', `${ONE_SET_ALL} ${'12'.repeat(9)} 11`, {
      sets: [
        [6, 0],
        [0, 6],
        [1, 0, [11, 9]],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('-F:TB10NOAD — a sudden-death match tie-break: at nine all the next point wins', () => {
    conforms('SET3-S:6/TB7-F:TB10NOAD', `${ONE_SET_ALL} ${'12'.repeat(9)} 1`, {
      sets: [
        [6, 0],
        [0, 6],
        [1, 0, [10, 9]],
      ],
      winningSide: 1,
      complete: true,
    });
  });

  it('-F:6/TB7@12 — a final set tie-break at twelve all', () => {
    const twelveAll = games('12'.repeat(12));
    conforms('SET5-S:6/TB7-F:6/TB7@12', `${ONE_SET_ALL} ${ONE_SET_ALL} ${twelveAll} 1111111`, {
      sets: [
        [6, 0],
        [0, 6],
        [6, 0],
        [0, 6],
        [13, 12, [7, 0]],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});

describe('-M:T60 — a match clock is the host’s to keep and does not change the scoring', () => {
  it('scores as the same format without the clock', () => {
    conforms('SET3-S:6/TB7-M:T60', `${SET_TO_LOVE[1]} ${SET_TO_LOVE[1]}`, {
      sets: [
        [6, 0],
        [6, 0],
      ],
      winningSide: 1,
      complete: true,
    });
  });
});
