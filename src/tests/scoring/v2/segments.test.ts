import { reduce } from '@Assemblies/engines/scoring/v2/reduce';
import { describe, expect, it } from 'vitest';

// constants and types
import type { TimelineEntry } from '@Assemblies/engines/scoring/v2/types';

/*
 * ScoringEngine v2 (SE2b): timed segments (§ 6), combined totals (§ 7) and outs (§ 8), held directly to the spec.
 * The conformance suite holds them to the format definitions through the differential.
 */

const pts = (stream: string): TimelineEntry[] =>
  [...stream.replaceAll(' ', '')].map((side) => ({ type: 'point', data: { winner: side === '1' ? 0 : 1 } }));
const game = (winner: 0 | 1, tiebreakScore?: [number, number]): TimelineEntry => ({
  type: 'game',
  data: { winner, ...(tiebreakScore ? { tiebreakScore } : {}) },
});
const games = (winners: string) => [...winners].map((side) => game(side === '1' ? 0 : 1));
const end = (data: Record<string, unknown> = {}): TimelineEntry => ({ type: 'endSegment', data });
const total = (side1Score: number, side2Score: number, extra: Record<string, unknown> = {}): TimelineEntry => ({
  type: 'set',
  data: { side1Score, side2Score, ...extra },
});
const scores = (format: string, timeline: TimelineEntry[]) =>
  reduce({ matchUpFormat: format }, timeline).state.sets.map((set) => {
    const pair = [set.side1Score, set.side2Score];
    return set.side1TiebreakScore === undefined ? pair : [...pair, [set.side1TiebreakScore, set.side2TiebreakScore]];
  });
const outcomes = (format: string, timeline: TimelineEntry[]) => reduce({ matchUpFormat: format }, timeline).outcomes;

