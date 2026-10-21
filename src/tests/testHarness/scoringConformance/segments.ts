import { captureConformanceCase } from '../corpus/scoringScenariosConformance';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { outcome, type Outcome, type SetOutcome } from './conformance';
import { expect } from 'vitest';

/**
 * Conformance for streams that close segments (step 7, phase B, of the 2026-10-17 scoring-engine
 * assessment). `conforms` only adds points; a timed segment ends only when the host says time is up
 * (`endSegment`), and a segment of outs takes only set totals (`addSet`). A stream here is
 * space-separated tokens:
 *
 * - a run of `1`s and `2`s: points, one per character, to the side named;
 * - `g` then a run of `1`s and `2`s: whole games, one per character, to the side named (`addGame`);
 * - `|`: the segment in play ends (`endSegment`);
 * - `S:a-b`: a set total, side 1 `a`, side 2 `b` (`addSet`).
 *
 * `segmentConforms` holds the engine to the outcome the definition gives the same five ways `conforms`
 * does: as played; in the `winningSide` spelling; mirrored; through a correction round trip (undo
 * every entry, redo every entry, re-enter the last point by editPoint); and through a
 * save/load/rebuild round trip.
 */

type Step =
  | { kind: 'point'; winner: 0 | 1 }
  | { kind: 'game'; winner: 0 | 1 }
  | { kind: 'end' }
  | { kind: 'set'; scores: [number, number] };

const side = (char: string, token: string): 0 | 1 => {
  if (char !== '1' && char !== '2') throw new Error(`unknown stream token "${token}"`);
  return char === '1' ? 0 : 1;
};

export function steps(spec: string): Step[] {
  return spec
    .split(' ')
    .filter(Boolean)
    .flatMap((token): Step[] => {
      if (token === '|') return [{ kind: 'end' }];
      const set = /^S:(\d+)-(\d+)$/.exec(token);
      if (set) return [{ kind: 'set', scores: [Number(set[1]), Number(set[2])] }];
      if (token.startsWith('g'))
        return [...token.slice(1)].map((char): Step => ({ kind: 'game', winner: side(char, token) }));
      return [...token].map((char): Step => ({ kind: 'point', winner: side(char, token) }));
    });
}

function mirrorStep(step: Step): Step {
  if (step.kind === 'point' || step.kind === 'game') return { ...step, winner: (1 - step.winner) as 0 | 1 };
  if (step.kind === 'set') return { kind: 'set', scores: [step.scores[1], step.scores[0]] };
  return step;
}

export function playSteps(format: string, stream: Step[], spelling: 'winner' | 'winningSide' = 'winner') {
  const engine = new ScoringEngine({ matchUpFormat: format });
  for (const step of stream) {
    if (step.kind === 'end') engine.endSegment();
    else if (step.kind === 'game') engine.addGame({ winner: step.winner });
    else if (step.kind === 'set') engine.addSet({ side1Score: step.scores[0], side2Score: step.scores[1] });
    else if (spelling === 'winner') engine.addPoint({ winner: step.winner });
    else engine.addPoint({ winningSide: (step.winner + 1) as 1 | 2 });
  }
  return engine;
}

function mirrorOutcome(expected: Outcome): Outcome {
  const sets = expected.sets.map((set): SetOutcome => {
    const games: [number, number] = [set[1], set[0]];
    return set.length === 3 ? [...games, [set[2][1], set[2][0]]] : games;
  });
  const winningSide = expected.winningSide && ((3 - expected.winningSide) as 1 | 2);
  return { sets, ...(winningSide ? { winningSide } : {}), complete: expected.complete };
}

export function segmentConforms(format: string, spec: string, expected: Outcome): void {
  const stream = steps(spec);
  const engine = playSteps(format, stream);
  expect({ format, as: 'played', outcome: outcome(engine) }).toEqual({ format, as: 'played', outcome: expected });

  const spelled = outcome(playSteps(format, stream, 'winningSide'));
  expect({ format, as: 'winningSide', outcome: spelled }).toEqual({ format, as: 'winningSide', outcome: expected });

  const mirrored = outcome(playSteps(format, stream.map(mirrorStep)));
  expect({ format, as: 'mirrored', outcome: mirrored }).toEqual({
    format,
    as: 'mirrored',
    outcome: mirrorOutcome(expected),
  });

  // corrections: undo every entry, redo every entry, then re-enter the last point by editPoint
  const depth = engine.getUndoDepth();
  if (depth) {
    engine.undo(depth);
    engine.redo(depth);
  }
  const recorded = engine.getState().history?.points.length ?? 0;
  if (recorded) {
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
  if (depth) {
    loaded.undo();
    loaded.redo();
  }
  expect({ format, as: 'reloaded', outcome: outcome(loaded) }).toEqual({ format, as: 'reloaded', outcome: expected });

  // the golden corpus records the case as played, when it asks (CORPUS_CONFORMANCE_OUT); a no-op otherwise
  captureConformanceCase({ helper: 'segmentConforms', format, spec, actions: stream.map(stepAction) });
}

/** A stream step as the corpus directive that plays it. */
function stepAction(step: Step) {
  if (step.kind === 'end') return { method: 'endSegment', params: {} };
  if (step.kind === 'game') return { method: 'addGame', params: { winner: step.winner } };
  if (step.kind === 'set')
    return { method: 'addSet', params: { side1Score: step.scores[0], side2Score: step.scores[1] } };
  return { method: 'addPoint', params: { winner: step.winner } };
}
