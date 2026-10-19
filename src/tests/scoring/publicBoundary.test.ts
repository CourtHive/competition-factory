import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { createMatchUp } from '@Mutate/scoring/createMatchUp';
import { addPoint } from '@Mutate/scoring/addPoint';
import { describe, expect, it } from 'vitest';

/*
 * The ScoringEngine's public boundary: what a caller hands in or gets back is not shared with the
 * engine's state, and an input the engine cannot score is refused before anything is written.
 * Finding S9 of the 2026-10-17 scoring-engine assessment.
 */

const FORMAT = 'SET3-S:6/TB7';

describe('S9: ownership', () => {
  it('getScore returns a copy: editing it does not change the engine', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.addPoint({ winner: 0 });
    const score = engine.getScore();
    score.sets[0].side1Score = 99;
    score.sets[0].side1GameScores!.push(40);
    expect(engine.getState().score.sets[0].side1Score).toEqual(0);
    expect(engine.getState().score.sets[0].side1GameScores).toEqual([1]);
  });

  it('setState takes a copy: the caller editing its object afterwards does not change the engine', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    const state = engine.getState();
    engine.setState(state);
    state.matchUpFormat = 'EXTERNAL';
    state.score.sets.push({ setNumber: 1, side1Score: 6, side2Score: 0 });
    expect(engine.getState().matchUpFormat).toEqual(FORMAT);
    expect(engine.getState().score.sets).toEqual([]);
  });

  it('setLineUp takes a copy', () => {
    const lineUp = [{ participantId: 'A' }];
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.setLineUp(1, lineUp);
    lineUp[0].participantId = 'EXTERNAL';
    expect(engine.getActivePlayers().side1).toEqual(['A']);
  });

  it('point multipliers go in and come out as copies', () => {
    const multipliers = [{ condition: { results: ['Ace'] }, value: 2 }];
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:T10P' });
    engine.setPointMultipliers(multipliers as any);
    multipliers[0].value = 9;
    (engine.getPointMultipliers()[0] as any).value = 7;
    engine.addPoint({ winner: 0, result: 'Ace' });
    expect(engine.getScore().games).toEqual([2, 0]);
  });

  it('the supplementary state is a copy too', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.addPoint({ winner: 0 });
    engine.undo();
    const supplementary: any = engine.getSupplementaryState();
    supplementary.redoStack[0].data.winner = 1;
    engine.redo();
    expect(engine.getState().history!.points[0].winner).toEqual(0);
  });
});

describe('S9: a calculated field passed as input is not recorded as one', () => {
  it('the entry and the point cannot disagree about a field the scorer calculates', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.addPoint({ winner: 0, serveSide: 'ad', score: '40-0', pointNumber: 9, code: 'A' } as any);
    const point: any = engine.getState().history!.points[0];
    const entry: any = engine.getState().history!.entries![0];
    expect([point.serveSide, point.score, point.pointNumber]).toEqual(['deuce', '15-0', 1]);
    expect([entry.data.serveSide, entry.data.score, entry.data.pointNumber]).toEqual([undefined, undefined, undefined]);
    // a host decoration that is not calculated is still recorded
    expect(entry.data.code).toEqual('A');
  });
});

describe('S9: invalid input is refused before anything is written', () => {
  const invalid: [string, any, RegExp][] = [
    ['winner 2', { winner: 2 }, /winner/],
    ['winningSide 3', { winningSide: 3 }, /winningSide/],
    ['winner and winningSide that disagree', { winner: 0, winningSide: 2 }, /disagree/],
    ['server 2', { winner: 0, server: 2 }, /server/],
    ['serverSideNumber 0', { winner: 0, serverSideNumber: 0 }, /serverSideNumber/],
    ['server and serverSideNumber that disagree', { winner: 0, server: 0, serverSideNumber: 2 }, /disagree/],
    ['a negative scoreValue', { winner: 0, scoreValue: -3 }, /scoreValue/],
    ['a non-finite scoreValue', { winner: 0, scoreValue: Number.NaN }, /scoreValue/],
  ];

  it.each(invalid)('%s', (_label, options, message) => {
    let notified = 0;
    const engine = new ScoringEngine({
      matchUpFormat: 'SET1-S:T10P',
      eventHandlers: { onPoint: () => notified++ },
    });
    expect(() => engine.addPoint(options)).toThrow(message);
    expect(engine.getState().history?.points ?? []).toEqual([]);
    expect(engine.getState().history?.entries ?? []).toEqual([]);
    expect(engine.getScore().sets).toEqual([]);
    expect(notified).toEqual(0);

    // the pure function refuses the same input
    expect(() => addPoint(createMatchUp({ matchUpFormat: 'SET1-S:T10P' }), options)).toThrow(message);
  });

  it('a valid point still scores, and a zero scoreValue is allowed', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:T10P' });
    engine.addPoint({ winner: 0, winningSide: 1, server: 1, serverSideNumber: 2, scoreValue: 0 });
    engine.addPoint({ winner: 0 });
    expect(engine.getScore().games).toEqual([1, 0]);
  });

  it('a point naming no winner is still ignored, not refused', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.addPoint({} as any);
    expect(engine.getPointCount()).toEqual(0);
  });

  it('an invalid format refuses its first point without starting a history', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'BOGUS' });
    expect(() => engine.addPoint({ winner: 0 })).toThrow(/Invalid matchUpFormat/);
    expect(engine.getState().history).toBeUndefined();
  });

  it('editPoint refuses an invalid edit and leaves the history as it was', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    const before = engine.getState();
    expect(() => engine.editPoint(0, { winner: 2 as any })).toThrow(/winner/);
    expect(engine.getState()).toEqual(before);
  });
});