describe('§ 6 timed segments', () => {
  it('time closes a segment: the side ahead wins it; level with no tiebreak it closes without a winner', () => {
    const { state } = reduce({ matchUpFormat: 'SET3-S:T10' }, [...games('1111111'), end(), ...games('12'), end()]);
    expect(state.sets.map((set) => [set.side1Score, set.side2Score, set.winningSide, set.segmentComplete])).toEqual([
      [7, 0, 1, true],
      [1, 1, undefined, true],
    ]);
    expect(state.sets[0].isTimed).toEqual(true);
  });

  it('points build traditional games in a tennis-family timed set, and units elsewhere', () => {
    expect(scores('SET3-S:T10', pts('1111 111222 12 11'))).toEqual([[2, 0]]);
    expect(scores('SET3-S:T10-G:3C', pts('111 12 222'))).toEqual([[1, 1]]);
    expect(scores('SET3-S:T10P', pts('1121'))).toEqual([[3, 1]]);
    expect(scores('HAL2A-S:T45', pts('12 1'))).toEqual([[2, 1]]);
    const unit = reduce({ matchUpFormat: 'SET3-S:T10P' }, [{ type: 'point', data: { winner: 0, scoreValue: 3 } }]);
    expect(unit.state.sets[0].side1Score).toEqual(3);
    expect(outcomes('SET3-S:T10', [{ type: 'point', data: { winner: 0, scoreValue: 2 } }])[0]).toMatchObject({
      recorded: false,
    });
  });

  it('level at time with a declared tiebreak plays it from 0-0; the winner takes one more unit', () => {
    const level = [...games('12'), end()];
    const open = reduce({ matchUpFormat: 'SET3-S:T20/TB7' }, [...level, ...pts('11')]).state.sets[0];
    expect([open.side1TiebreakScore, open.side2TiebreakScore, open.winningSide]).toEqual([2, 0, undefined]);
    expect(scores('SET3-S:T20/TB7', [...level, ...pts('1111111')])).toEqual([[2, 1, [7, 0]]]);
    expect(scores('SET3-S:T20/TB7', [...level, game(1, [5, 7])])).toEqual([[1, 2, [5, 7]]]);
    expect(outcomes('SET3-S:T20/TB7', [...level, end()]).at(-1)).toEqual({
      recorded: false,
      ignored: 'TIEBREAK_IN_PLAY',
    });
    expect(scores('SET3-S:T10P/TB1', [...pts('12'), end(), ...pts('2')])).toEqual([[1, 2, [0, 1]]]);
    expect(scores('SET3-S:T20/TB7', [total(2, 2), ...pts('2222222')])).toEqual([[2, 3, [0, 7]]]);
  });

  it('endSegment is refused with no timed segment in play, a named segment not in play, and other kinds', () => {
    expect(outcomes('SET3-S:T10', [end()])[0]).toMatchObject({ recorded: false });
    expect(outcomes('SET3-S:T10', [...games('1'), end({ setNumber: 2 })]).at(-1)).toMatchObject({ recorded: false });
    expect(outcomes('SET3-S:T10', [...games('1'), end({ setNumber: 1 })]).at(-1)).toEqual({ recorded: true });
    expect(outcomes('SET3-S:6/TB7', [...pts('1'), end()]).at(-1)).toMatchObject({ recorded: false });
    expect(outcomes('SET1-S:T10P', [...pts('1'), end(), end()]).at(-1)).toEqual({
      recorded: false,
      ignored: 'MATCH_COMPLETED',
    });
  });

  it('a timed total is a finished segment; a winningSide must be the side ahead', () => {
    expect(reduce({ matchUpFormat: 'SET3-S:T10' }, [total(3, 1)]).state.sets[0]).toMatchObject({
      winningSide: 1,
      segmentComplete: true,
    });
    expect(outcomes('SET3-S:T10', [total(3, 1, { winningSide: 2 })])[0]).toMatchObject({ recorded: false });
    expect(outcomes('SET3-S:T10', [total(2, 2, { winningSide: 1 })])[0]).toMatchObject({ recorded: false });
    expect(reduce({ matchUpFormat: 'SET1-S:T10P' }, [total(2, 2)]).state.matchUpStatus).toEqual('COMPLETED');
  });

  it('best of N plays no set beyond N; level segments count toward the N played (§ 9.1, § 9.7)', () => {
    const { state } = reduce({ matchUpFormat: 'SET3-S:T10' }, [
      ...games('12'),
      end(),
      ...games('1'),
      end(),
      ...games('12'),
      end(),
    ]);
    expect([state.matchUpStatus, state.winningSide]).toEqual(['COMPLETED', 1]);
  });

  it('an aggregate counts units, and its declared decider settles a level total (§ 9.3, § 9.4)', () => {
    const level = [...games('111'), end(), ...games('12'), end(), ...games('222'), end()];
    expect(reduce({ matchUpFormat: 'SET3XA-S:T10-F:TB1' }, level).state.matchUpStatus).toEqual('IN_PROGRESS');
    const decided = reduce({ matchUpFormat: 'SET3XA-S:T10-F:TB1' }, [...level, ...pts('2')]).state;
    expect([decided.sets.at(-1)?.side2TiebreakScore, decided.winningSide]).toEqual([1, 2]);
    const timedDecider = reduce({ matchUpFormat: 'SET3XA-S:T10-F:T10P' }, [...level, ...pts('112'), end()]).state;
    expect(timedDecider.winningSide).toEqual(1);
  });

  it('a baseline closes its timed sets, and one level at time with a tiebreak is the set in play', () => {
    const baseline = (sets: unknown[]): TimelineEntry => ({ type: 'setInitialScore', data: { sets } });
    const closed = reduce({ matchUpFormat: 'SET3-S:T10' }, [baseline([{ side1Score: 3, side2Score: 1 }])]).state;
    expect(closed.sets[0].segmentComplete).toEqual(true);
    const atTime = reduce({ matchUpFormat: 'SET3-S:T20/TB7' }, [
      baseline([{ side1Score: 2, side2Score: 2 }]),
      ...pts('1111111'),
    ]);
    expect(atTime.state.sets[0]).toMatchObject({ side1Score: 3, winningSide: 1, side1TiebreakScore: 7 });
    const notLast = [
      baseline([
        { side1Score: 2, side2Score: 2 },
        { side1Score: 1, side2Score: 0 },
      ]),
    ];
    expect(outcomes('SET3-S:T20/TB7', notLast)[0]).toMatchObject({ recorded: false });
  });
});

