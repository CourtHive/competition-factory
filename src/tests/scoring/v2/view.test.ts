import { reduce } from '@Assemblies/engines/scoring/v2/reduce';
import { describe, expect, it } from 'vitest';

// constants and types
import type { TimelineEntry } from '@Assemblies/engines/scoring/v2/types';

/*
 * ScoringEngine v2 (SE2b): the points-to views (§ 11.2), held to the spec. `pointsToGame` and `isBreakpoint` are
 * also held to v1 by the differential; `gamesToSet`, `pointsToSet` and `pointsToMatch` are held here alone until CA
 * rules on how v1 counts them (plan § 9, SE2b-D23, D25, D26), so these cases are their only oracle.
 */

const pts = (stream: string): TimelineEntry[] =>
  [...stream.replaceAll(' ', '')].map((side) => ({ type: 'point', data: { winner: side === '1' ? 0 : 1 } }));
const love = (side: '1' | '2', games = 1) => side.repeat(4 * games);
const total = (side1Score: number, side2Score: number): TimelineEntry => ({
  type: 'set',
  data: { side1Score, side2Score },
});

/** the views carried by the point played after `before`, a point to side 1 */
function viewAfter(format: string, before: TimelineEntry[]) {
  const { state } = reduce({ matchUpFormat: format }, [...before, ...pts('1')]);
  const point: Record<string, unknown> = state.points.at(-1) ?? {};
  const { pointsToGame, gamesToSet, pointsToSet, pointsToMatch, isBreakpoint } = point;
  return { pointsToGame, gamesToSet, pointsToSet, pointsToMatch, isBreakpoint };
}

describe('pointsToGame: the fewest points in a row, against the predicate that completes the game', () => {
  it('a traditional game, from deuce, No-Ad and a deuce cap', () => {
    expect(viewAfter('SET3-S:6/TB7', []).pointsToGame).toEqual([4, 4]);
    expect(viewAfter('SET3-S:6/TB7', pts('112')).pointsToGame).toEqual([2, 3]);
    expect(viewAfter('SET3-S:6/TB7', pts('111222')).pointsToGame).toEqual([2, 2]);
    expect(viewAfter('SET3-S:6NOAD', pts('111222')).pointsToGame).toEqual([1, 1]);
    expect(viewAfter('SET3-S:6/TB7-G:TN3D', pts('111222 12 12')).pointsToGame).toEqual([1, 1]);
  });

  it('a consecutive game needs the rest of its run; a race the rest of its points', () => {
    expect(viewAfter('SET3-S:4-G:2C', pts('1')).pointsToGame).toEqual([1, 2]);
    expect(viewAfter('SET3-S:TB11', pts('1'.repeat(10) + '2'.repeat(10))).pointsToGame).toEqual([2, 2]);
    expect(viewAfter('SET3-S:TB11NOAD', pts('1'.repeat(10) + '2'.repeat(10))).pointsToGame).toEqual([1, 1]);
  });

  it('a break point is the receiver one point from the game; none where the server is not known', () => {
    expect(viewAfter('SET3-S:6/TB7', pts('222')).isBreakpoint).toEqual(true);
    expect(viewAfter('SET3-S:6/TB7', pts('111')).isBreakpoint).toEqual(false);
    expect(viewAfter('SET5-S:TB11', pts('2'.repeat(10))).isBreakpoint).toEqual(false);
  });
});

describe('gamesToSet and pointsToSet: by the set rule, its margin included', () => {
  it('six games, two clear; behind at 4-5 a side needs three games; the tiebreak is one more game', () => {
    expect(viewAfter('SET3-S:6/TB7', []).gamesToSet).toEqual([6, 6]);
    const fourFive = pts(love('1', 5) + love('2', 4));
    expect(viewAfter('SET3-S:6/TB7', fourFive)).toMatchObject({ gamesToSet: [1, 3], pointsToSet: [4, 12] });
    const advantage = pts(love('1', 5) + love('2', 6));
    expect(viewAfter('SET3-S:6', advantage).gamesToSet).toEqual([3, 1]);
  });

  it('the one-game set needs two games, or one tiebreak at one all (Rule 6)', () => {
    expect(viewAfter('SET3-S:1/TB7', []).gamesToSet).toEqual([2, 2]);
    expect(viewAfter('SET3-S:1/TB7', pts(love('1') + love('2'))).gamesToSet).toEqual([1, 1]);
  });
});

describe('pointsToMatch: by the completion rule, each later set at its governing minimum', () => {
  it('best of N: the sets still needed; the deciding set at the final format’s minimum', () => {
    expect(viewAfter('SET3-S:6/TB7', []).pointsToMatch).toEqual([48, 48]);
    expect(viewAfter('SET3-S:6/TB7-F:TB10', [total(6, 3)]).pointsToMatch).toEqual([24, 34]);
  });

  it('exactly N: every remaining set, and -1 for a side that cannot finish with more sets', () => {
    expect(viewAfter('HAL3X-S:TB11', pts('1'.repeat(22))).pointsToMatch).toEqual([11, -1]);
  });

  it('an aggregate: the total, the race in play’s running points included; -1 when winning out cannot lead', () => {
    const behind = [total(11, 0), total(11, 0)];
    expect(viewAfter('SET3A-S:TB11', behind).pointsToMatch).toEqual([11, -1]);
    // 11-11 in total, the third game at 0-10: side 1 needs 12-10 (two clear), side 2 one point
    const running = pts('1'.repeat(11) + '2'.repeat(11) + '2'.repeat(10));
    expect(viewAfter('SET3A-S:TB11', running).pointsToMatch).toEqual([12, 1]);
    // 13-22 in total, the third game at 0-2: side 1 winning out reaches 24-24, level with no decider declared
    const onlyLevel = pts('2'.repeat(11) + '12'.repeat(11) + '11' + '22');
    expect(viewAfter('SET3A-S:TB11', onlyLevel).pointsToMatch).toEqual([-1, 9]);
  });

  it('a timed segment, a combined total and outs carry no points-to', () => {
    expect(viewAfter('SET3-S:T10', []).pointsToGame).toBeUndefined();
    expect(viewAfter('SET1-S:P32', []).pointsToGame).toBeUndefined();
  });
});
