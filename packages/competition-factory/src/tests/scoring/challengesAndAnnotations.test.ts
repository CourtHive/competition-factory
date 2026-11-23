import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * Challenges and annotations (scoring-engine spec § 2.8, § 12.3, § 12.6 item 7; § 16 decision 20,
 * CA 2026-10-18): "versioned timeline actions that change no score ... both are replayed in place and kept
 * through every rebuild. undo takes back whatever was recorded last, a challenge or an annotation
 * included." v2 and v1 read v1's raw entries, { type: 'challenge', data: { sideNumber } } as epixodic writes
 * them itself, unchanged. v1 had no such action.
 */

describe('§ 2.8 challenge and annotation actions (CA 2026-10-18, decision 20)', () => {
  it('addChallenge records the side and host fields, changing no score', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    const score = engine.getScore();
    engine.addChallenge({ sideNumber: 2, reviewedBy: 'chair', timestamp: '2026-10-18T12:00:00Z' });
    expect(engine.getScore()).toEqual(score);
    expect(engine.getState().history!.entries!.at(-1)).toEqual({
      type: 'challenge',
      data: { sideNumber: 2, reviewedBy: 'chair' },
      timestamp: '2026-10-18T12:00:00Z',
    });
    expect(() => engine.addChallenge({ sideNumber: 3 as any })).toThrow(/sideNumber/);
  });

  it('addAnnotation records host data, changing no score', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addAnnotation({ note: 'rain delay' });
    expect(engine.getState().history!.entries!.at(-1)!.data).toEqual({ note: 'rain delay' });
    expect(engine.getScore().sets).toEqual([]);
  });

  it('undo takes back whatever was recorded last, a challenge included', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addChallenge({ sideNumber: 1 });
    engine.undo();
    expect(engine.getState().history!.entries!.map((entry) => entry.type)).toEqual(['point']);
    expect(engine.getPointCount()).toEqual(1);
    engine.redo();
    expect(engine.getState().history!.entries!.map((entry) => entry.type)).toEqual(['point', 'challenge']);
  });

  it("epixodic's hand-written challenge entry is read unchanged and kept in place through a rebuild", () => {
    // a guard: v1 already kept it (§ 2.8), and the new action must read it the same way
    const engine = new ScoringEngine({ matchUpFormat: 'SET2XA-S:T10P' });
    engine.addPoint({ winner: 0 });
    const state = engine.getState();
    const challenge = { type: 'challenge' as const, data: { sideNumber: 1 }, timestamp: '2026-10-18T12:00:00Z' };
    state.history!.entries!.push(challenge);
    const loaded = new ScoringEngine({ matchUpFormat: 'SET2XA-S:T10P' });
    loaded.setState(state);
    loaded.addPoint({ winner: 1 });
    loaded.editPoint(0, { winner: 1 });
    const entries = loaded.getState().history!.entries!;
    expect(entries.map((entry) => entry.type)).toEqual(['point', 'challenge', 'point']);
    expect(entries[1]).toEqual(challenge);
    expect(loaded.getState().score.sets[0].side2Score).toEqual(2);
  });
});
