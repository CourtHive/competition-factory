import { addPoint, createMatchUp, getScore } from '@Assemblies/governors/scoreGovernor';
import { describe, expect, it } from 'vitest';

/*
 * The pure scorer (`scoreGovernor.addPoint` / `getScore`) on a combined point total, held directly. It keeps its
 * in-place contract through 7.x (plan § 8, decision 4); the ScoringEngine no longer scores through it (SE4), so
 * these cases are its own oracle.
 */

function played(matchUpFormat: string, winners: (0 | 1)[]) {
  let matchUp = createMatchUp({ matchUpFormat });
  for (const winner of winners) matchUp = addPoint(matchUp, { winner });
  return matchUp;
}

const run = (side: 0 | 1, count: number): (0 | 1)[] => new Array(count).fill(side);

describe('the pure scorer on a combined point total (§ 7)', () => {
  it('one rally is one point, carrying its coordinates; the score reads the totals', () => {
    const matchUp = played('SET1-S:P32', [0, 1, 0]);
    expect(matchUp.score.sets[0]).toMatchObject({ side1Score: 2, side2Score: 1 });
    expect(matchUp.matchUpStatus).toEqual('IN_PROGRESS');
    const point: Record<string, unknown> = { ...matchUp.history!.points[2] };
    expect([point.index, point.set, point.game, point.number, point.score]).toEqual([2, 0, 0, 2, '2-1']);
    const score = getScore(matchUp);
    expect([score.scoreString, score.points, score.games]).toEqual(['2-1', [2, 1], [0, 0]]);
    expect(score.situation).toMatchObject({ isMatchPoint: false, serverDerived: false });
  });

  it('a supplied server is kept on the point, with its 1-indexed spelling', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET1-S:P32' });
    matchUp = addPoint(matchUp, { winner: 1, server: 1 });
    expect(matchUp.history!.points[0]).toMatchObject({ server: 1, serverSideNumber: 2, winningSide: 2 });
  });

  it('a side one point from a total it would win has match point; the total played completes the match', () => {
    const ahead = played('SET1-S:P32', [...run(0, 16), ...run(1, 15)]);
    expect(getScore(ahead).situation).toMatchObject({ isMatchPoint: true, isSetPoint: true });
    const won = addPoint(ahead, { winner: 0 });
    expect([won.matchUpStatus, won.winningSide]).toEqual(['COMPLETED', 1]);
    expect(won.endTime).toBeDefined();
  });

  it('level at the total under ALLOW: complete with no winner, and a host must decide it', () => {
    const level = played('SET1-S:P32', [...run(0, 16), ...run(1, 16)]);
    expect(level.matchUpStatus).toEqual('COMPLETED');
    expect(level.winningSide).toBeUndefined();
    expect(getScore(level).decisionRequired).toBe(true);
  });

  it('a deciding point: level at the total marks the golden point, and the next point wins it', () => {
    const level = played('SET1-S:P32DP', [...run(0, 16), ...run(1, 16)]);
    expect(level.matchUpStatus).toEqual('IN_PROGRESS');
    expect(getScore(level).situation).toMatchObject({ isGoldenPoint: true, isMatchPoint: true });
    const decided = addPoint(level, { winner: 1 });
    expect([decided.matchUpStatus, decided.winningSide]).toEqual(['COMPLETED', 2]);
  });

  it('what it cannot score leaves the matchUp as it was: a value, a missing winner, a point after the end', () => {
    const started = played('SET1-S:P32', [0]);
    expect(addPoint(started, { winner: 0, scoreValue: 2 }).score.sets[0].side1Score).toEqual(1);
    expect(addPoint(started, {} as never).history!.points).toHaveLength(1);
    // the match is over once all 32 points are played
    const won = played('SET1-S:P32', [...run(0, 17), ...run(1, 15)]);
    expect(won.matchUpStatus).toEqual('COMPLETED');
    expect(addPoint(won, { winner: 1 }).history!.points).toHaveLength(32);
  });
});
