/**
 * `replaySets` answers exactly as `ScoringEngine.addSet` does.
 *
 * Score entry used to construct a `ScoringEngine` to ask three things of the sets an operator typed: is the match
 * decided, who won, and what the next set is played to. It now replays them through the scoring kernel directly
 * (`setReplay.ts`), because the engine reads the clock and global engine state, which
 * `tods-competition-factory/score-entry-state` must not reach. This pins the two together over regulation, overtime,
 * aggregate and level-close formats, every set sequence below, refusals and sets after the close included.
 */
import { ScoringEngine } from '@Scoring/engine/ScoringEngine';
import { replaySets } from '@Scoring/kernel/setReplay';
import { describe, expect, it } from 'vitest';

// constants and types
import type { ReplayedSet } from '@Scoring/kernel/setReplay';

type EngineReading = {
  complete: boolean;
  winningSide?: number;
  refusedAt?: number;
  refused?: string;
  ignoredAt?: number;
  setInPlayFormat?: unknown;
};

/** What score entry read from the engine, the way it read it before the replay existed. */
function engineReading(matchUpFormat: string, sets: ReplayedSet[]): EngineReading {
  const engine = new ScoringEngine({ matchUpFormat });
  for (const [index, set] of sets.entries()) {
    try {
      const result: any = engine.addSet({
        side1Score: set.side1Score ?? 0,
        side2Score: set.side2Score ?? 0,
        ...(set.side1TiebreakScore !== undefined && { side1TiebreakScore: set.side1TiebreakScore }),
        ...(set.side2TiebreakScore !== undefined && { side2TiebreakScore: set.side2TiebreakScore }),
      } as any);
      if (result?.recorded === false) return { complete: false, ignoredAt: index };
    } catch (error) {
      return { complete: false, refusedAt: index, refused: (error as Error).message };
    }
  }
  const complete = engine.isComplete();
  const winner = engine.getWinner();
  const winningSide = winner === 1 || winner === 2 ? winner : undefined;
  return complete ? { complete, winningSide } : { complete, setInPlayFormat: engine.getSetInPlayFormat() };
}

function replayReading(matchUpFormat: string, sets: ReplayedSet[]): EngineReading {
  const replay = replaySets(matchUpFormat, sets);
  if (replay.ignoredAt !== undefined) return { complete: false, ignoredAt: replay.ignoredAt };
  if (replay.refusedAt !== undefined) return { complete: false, refusedAt: replay.refusedAt, refused: replay.refused };
  if (replay.complete) return { complete: true, winningSide: replay.winningSide };
  return { complete: false, setInPlayFormat: replay.setInPlayFormat };
}

const set = (side1Score: number, side2Score: number, tiebreaks?: [number, number]): ReplayedSet => ({
  side1Score,
  side2Score,
  ...(tiebreaks && { side1TiebreakScore: tiebreaks[0], side2TiebreakScore: tiebreaks[1] }),
});

const SEQUENCES: Record<string, ReplayedSet[][]> = {
  'SET3-S:6/TB7': [
    [],
    [set(6, 4)],
    [set(6, 4), set(6, 3)],
    [set(6, 4), set(3, 6)],
    [set(6, 4), set(3, 6), set(7, 6, [7, 3])],
    [set(6, 4), set(6, 3), set(6, 2)],
    [set(9, 1)],
    [set(4, 2)],
  ],
  'SET3-S:6/TB7-F:TB10': [
    [set(6, 4), set(4, 6)],
    [set(6, 4), set(4, 6), set(1, 0, [10, 8])],
  ],
  'SET5-S:6/TB7': [
    [set(6, 4), set(6, 4), set(6, 4)],
    [set(6, 4), set(4, 6), set(6, 4), set(4, 6)],
  ],
  'SET1-S:TB10': [[set(1, 0, [10, 8])], [set(0, 1, [3, 10])]],
  'SET3XA-S:T10-F:TB1': [
    [set(3, 2), set(1, 1), set(0, 1)],
    [set(3, 2), set(1, 2), set(2, 2)],
  ],
  'SET2XA-S:T10': [
    [set(3, 3), set(2, 2)],
    [set(3, 1), set(2, 2)],
  ],
  'HAL2X-S:TB11': [[set(1, 0, [11, 5]), set(0, 1, [5, 11])]],
  'HAL2XA-S:T40P-O:1/T10P': [
    [set(1, 1), set(0, 0)],
    [set(1, 1), set(0, 0), set(1, 0)],
    [set(2, 1), set(1, 0)],
  ],
  'HAL2XA-S:T45P-O:2X/T15P-F:SO5': [
    [set(1, 1), set(0, 0), set(1, 1), set(0, 0)],
    [set(1, 1), set(0, 0), set(1, 1), set(0, 0), set(5, 4)],
    [set(1, 1), set(0, 0), set(1, 1), set(0, 0), set(5, 5)],
  ],
  'HAL2XA-S:T45P-O:2X/T15P-F:TB1': [[set(1, 1), set(0, 0), set(0, 0), set(0, 0), set(1, 0)]],
  'PER3XA-S:T20P-O:1SD/T5P-F:TB1': [
    [set(1, 1), set(0, 0), set(1, 1)],
    [set(1, 1), set(0, 0), set(1, 1), set(1, 0)],
    [set(1, 1), set(0, 0), set(1, 1), set(1, 1)],
  ],
  'PER3XA-S:T20P-O:USD/T20P': [[set(1, 1), set(0, 0), set(0, 0), set(0, 0), set(1, 0)]],
  'QTR4XA-S:T12P-O:U/T5P': [[set(20, 18), set(15, 17), set(22, 22), set(19, 19), set(10, 10), set(12, 9)]],
  'SET1-S:P32': [[set(16, 16)], [set(17, 15)]],
  unparseable: [[], [set(6, 4)]],
};

describe('replaySets reads set totals exactly as ScoringEngine.addSet does', () => {
  for (const [matchUpFormat, sequences] of Object.entries(SEQUENCES)) {
    it(`${matchUpFormat}: every sequence and every prefix of it`, () => {
      for (const sequence of sequences) {
        for (let length = 0; length <= sequence.length; length += 1) {
          const sets = sequence.slice(0, length);
          expect(replayReading(matchUpFormat, sets)).toEqual(engineReading(matchUpFormat, sets));
        }
      }
    });
  }

  it('the comparison can fail: a deliberately wrong reading is told apart', () => {
    // a control for the differential itself: were both readings computed the same wrong way, this would still pass
    const sets = [set(6, 4), set(6, 3)];
    expect(engineReading('SET3-S:6/TB7', sets)).toEqual({ complete: true, winningSide: 1 });
    expect(replayReading('SET3-S:6/TB7', sets)).not.toEqual(engineReading('SET3-S:6/TB7', sets.slice(0, 1)));
  });

  it('reports where the match was completed, and a set offered after it', () => {
    let result: any = replaySets('SET3-S:6/TB7', [set(6, 4), set(6, 3)]);
    expect(result).toMatchObject({ complete: true, winningSide: 1, completedAt: 1 });

    result = replaySets('SET3-S:6/TB7', [set(6, 4), set(6, 3), set(6, 2)]);
    expect(result.complete).toBe(false);
    expect(result.ignoredAt).toBe(2);
  });
});
