import { captureConformanceCase } from '../corpus/scoringScenariosConformance';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { expect } from 'vitest';

/**
 * Independent conformance cases for the scoring engine (step 7, phase B, of the 2026-10-17
 * scoring-engine assessment).
 *
 * A case is a point stream written by hand from a governing rule, with the outcome the RULE gives,
 * never one recorded from the engine. `conforms` then holds the engine to it five ways: as played; in
 * the 1-indexed `winningSide` spelling; mirrored (side 2 winning what side 1 won must give the mirror
 * image); through a correction round trip (undo everything, redo everything, re-enter the last point
 * by editPoint); and through a save/load/rebuild round trip.
 */

/** A point stream: one character per point, `1` or `2` for the side that won it; spaces are ignored. */
export function points(spec: string): (0 | 1)[] {
  return [...spec.replaceAll(' ', '')].map((side) => {
    if (side !== '1' && side !== '2') throw new Error(`a point stream holds 1s and 2s, not "${side}"`);
    return side === '1' ? 0 : 1;
  });
}

/** A game won to love by `side`, for formats whose game is four points. */
export const LOVE_GAME = { 1: '1111', 2: '2222' } as const;

/** Games won to love, in order: `games('1212')` is side 1, side 2, side 1, side 2. */
export function games(winners: string): string {
  return [...winners.replaceAll(' ', '')].map((side) => LOVE_GAME[side as '1' | '2']).join(' ');
}

/** A set as the rule scores it: games won by each side, and the tiebreak's points when one was played. */
export type SetOutcome = [number, number] | [number, number, [number, number]];
export type Outcome = { sets: SetOutcome[]; winningSide?: 1 | 2; complete: boolean };

export function outcome(engine: ScoringEngine): Outcome {
  const state = engine.getState();
  const sets = state.score.sets.map((set): SetOutcome => {
    const games: [number, number] = [set.side1Score ?? 0, set.side2Score ?? 0];
    const tiebreak = set.side1TiebreakScore ?? set.side2TiebreakScore;
    return tiebreak === undefined ? games : [...games, [set.side1TiebreakScore ?? 0, set.side2TiebreakScore ?? 0]];
  });
  const winningSide = state.winningSide as 1 | 2 | undefined;
  return { sets, ...(winningSide ? { winningSide } : {}), complete: engine.isComplete() };
}

function mirrorOutcome(expected: Outcome): Outcome {
  const sets = expected.sets.map((set): SetOutcome => {
    const games: [number, number] = [set[1], set[0]];
    return set.length === 3 ? [...games, [set[2][1], set[2][0]]] : games;
  });
  const winningSide = expected.winningSide && ((3 - expected.winningSide) as 1 | 2);
  return { sets, ...(winningSide ? { winningSide } : {}), complete: expected.complete };
}

export function play(format: string, stream: (0 | 1)[], spelling: 'winner' | 'winningSide' = 'winner') {
  const engine = new ScoringEngine({ matchUpFormat: format });
  for (const winner of stream) {
    if (spelling === 'winner') engine.addPoint({ winner });
    else engine.addPoint({ winningSide: (winner + 1) as 1 | 2 });
  }
  return engine;
}

/**
 * Hold the engine to the outcome a rule gives for a point stream, as played, in both winner spellings,
 * mirrored, through a correction round trip and through a save/load/rebuild round trip.
 */
export function conforms(format: string, spec: string, expected: Outcome): void {
  const stream = points(spec);
  const engine = play(format, stream);
  expect({ format, as: 'played', outcome: outcome(engine) }).toEqual({ format, as: 'played', outcome: expected });

  const spelled = outcome(play(format, stream, 'winningSide'));
  expect({ format, as: 'winningSide', outcome: spelled }).toEqual({ format, as: 'winningSide', outcome: expected });

  const mirrored = outcome(
    play(
      format,
      stream.map((winner) => (1 - winner) as 0 | 1),
    ),
  );
  expect({ format, as: 'mirrored', outcome: mirrored }).toEqual({
    format,
    as: 'mirrored',
    outcome: mirrorOutcome(expected),
  });

  // corrections: undo everything, redo everything, then re-enter the last point by editPoint
  const recorded = engine.getState().history?.points.length ?? 0;
  if (recorded) {
    engine.undo(recorded);
    engine.redo(recorded);
    const last = engine.getState().history!.points[recorded - 1];
    engine.editPoint(recorded - 1, { winner: last.winner });
  }
  expect({ format, as: 'corrected', outcome: outcome(engine) }).toEqual({
    format,
    as: 'corrected',
    outcome: expected,
  });

  // persistence: save, load into a fresh engine, rebuild
  const loaded = new ScoringEngine({ matchUpFormat: format });
  loaded.setState(engine.getState());
  loaded.loadSupplementaryState(engine.getSupplementaryState());
  if (recorded) {
    loaded.undo();
    loaded.redo();
  }
  expect({ format, as: 'reloaded', outcome: outcome(loaded) }).toEqual({ format, as: 'reloaded', outcome: expected });

  // the golden corpus records the case as played, when it asks (CORPUS_CONFORMANCE_OUT); a no-op otherwise
  const actions = stream.map((winner) => ({ method: 'addPoint', params: { winner } }));
  captureConformanceCase({ helper: 'conforms', format, spec, actions });
}

/** The server of every point, in order, as the engine recorded it (0 = side 1). */
export function servers(format: string, spec: string): number[] {
  return play(format, points(spec))
    .getState()
    .history!.points.map((point) => point.server!);
}
