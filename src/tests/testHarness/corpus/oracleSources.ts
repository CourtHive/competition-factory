import { generateDraw, playForward as playRoutes, compareRoutes } from '../exitPropagation/routeComparison';
import { generateSchedule, prepareDraw, randomConfig } from '../exitPropagation/sweep';
import { cellLabel, playMatrixCell, type MatrixCell } from '../exitPropagation/matrixCells';
import type { CorpusRecorder } from './recorder';

/**
 * Golden corpus C2b: the oracles that already exist, wrapped as corpus sources.
 *
 * Each oracle drives the engine through core calls on a schedule of its own (the matrix's exit
 * on the first playable matchUp then every third step; the census's seeded random walk; the
 * route differential's play-forward and flips). None of that is re-implemented here: an oracle
 * runs unchanged under the recorder, between `beginTest` and `endTest`, and the recorder
 * harvests what it did. What this module adds is the naming: a scenario id by cell, seed or flip,
 * and a `source` whose `ref` says how to regenerate it.
 *
 * A property or invariant the oracle checks is NOT re-run here; the recorder records the two
 * structural invariants it can evaluate on raw state. The oracles' own properties stay with the
 * oracles.
 */
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The 600-cell matrix (or any cell list) under its own schedule, optionally under a policy. */
export function recordMatrixCells({
  recorder,
  cells,
  prefix = 'oracle/matrix',
  kind = 'matrix',
  policyDefinitions,
  arm = 'exits',
}: {
  recorder: CorpusRecorder;
  cells: MatrixCell[];
  prefix?: string;
  kind?: string;
  policyDefinitions?: any;
  arm?: 'exits' | 'control';
}): number {
  let played = 0;
  for (const cell of cells) {
    const label = cellLabel(cell);
    recorder.beginTest({
      file: prefix,
      name: label,
      seed: cell.seed,
      ordinal: 1,
      scenarioId: `${prefix}/${slug(label)}${arm === 'control' ? '/control' : ''}`,
      source: { kind, ref: `${label} seed=${cell.seed} arm=${arm}${policyDefinitions ? ' policy' : ''}` },
    });
    if (playMatrixCell(cell, `corpus-${cell.seed}`, arm, policyDefinitions)) played += 1;
    recorder.endTest();
  }
  return played;
}

/** The census: a seeded random walk per seed, as `census.test.ts` generates it. */
export function recordCensus({
  recorder,
  seedStart,
  seedCount,
  maxSteps = 30,
}: {
  recorder: CorpusRecorder;
  seedStart: number;
  seedCount: number;
  maxSteps?: number;
}): number {
  let generated = 0;
  for (let seed = seedStart; seed < seedStart + seedCount; seed++) {
    const config = randomConfig(seed);
    const drawId = `corpus-sweep-${seed}`;
    recorder.beginTest({
      file: 'oracle/census',
      name: `seed-${seed}`,
      seed,
      ordinal: 1,
      scenarioId: `oracle/census/${slug(config.drawType)}-${config.drawSize}/seed-${seed}`,
      source: { kind: 'census', ref: `SEED_START=${seed} SEED_COUNT=1 MAX_STEPS=${maxSteps}` },
    });
    try {
      if (prepareDraw(config, drawId)) {
        generateSchedule(config, drawId, maxSteps);
        generated += 1;
      }
    } finally {
      recorder.endTest();
    }
  }
  return generated;
}

/**
 * The route differential: one scenario for the play-forward of each draw, then one per flip
 * (a flip replays twice, so the recorder emits it as parts). `limitPerDraw` caps the flips.
 */
export function recordRouteFlips({
  recorder,
  drawTypes,
  drawSize = 16,
  seed = 1,
  participantCounts,
  limitPerDraw,
}: {
  recorder: CorpusRecorder;
  drawTypes: string[];
  drawSize?: number;
  seed?: number;
  participantCounts?: number[];
  limitPerDraw?: number;
}): { draws: number; flips: number } {
  const counts = participantCounts ?? [drawSize];
  let draws = 0;
  let flips = 0;
  for (const participantsCount of counts) {
    for (const drawType of drawTypes) {
      const drawId = `corpus-diff-${drawType}-${participantsCount}`;
      const base = `oracle/route/${slug(drawType)}-${participantsCount}`;
      recorder.beginTest({
        file: 'oracle/route',
        name: `${drawType} ${participantsCount} play-forward`,
        seed,
        ordinal: 1,
        scenarioId: `${base}/play-forward`,
        source: {
          kind: 'route-differential',
          ref: `${drawType} drawSize=${drawSize} participants=${participantsCount} seed=${seed}`,
        },
      });
      generateDraw(drawType, drawId, drawSize, seed, participantsCount);
      const playOrder = playRoutes(drawId);
      recorder.endTest();
      draws += 1;
      const upto = limitPerDraw === undefined ? playOrder.length : Math.min(limitPerDraw, playOrder.length);
      for (let index = 0; index < upto; index++) {
        const coord = playOrder[index];
        recorder.beginTest({
          file: 'oracle/route',
          name: `${drawType} ${participantsCount} flip ${index}`,
          seed,
          ordinal: 1,
          scenarioId: `${base}/flip-${index}`,
          source: {
            kind: 'route-differential',
            ref: `${drawType} drawSize=${drawSize} participants=${participantsCount} seed=${seed} flip=${index} (${coord.structureName} ${coord.roundNumber}.${coord.roundPosition})`,
          },
        });
        compareRoutes({ participantsCount, playOrder, drawType, drawSize, drawId, index, seed });
        recorder.endTest();
        flips += 1;
      }
    }
  }
  return { draws, flips };
}
