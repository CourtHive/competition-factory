import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { LEGACY_IGNORED_INPUT } from '@Mutate/scoring/matchCompletion';
import { describe, expect, it } from 'vitest';

// constants and types
import { COMPLETED, IN_PROGRESS, RETIRED } from '@Constants/matchUpStatusConstants';
import type { InitialScoreOptions } from '@Types/scoring/types';

/*
 * The late-start baseline (scoring-engine spec § 2.5; § 16 decision 8, CA 2026-10-18):
 * 1. its sets are judged by their segment rule, as addSet judges a total: 6-5 is not won; the final set is
 *    the one the deciding-set rule of § 3.2 names, read from the score; a tiebreak-only set is read from
 *    its points (1-0 with 11-9 is won);
 * 2. a baseline that decides the match completes it;
 * 3. an unfinished last set is the set in play;
 * 4. a supplied server is honoured: recorded as a setServer at the baseline's position;
 * 5. a second baseline is refused once the timeline holds scoring entries;
 * 6. matchUpStatus and winningSide given beside the sets are checked for consistency, and refused only when
 *    they disagree, not as unknown fields.
 * v1 judged a set won when it "reached setTo and ahead", read the final set by position, never inferred a
 * tiebreak-only set, did not complete a decided match, let a second baseline replace the whole score and
 * ignored server.
 */

function setScores(engine: ScoringEngine) {
  return engine.getState().score.sets.map((set) => [set.side1Score, set.side2Score, set.winningSide]);
}

describe('§ 2.5 rule 1 the sets are judged by their segment rule (CA 2026-10-18, decision 8)', () => {
  it('SET3-S:6/TB7: 6-5 is not won; it is the set in play', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setInitialScore({ sets: [{ side1Score: 6, side2Score: 5 }] });
    expect(setScores(engine)).toEqual([[6, 5, undefined]]);
    for (let i = 0; i < 4; i++) engine.addPoint({ winner: 1 });
    expect(setScores(engine)).toEqual([[6, 6, undefined]]);
  });

  it('the deciding set is judged by the final-set format: SET3-S:6/TB7-F:TB10, a 1-0 match tiebreak', () => {
    // v1 looked for the final format's setTo, which a match tiebreak has none of, so set three stayed open
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:TB10' });
    engine.setInitialScore({
      sets: [
        { side1Score: 6, side2Score: 4 },
        { side1Score: 3, side2Score: 6 },
        { side1Score: 1, side2Score: 0, side1TiebreakScore: 10, side2TiebreakScore: 8 },
      ],
    });
    expect(setScores(engine)).toEqual([
      [6, 4, 1],
      [3, 6, 2],
      [1, 0, 1],
    ]);
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
    expect(engine.getWinner()).toEqual(1);
  });

  it('a tiebreak-only set is read from its points: SET3-S:TB11 1-0 with 11-9 is won', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });
    engine.setInitialScore({ sets: [{ side1Score: 1, side2Score: 0, side1TiebreakScore: 11, side2TiebreakScore: 9 }] });
    expect(setScores(engine)).toEqual([[1, 0, 1]]);
    expect(() =>
      new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' }).setInitialScore({
        sets: [{ side1Score: 1, side2Score: 0, side1TiebreakScore: 11, side2TiebreakScore: 10 }],
      }),
    ).toThrow(/not won/);
  });
});

describe('§ 2.5 rule 2 a baseline that decides the match completes it (decision 8)', () => {
  it('6-0 6-0 in a best of three is COMPLETED, and a point after it is ignored', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setInitialScore({
      sets: [
        { side1Score: 6, side2Score: 0 },
        { side1Score: 6, side2Score: 0 },
      ],
    });
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
    expect(engine.getWinner()).toEqual(1);
    expect(engine.addPoint({ winner: 1 }).recorded).toEqual(false);
  });
});

describe('§ 2.5 rule 3 an unfinished last set is the set in play (decision 8)', () => {
  it('the courthive-components dynamic sets shape: 6-4 then an unfinished 3-2', () => {
    // a guard: the shape dynamicSetsApproach.ts sends, which v1 also took
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setInitialScore({
      sets: [
        { side1Score: 6, side2Score: 4, winningSide: 1 },
        { side1Score: 3, side2Score: 2, side1TiebreakScore: undefined, side2TiebreakScore: undefined },
      ],
    });
    expect(setScores(engine)).toEqual([
      [6, 4, 1],
      [3, 2, undefined],
    ]);
    engine.addPoint({ winner: 0 });
    expect(engine.getScore().pointDisplay).toEqual(['15', '0']);
  });

  it('an unfinished set before another is refused', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(() =>
      engine.setInitialScore({
        sets: [
          { side1Score: 3, side2Score: 2 },
          { side1Score: 6, side2Score: 4 },
        ],
      }),
    ).toThrow(/not finished/);
    expect(engine.getState().score.sets).toEqual([]);
  });

  it('an unfinished tiebreak-only last set holds its points as the game in play', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });
    engine.setInitialScore({ sets: [{ side1Score: 9, side2Score: 4 }] });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    expect(setScores(engine)).toEqual([[1, 0, 1]]);
    const set = engine.getState().score.sets[0];
    expect([set.side1TiebreakScore, set.side2TiebreakScore]).toEqual([11, 4]);
  });
});

