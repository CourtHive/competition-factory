import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { LEGACY_IGNORED_INPUT } from '@Mutate/scoring/matchCompletion';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/*
 * A completed match takes no scoring input (scoring-engine spec § 2, § 9.6; § 16 decision 5, CA 2026-10-18):
 * "a point, a game and a set total after COMPLETED are ignored alike, recording nothing, keeping the redo
 * stack and returning a result flag that says the input was ignored." v1 applied set and game input to a
 * completed match (SET3-S:6/TB7 6-0 6-0 took a third set by addSet and a fourth by addGame).
 *
 * No set beyond N (§ 2.3, § 9.2 rule 4; decision 7): in an exactly format a set total after the N sets,
 * like one after COMPLETED, is ignored. v1 recorded one (HAL2X-S:TB11 took three addSet halves).
 *
 * The replay rule (§ 12.8): a stored timeline holding set or game input v1 applied after COMPLETED
 * replays as v1 replayed it.
 */

function decided(): ScoringEngine {
  const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
  engine.addSet({ side1Score: 6, side2Score: 0 });
  engine.addSet({ side1Score: 6, side2Score: 0 });
  return engine;
}

describe('§ 9.6 a completed match takes no scoring input (CA 2026-10-18, decision 5)', () => {
  it('SET3-S:6/TB7 6-0 6-0: a third set by addSet and a game by addGame are ignored with a flag', () => {
    const engine = decided();
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
    const before = engine.getState();

    expect(engine.addSet({ side1Score: 6, side2Score: 0 })).toEqual({ recorded: false, ignored: 'MATCH_COMPLETED' });
    expect(engine.addGame({ winner: 1 })).toEqual({ recorded: false, ignored: 'MATCH_COMPLETED' });
    expect(engine.getState()).toEqual(before);
  });

  it('a point after completion says so too, as it records nothing', () => {
    const engine = decided();
    expect(engine.addPoint({ winner: 0 })).toEqual({ recorded: false, ignored: 'MATCH_COMPLETED' });
    expect(engine.addPoint({} as any)).toEqual({ recorded: false, ignored: 'NO_WINNER' });
    expect(engine.addPoint({ winner: 0 })).not.toEqual({ recorded: true });
  });

  it('a segment end after a timed match completes is ignored and recorded nothing', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:T10P' });
    engine.addPoint({ winner: 0 });
    engine.endSegment();
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
    const entries = engine.getState().history!.entries!.length;
    expect(engine.endSegment()).toEqual({ recorded: false, ignored: 'MATCH_COMPLETED' });
    expect(engine.getState().history!.entries).toHaveLength(entries);
  });

  it('ignored input keeps a pending redo', () => {
    const engine = decided();
    engine.addAnnotation({ note: 'handshake' });
    engine.undo(); // the annotation comes off; the match stays complete
    expect(engine.canRedo()).toEqual(true);
    engine.addPoint({ winner: 0 });
    engine.addGame({ winner: 0 });
    engine.addSet({ side1Score: 6, side2Score: 0 });
    expect(engine.canRedo()).toEqual(true);
    expect(engine.redo()).toEqual(true);
    expect(engine.getState().history!.entries!.at(-1)!.type).toEqual('annotation');
  });
});

describe('§ 9.2 rule 4 no set beyond N in an exactly format (CA 2026-10-18, decision 7)', () => {
  it('HAL2X-S:TB11: a third addSet half is ignored, not recorded as 2-1', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'HAL2X-S:TB11' });
    engine.addSet({ side1Score: 11, side2Score: 5 });
    engine.addSet({ side1Score: 5, side2Score: 11 });
    const result = engine.addSet({ side1Score: 11, side2Score: 3 });
    expect(result.recorded).toEqual(false);
    expect(engine.getState().score.sets).toHaveLength(2);
    expect(engine.getState().winningSide).toBeUndefined();
  });

  it('SET3X-S:T10P: no game, set or point after the three segments', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3X-S:T10P' });
    for (let i = 0; i < 3; i++) {
      engine.addPoint({ winner: 0 });
      engine.endSegment();
    }
    expect(engine.addGame({ winner: 1 }).recorded).toEqual(false);
    expect(engine.addSet({ side1Score: 0, side2Score: 3 }).recorded).toEqual(false);
    expect(engine.getState().score.sets).toHaveLength(3);
    expect(engine.getWinner()).toEqual(1);
  });
});

describe('§ 12.8 stored set or game input after COMPLETED replays as v1 replayed it', () => {
  it('a third set v1 recorded after 6-0 6-0 is still there after a rebuild, flagged', () => {
    const engine = decided();
    const state = engine.getState();
    state.history!.entries!.push({
      type: 'set',
      data: { side1Score: 6, side2Score: 1, winningSide: 1 },
      timestamp: '2026-10-01T00:00:00Z',
    });
    state.score.sets.push({ setNumber: 3, side1Score: 6, side2Score: 1, winningSide: 1 });

    const loaded = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    loaded.setState(state);
    loaded.addAnnotation({ note: 'a rebuild follows' });
    loaded.undo();
    expect(loaded.getState().score.sets).toHaveLength(3);
    expect(loaded.getLegacyShapes()).toContain(LEGACY_IGNORED_INPUT);
  });
});
