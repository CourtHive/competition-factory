import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { isLiveDecidingSet } from '@Tools/scoring/scoringUtilities';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { describe, expect, it } from 'vitest';

import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';

/*
 * Every view reads the format governing the set in play and the match's completion rule (scoring-engine spec
 * § 3.2, § 11; § 16 decision 13, CA 2026-10-18). v1's defects, each pinned below:
 * (a) getScoreboard() read the ordinary format and tennis points: SET3-S:TB11 at 5-3 showed `0-0 (G-40)`,
 *     and a -F:4/TB7 final-set tiebreak showed tennis points;
 * (b) points-to-match counted by best-of sets in exactly and aggregate formats (HAL3X-S:TB11 at one half to
 *     love and 10-0 reported a match point; SET3A-S:TB11 at two games to love and 9-0 gave [0, 22]);
 * (c) onGameComplete fired on every point of a points-based timed segment (SET3-S:T10P: three events);
 * (d) getInputMode() counted a server correction and a substitution as inputs.
 * And the ruling on the final set (CA 2026-10-18): in SET3-S:T10-F:T10/TB7 the final set's declared /TB7
 * applies to set N whatever the count when set N starts.
 */

describe('§ 11.3 the scoreboard reads the format governing the set in play (CA 2026-10-18, decision 13a)', () => {
  it('SET3-S:TB11 at 5-3 shows tiebreak points', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });
    for (const winner of [0, 0, 0, 0, 0, 1, 1, 1] as const) engine.addPoint({ winner });
    expect(engine.getScoreboard()).toBe('0-0 (5-3)');
  });

  it('SET3-S:6/TB7-F:4/TB7: the final-set tiebreak at four all shows tiebreak points', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:4/TB7' });
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 0 });
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 1 });
    for (let i = 0; i < 8; i++) engine.addGame({ winner: (i % 2) as 0 | 1 });
    for (const winner of [0, 0, 1] as const) engine.addPoint({ winner });
    expect(engine.getScoreboard()).toBe('6-0, 0-6, 4-4 (2-1)');
  });

  it('SET3-S:6/TB7-F:TB10: the match tiebreak shows tiebreak points', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:TB10' });
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 0 });
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 1 });
    for (const winner of [0, 0, 0, 1, 1] as const) engine.addPoint({ winner });
    expect(engine.getScoreboard()).toBe('6-0, 0-6, 0-0 (3-2)');
  });

  it('SET3-S:T20/TB7: the tiebreak a level segment plays at time is the game in play', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T20/TB7' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.endSegment();
    for (const winner of [0, 0, 1] as const) engine.addPoint({ winner });
    expect(engine.getScoreboard()).toBe('1-1 (2-1)');
  });
});

describe('§ 11.2 points-to-match counts by the completion rule (CA 2026-10-18, decision 13b)', () => {
  it('HAL3X-S:TB11 at one half to love and 10-0: not a match point; the third half must be played', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'HAL3X-S:TB11' });
    for (let i = 0; i < 21; i++) engine.addPoint({ winner: 0 });
    expect(engine.getScore().situation!.isMatchPoint).toBe(false);
    engine.addPoint({ winner: 0 });
    // the point at 10-0: one point closes the half, eleven win the third
    expect(engine.getState().history!.points.at(-1)!.pointsToMatch).toEqual([12, 23]);
  });

  it('SET3A-S:TB11 at two games to love and 9-0: the total decides, and side 2 cannot reach it', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3A-S:TB11' });
    for (let i = 0; i < 31; i++) engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    // at 9-0 in the third game: two points finish it with side 1 ahead; side 2 trails 0-31 with 11 to win
    expect(engine.getState().history!.points.at(-1)!.pointsToMatch).toEqual([2, -1]);
    expect(engine.getScore().situation!.isMatchPoint).toBe(true);
  });

  it('HAL2X-S:TB11: a side that can at best draw level has no points to match', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'HAL2X-S:TB11' });
    for (let i = 0; i < 11; i++) engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    expect(engine.getState().history!.points.at(-1)!.pointsToMatch).toEqual([11, -1]);
  });
});

describe('§ 11.5 onGameComplete fires only where a point completes a game (CA 2026-10-18, decision 13c)', () => {
  it('SET3-S:T10P: three points, no game events; SET3-S:T10 still reports its games', () => {
    const fired: string[] = [];
    const handlers = { onGameComplete: () => fired.push('game') };
    const pointsBased = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P', eventHandlers: handlers });
    for (const winner of [0, 1, 0] as const) pointsBased.addPoint({ winner });
    expect(fired).toEqual([]);

    const gamesBased = new ScoringEngine({ matchUpFormat: 'SET3-S:T10', eventHandlers: handlers });
    for (let i = 0; i < 4; i++) gamesBased.addPoint({ winner: 0 });
    expect(fired).toEqual(['game']);
  });

  it('SET2XA-S:T10: a game input of a timed aggregate segment is a unit, and its points fire no game event', () => {
    const fired: string[] = [];
    const engine = new ScoringEngine({
      matchUpFormat: 'SET2XA-S:T10',
      eventHandlers: { onGameComplete: () => fired.push('game') },
    });
    for (let i = 0; i < 4; i++) engine.addPoint({ winner: 0 });
    expect(fired).toEqual([]);
  });
});

describe('§ 11.4 getInputMode counts scoring inputs only (CA 2026-10-18, decision 13d)', () => {
  it('a point-only match with a server correction, a challenge and an annotation is points', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setServer(1);
    expect(engine.getInputMode()).toBe('none');
    engine.addPoint({ winner: 0 });
    engine.setServer(0);
    engine.addChallenge({ sideNumber: 1 });
    engine.addAnnotation({ note: 'let' });
    expect(engine.getInputMode()).toBe('points');
  });

  it('a substitution is not an input', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setLineUp(1, [{ participantId: 'a' }, { participantId: 'b' }] as any);
    engine.addGame({ winner: 0 });
    engine.substitute({ sideNumber: 1, outParticipantId: 'a', inParticipantId: 'c' });
    expect(engine.getInputMode()).toBe('games');
  });
});

describe('§ 3.2 the final set of a best of N is set N whatever the count (CA 2026-10-18 ruling)', () => {
  it('isLiveDecidingSet: SET3-S:T10-F:T10/TB7 at one set to love, set three is the final set', () => {
    const formatStructure = parse('SET3-S:T10-F:T10/TB7')!;
    expect(isLiveDecidingSet(formatStructure, [1, 0], 3)).toBe(true);
    expect(isLiveDecidingSet(formatStructure, [1, 0], 2)).toBe(false);
  });

  it('SET3-S:T10-F:T10/TB7: set one level, set two to side 1, set three level at time plays its /TB7', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10-F:T10/TB7' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.endSegment(); // level, no winner
    engine.addGame({ winner: 0 });
    engine.endSegment(); // side 1
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.endSegment(); // level at time: the declared tiebreak decides set three
    expect(engine.getState().matchUpStatus).toBe(IN_PROGRESS);
    for (let i = 0; i < 7; i++) engine.addPoint({ winner: 0 });
    const state = engine.getState();
    expect(state.score.sets[2]).toMatchObject({ side1Score: 2, side2Score: 1, side1TiebreakScore: 7, winningSide: 1 });
    expect(state.matchUpStatus).toBe(COMPLETED);
    expect(state.winningSide).toBe(1);
  });
});