describe('§ 2.5 rule 4 a supplied server is honoured as a recorded server correction (decision 8)', () => {
  it('server 1 serves the next point, and the correction survives a rebuild', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setInitialScore({
      sets: [{ side1Score: 6, side2Score: 4 }],
      currentSetScore: { side1Score: 1, side2Score: 1 },
      server: 1,
    });
    expect(engine.getNextServer()).toEqual(1);
    engine.addPoint({ winner: 0 });
    expect(engine.getState().history!.points[0].server).toEqual(1);
    engine.addPoint({ winner: 0 });
    engine.undo();
    expect(engine.getState().history!.points[0].server).toEqual(1);
    expect(engine.getNextServer()).toEqual(1);
  });
});

describe('§ 2.5 rule 5 a second baseline is refused once scoring entries exist (decision 8)', () => {
  it('a baseline after a point is refused; the games scored since stay', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setInitialScore({ sets: [{ side1Score: 6, side2Score: 4 }] });
    engine.addGame({ winner: 0 });
    const before = engine.getState();
    expect(() => engine.setInitialScore({ sets: [{ side1Score: 4, side2Score: 6 }] })).toThrow(/refused once scoring/);
    expect(engine.getState()).toEqual(before);
  });

  it('a baseline before any scoring replaces the one before it', () => {
    // a guard: rule 5 refuses only once scoring exists
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setInitialScore({ sets: [{ side1Score: 6, side2Score: 4 }] });
    engine.setInitialScore({ sets: [{ side1Score: 4, side2Score: 6 }] });
    expect(setScores(engine)).toEqual([[4, 6, 2]]);
  });
});

describe('§ 2.5 rule 6 matchUpStatus and winningSide are checked for consistency (decision 8)', () => {
  const sets = [
    { side1Score: 6, side2Score: 3, winningSide: 1 },
    { side1Score: 6, side2Score: 2, winningSide: 1 },
  ];

  it('the inline scorer shape: a COMPLETED matchUp with its winner is accepted, not refused as unknown', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setInitialScore({ sets, matchUpStatus: COMPLETED, winningSide: 1 });
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
    expect(engine.getWinner()).toEqual(1);
  });

  it('a status or winner that disagrees with the sets is refused', () => {
    const disagreeing: InitialScoreOptions[] = [
      { sets, winningSide: 2 },
      { sets, matchUpStatus: IN_PROGRESS },
      { sets: sets.slice(0, 1), matchUpStatus: COMPLETED },
    ];
    for (const options of disagreeing) {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      expect(() => engine.setInitialScore(options)).toThrow(/disagrees/);
      expect(engine.getState().score.sets).toEqual([]);
    }
  });

  it('a status set outside scoring (RETIRED) is not checked against the sets', () => {
    // a guard: rule 6 checks only what scoring decides
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setInitialScore({ sets: sets.slice(0, 1), matchUpStatus: RETIRED, winningSide: 2 });
    expect(setScores(engine)).toEqual([[6, 3, 1]]);
  });
});

describe('§ 12.8 a stored baseline v1 scored past replays as v1 replayed it', () => {
  it('6-0 6-0 then a third set v1 played on: the rebuild keeps it in play, flagged', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    const state = engine.getState();
    state.history!.entries = [
      {
        type: 'setInitialScore',
        data: {
          sets: [
            { side1Score: 6, side2Score: 0 },
            { side1Score: 6, side2Score: 0 },
          ],
        },
        timestamp: '2026-10-01T00:00:00Z',
      },
      { ...state.history!.entries![0], pointIndex: 0 },
    ];
    const loaded = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    loaded.setState(state);
    loaded.addPoint({ winner: 0 });
    loaded.undo();
    expect(loaded.getState().score.sets).toHaveLength(3);
    expect(loaded.getState().matchUpStatus).toEqual(IN_PROGRESS);
    expect(loaded.getLegacyShapes()).toContain(LEGACY_IGNORED_INPUT);
  });
});