describe('§ 7 combined totals', () => {
  it('complete at the total: a winner when unequal, a tie under ALLOW, one rally under DP, a margin under WB', () => {
    expect(reduce({ matchUpFormat: 'SET1-S:P4' }, pts('1211')).state.winningSide).toEqual(1);
    const tie = reduce({ matchUpFormat: 'SET1-S:P4' }, pts('1122')).state;
    expect([tie.matchUpStatus, tie.winningSide, tie.sets[0].segmentComplete]).toEqual([
      'COMPLETED',
      undefined,
      undefined,
    ]);
    expect(reduce({ matchUpFormat: 'SET1-S:P4DP' }, pts('1221')).state.matchUpStatus).toEqual('IN_PROGRESS');
    expect(reduce({ matchUpFormat: 'SET1-S:P4DP' }, pts('1221 1')).state.winningSide).toEqual(1);
    const margin = pts(`${'12'.repeat(16)} 1`);
    expect(reduce({ matchUpFormat: 'SET1-S:P32WB2' }, margin).state.matchUpStatus).toEqual('IN_PROGRESS');
    expect(reduce({ matchUpFormat: 'SET1-S:P32WB2' }, [...margin, ...pts('1')]).state.winningSide).toEqual(1);
  });

  it('takes points and totals, never a game, a point value or endSegment', () => {
    expect(outcomes('SET1-S:P32', [game(0)])[0]).toMatchObject({ recorded: false });
    expect(outcomes('SET1-S:P32', [{ type: 'point', data: { winner: 0, scoreValue: 2 } }])[0]).toMatchObject({
      recorded: false,
    });
    expect(outcomes('SET1-S:P32', [...pts('1'), end()]).at(-1)).toMatchObject({ recorded: false });
  });

  it('a total no play can reach is refused; a reachable one is judged', () => {
    for (const [format, a, b] of [
      ['SET1-S:P32', 17, 16],
      ['SET1-S:P4DP', 4, 2],
      ['SET1-S:P32WB2', 20, 16],
      ['SET1-S:P31', 16, 16],
    ] as [string, number, number][])
      expect({ format, verdict: outcomes(format, [total(a, b)])[0].recorded }).toEqual({ format, verdict: false });
    expect(reduce({ matchUpFormat: 'SET1-S:P4DP' }, [total(3, 2)]).state.winningSide).toEqual(1);
    expect(reduce({ matchUpFormat: 'SET1-S:P32WB2' }, [total(18, 16)]).state.winningSide).toEqual(1);
    expect(reduce({ matchUpFormat: 'SET1-S:P32' }, [total(10, 5)]).state.matchUpStatus).toEqual('IN_PROGRESS');
  });

  it('a baseline has no game score', () => {
    const data = { sets: [], currentGameScore: { side1Points: 1, side2Points: 0 } };
    expect(outcomes('SET1-S:P32', [{ type: 'setInitialScore', data }])[0]).toMatchObject({ recorded: false });
  });
});

describe('§ 8 outs', () => {
  it('refuse points and games; a total closes the segment, the side with more winning it', () => {
    expect(outcomes('SET1-S:O3', [...pts('1'), game(0)]).map((outcome) => outcome.recorded)).toEqual([false, false]);
    expect(reduce({ matchUpFormat: 'SET1-S:O3' }, [total(2, 1)]).state.winningSide).toEqual(1);
    const level = reduce({ matchUpFormat: 'SET1-S:O3' }, [total(2, 2)]).state;
    expect([level.matchUpStatus, level.winningSide, level.sets[0].segmentComplete]).toEqual([
      'COMPLETED',
      undefined,
      true,
    ]);
  });

  it('a final set of outs refuses points only once it is the set in play', () => {
    const format = 'SET3-S:6/TB7-F:O3';
    expect(outcomes(format, pts('1'))[0]).toEqual({ recorded: true });
    expect(outcomes(format, [total(6, 0), total(0, 6), ...pts('1')]).at(-1)).toMatchObject({ recorded: false });
  });
});
