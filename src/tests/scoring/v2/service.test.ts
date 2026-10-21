import { createContext, reduce, serverOf } from '@Assemblies/engines/scoring/v2/reduce';
import { describe, expect, it } from 'vitest';

// constants and types
import type { ScoringConfiguration, TimelineEntry } from '@Assemblies/engines/scoring/v2/types';

/*
 * ScoringEngine v2 (SE2b): service (§ 10), held directly to the spec. The differential holds every point's server,
 * S/R code and court half, and the next server after every call, to v1.
 */

const pts = (stream: string): TimelineEntry[] =>
  [...stream.replaceAll(' ', '')].map((side) => ({ type: 'point', data: { winner: side === '1' ? 0 : 1 } }));
const love = (side: '1' | '2', games = 1) => side.repeat(4 * games);
const setServer = (side: 0 | 1): TimelineEntry => ({ type: 'setServer', data: { side } });

function run(config: ScoringConfiguration | string, timeline: TimelineEntry[]) {
  const configuration = typeof config === 'string' ? { matchUpFormat: config } : config;
  const { state } = reduce(configuration, timeline);
  return {
    state,
    next: serverOf(createContext(configuration), state),
    servers: state.points.map((point) => point.server),
  };
}

describe('§ 10.1 standard sets', () => {
  it('side 1 serves first; the server alternates game by game, however a game was recorded', () => {
    expect(run('SET3-S:6/TB7', pts(love('1') + love('2'))).servers).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(run('SET3-S:6/TB7', [{ type: 'game', data: { winner: 0 } }]).next).toEqual({ side: 1, derived: true });
    expect(run('SET3-S:6/TB7', [{ type: 'set', data: { side1Score: 6, side2Score: 3 } }]).next.side).toEqual(1);
  });

  it('the tiebreak follows Rule 5(b), opened by the side due to serve the next game', () => {
    const sixAll = '12'.repeat(6).replaceAll('1', love('1')).replaceAll('2', love('2'));
    expect(run('SET3-S:6/TB7', pts(`${sixAll} 1111111`)).servers.slice(48)).toEqual([0, 1, 1, 0, 0, 1, 1]);
  });

  it('a match tiebreak keeps Rule 5(b), opened by the games of the sets before it', () => {
    const sets: TimelineEntry[] = [
      { type: 'set', data: { side1Score: 6, side2Score: 3 } },
      { type: 'set', data: { side1Score: 3, side2Score: 6 } },
    ];
    expect(run('SET3-S:6/TB7-F:TB10', [...sets, ...pts('1212')]).servers).toEqual([0, 1, 1, 0]);
  });
});

describe('§ 10.2 - § 10.4 where no server is derived, and the winner-serves rules', () => {
  it('a tiebreak-only format and a combined total derive none: a point records one only when supplied', () => {
    const tiebreakOnly = run('SET5-S:TB11', pts('12'));
    expect([tiebreakOnly.servers, tiebreakOnly.next]).toEqual([[undefined, undefined], { side: 0, derived: false }]);
    expect(run('SET5-S:TB11', [...pts('1'), setServer(1)]).next).toEqual({ side: 1, derived: false });
    const supplied = run('SET1-S:P32', [{ type: 'point', data: { winner: 0, server: 1 } }]).state.points[0];
    expect([supplied.server, supplied.code, supplied.serveSide]).toEqual([1, undefined, undefined]);
  });

  it('under @RALLY and WINNER_SERVES the rally winner serves next; a setServer names the next point only', () => {
    expect(run('SET3-S:TB11@RALLY', pts('1221')).servers).toEqual([0, 0, 1, 1]);
    expect(run('SET3-S:TB11@RALLY', [...pts('1'), setServer(1), ...pts('11')]).servers).toEqual([0, 1, 0]);
    const winnerServes = { matchUpFormat: 'SET3-S:6/TB7', competitionFormat: { serverRule: 'WINNER_SERVES' } };
    expect(run(winnerServes, pts('122')).servers).toEqual([0, 0, 1]);
  });
});

describe('§ 10.3 timed segments', () => {
  it('unit by unit where points are units, continuously across segments', () => {
    const { servers } = run('SET3-S:T10P', [...pts('112'), { type: 'endSegment', data: {} }, ...pts('11')]);
    expect(servers).toEqual([0, 1, 0, 1, 0]);
  });
});

describe('§ 10.6 orientation', () => {
  it('a setServer flips the derivation from its position on', () => {
    expect(run('SET3-S:6/TB7', [setServer(1), ...pts(love('1') + '1')]).servers).toEqual([1, 1, 1, 1, 0]);
  });

  it('the first recorded point’s supplied server orients every derivation', () => {
    const first = [{ type: 'point', data: { winner: 0, server: 1 } }, ...pts('111 1')];
    expect(run('SET3-S:6/TB7', first).servers).toEqual([1, 1, 1, 1, 0]);
  });

  it('a correction attached to an entry, and a baseline’s server, are replayed with it', () => {
    const attached = [{ ...pts('1')[0], serverCorrection: 1 }, ...pts('1')];
    expect(run('SET3-S:6/TB7', attached).servers).toEqual([0, 1]);
    const baseline = { type: 'setInitialScore', data: { sets: [{ side1Score: 6, side2Score: 3 }], server: 1 } };
    expect(run('SET3-S:6/TB7', [baseline, ...pts('1')]).servers).toEqual([1]);
  });

  it('after the match the rotation continues (decision SE2b-D22)', () => {
    expect(run('SET1-S:TB10', pts('1'.repeat(10))).next).toEqual({ side: 0, derived: false });
    expect(run('SET1-S:6/TB7', pts(love('1', 6))).next).toEqual({ side: 0, derived: true });
  });
});

describe('§ 10.5, § 10.8 the court half and the S/R code', () => {
  it('deuce on an even count in the game, ad on odd; the aggregate total’s parity; none in a timed set', () => {
    expect(run('SET3-S:6/TB7', pts('112')).state.points.map((point) => point.serveSide)).toEqual([
      'deuce',
      'ad',
      'deuce',
    ]);
    expect(run('SET3A-S:TB11', [...pts('1'.repeat(11)), ...pts('1')]).state.points.at(-1)?.serveSide).toEqual('ad');
    expect(run('SET3-S:T10P', pts('1')).state.points[0].serveSide).toBeUndefined();
  });

  it('S when the server won, R when the receiver did; a supplied code is kept', () => {
    expect(run('SET3-S:6/TB7', pts('12')).state.points.map((point) => point.code)).toEqual(['S', 'R']);
    expect(run('SET3-S:6/TB7', [{ type: 'point', data: { winner: 0, code: 'A' } }]).state.points[0].code).toEqual('A');
  });
});
