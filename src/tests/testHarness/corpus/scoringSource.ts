import { createSeededRandom, setRandomSource } from '@Tools/prng';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { getSchemaWriteMode } from '@Global/state/globalState';
import { createMatchUp } from '@Mutate/scoring/createMatchUp';
import { canonicalHash, canonicalObject } from './hash';
import { isComplete } from '@Query/scoring/isComplete';
import { canonicalJson } from '@Tools/canonicalJson';
import { addPoint } from '@Mutate/scoring/addPoint';
import { setClock } from '@Tools/clock';
import fs from 'fs';
import path from 'path';

// constants
import {
  FORMAT_ATP_DOUBLES,
  FORMAT_FAST4,
  FORMAT_SHORT_SETS,
  FORMAT_STANDARD,
  FORMAT_STANDARD_NOAD,
} from '@Fixtures/scoring/matchUpFormats';

/**
 * Golden corpus C4b: the point-by-point scoring engine as a direct source.
 *
 * `createMatchUp` and `addPoint` are pure: a scoring matchUp in, a new one out. Tests call them
 * directly, so the harvest never saw them. Their state is a scoring matchUp, not a tournament
 * record, so the envelope's initial record is minimal and each step carries the engine's
 * OBSERVABLE as its value: the sets, the score strings, the winning side and whether the match is
 * complete. Recording the whole matchUp per point would be quadratic in the points; the last step
 * carries it once, so a port can compare its final state in full.
 *
 * Streams are seeded: one PRNG decides each point's winner, fair or biased, until the match is
 * complete or the cap is reached. One extra point is added after completion and recorded as it is,
 * so the spec can say what the engine does with a point that arrives after the match has ended.
 * `calculatePointsTo` and `inferServeSide` take internal format structures and are not corpus
 * directives; `resolvePointValue` is covered with a few authored inputs below.
 */
export const SCORING_FORMATS = [
  FORMAT_STANDARD,
  FORMAT_STANDARD_NOAD,
  FORMAT_ATP_DOUBLES,
  FORMAT_SHORT_SETS,
  FORMAT_FAST4,
  'SET1-S:8/TB7',
  'SET1-S:TB10',
  'SET5-S:6/TB7',
];

export const STREAMS: { name: string; bias: number }[] = [
  { name: 'fair', bias: 0.5 },
  { name: 'side1-heavy', bias: 0.72 },
  { name: 'side2-heavy', bias: 0.28 },
];

const POINT_CAP = 600;
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function observable(matchUp: any, withMatchUp = false) {
  return canonicalObject({
    sets: matchUp.score?.sets ?? [],
    scoreStringSide1: matchUp.score?.scoreStringSide1,
    scoreStringSide2: matchUp.score?.scoreStringSide2,
    winningSide: matchUp.winningSide,
    complete: isComplete(matchUp),
    ...(withMatchUp ? { matchUp } : {}),
  });
}

export function scoringScenario({
  matchUpFormat,
  stream,
  seed,
  clock,
}: {
  matchUpFormat: string;
  stream: { name: string; bias: number };
  seed: number;
  clock: string;
}) {
  const record = { tournamentId: 'corpus-scoring' };
  const hash = canonicalHash(record);
  setRandomSource(seed);
  setClock(clock);
  const rng = createSeededRandom(seed ^ 0x5bd1e995);
  const steps: any[] = [];
  let matchUp: any = createMatchUp({ matchUpFormat });
  steps.push({
    directive: { method: 'createMatchUp', params: { matchUpFormat } },
    result: { success: true, value: observable(matchUp) },
    patch: [],
    hash,
  });
  let points = 0;
  while (!isComplete(matchUp) && points < POINT_CAP) {
    const winner = rng() < stream.bias ? 0 : 1;
    matchUp = addPoint(matchUp, { winner });
    points += 1;
    steps.push({
      directive: { method: 'addPoint', params: { winner } },
      result: { success: true, value: observable(matchUp) },
      patch: [],
      hash,
    });
  }
  const complete = isComplete(matchUp);
  // one point after the end, recorded as it is
  const before = canonicalJson(observable(matchUp));
  matchUp = addPoint(matchUp, { winner: 0 });
  const after = observable(matchUp, true);
  steps.push({
    directive: { method: 'addPoint', params: { winner: 0 } },
    result: { success: true, value: after },
    patch: [],
    hash,
  });
  const postCompletionChanged = canonicalJson(observable(matchUp)) !== before;
  setRandomSource();
  setClock();
  return {
    scenario: {
      corpusVersion: 1,
      factoryVersion: factoryVersion(),
      schemaWriteMode: getSchemaWriteMode(),
      canonicalization: 'RFC8785',
      scenarioId: `scoring/${slug(matchUpFormat)}/${stream.name}-seed-${seed}`,
      source: {
        kind: 'authored',
        ref: `scoring stream ${stream.name} (bias ${stream.bias}) seed=${seed} format=${matchUpFormat}`,
      },
      seed,
      clock,
      tags: ['scoring', complete ? 'complete' : 'capped'],
      initial: { record, hash },
      steps,
      invariants: [],
      properties: [],
    },
    points,
    complete,
    postCompletionChanged,
  };
}

export function recordScoring({
  outDir,
  clock = '2026-10-01T12:00:00.000Z',
  seeds = [1, 2, 3],
}: {
  outDir: string;
  clock?: string;
  seeds?: number[];
}) {
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'scoring.jsonl');
  fs.writeFileSync(outPath, '');
  const summary = { scenarios: 0, complete: 0, capped: 0, points: 0, postCompletionChanged: 0 };
  const scenarios: any[] = [];
  for (const matchUpFormat of SCORING_FORMATS) {
    for (const stream of STREAMS) {
      for (const seed of seeds) {
        const { scenario, points, complete, postCompletionChanged } = scoringScenario({
          matchUpFormat,
          stream,
          seed,
          clock,
        });
        fs.appendFileSync(outPath, JSON.stringify(scenario) + '\n');
        scenarios.push(scenario);
        summary.scenarios += 1;
        summary.points += points;
        if (complete) summary.complete += 1;
        else summary.capped += 1;
        if (postCompletionChanged) summary.postCompletionChanged += 1;
      }
    }
  }
  return { scenarios, summary };
}

/** Chain the values: create, then every point, comparing the observable at each step. */
export function replayScoring(scenario: any): { step: number; expected: string; actual: string }[] {
  const mismatches: { step: number; expected: string; actual: string }[] = [];
  setRandomSource(scenario.seed);
  setClock(scenario.clock);
  try {
    let matchUp: any;
    scenario.steps.forEach((step: any, index: number) => {
      const { method, params } = step.directive;
      if (method === 'createMatchUp') matchUp = createMatchUp(params);
      else if (method === 'addPoint') matchUp = addPoint(matchUp, params);
      else return;
      const last = index === scenario.steps.length - 1;
      const actual = canonicalJson(observable(matchUp, last));
      const expected = canonicalJson(step.result.value);
      if (actual !== expected)
        mismatches.push({ step: index, expected: expected.slice(0, 200), actual: actual.slice(0, 200) });
    });
  } finally {
    setRandomSource();
    setClock();
  }
  return mismatches;
}
