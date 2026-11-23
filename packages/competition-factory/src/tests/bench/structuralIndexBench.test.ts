import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { performance } from 'node:perf_hooks';
import { expect, it } from 'vitest';

import {
  COMPASS,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

/**
 * THE STRUCTURAL INDEX'S COST (outcome v2 executor plan § 3.1.1): `buildStructuralIndex` against a full in-context
 * hydration of the same draw, G4's shapes, median of 15 samples of 20 builds each. Inert by default:
 *
 *   INDEX_BENCH=1 TZ=UTC npx vitest run --silent=false src/tests/bench/structuralIndexBench.test.ts
 */
const SHAPES = [
  [SINGLE_ELIMINATION, 32],
  [SINGLE_ELIMINATION, 64],
  [SINGLE_ELIMINATION, 128],
  [SINGLE_ELIMINATION, 256],
  [FEED_IN_CHAMPIONSHIP, 64],
  [ROUND_ROBIN, 32],
  [DOUBLE_ELIMINATION, 64],
  [COMPASS, 64],
] as const;

const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
function time(fn: () => unknown, repeats = 15) {
  for (let i = 0; i < 3; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < repeats; i++) {
    const start = performance.now();
    for (let j = 0; j < 20; j++) fn();
    samples.push((performance.now() - start) / 20);
  }
  return median(samples);
}

it.skipIf(!process.env.INDEX_BENCH)('structural index vs hydration', { timeout: 300000 }, () => {
  const rows: string[] = [];
  for (const [drawType, drawSize] of SHAPES) {
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType, drawSize, completionGoal: Math.floor(drawSize / 2) }],
      completeAllMatchUps: true,
      setState: false,
    } as any);
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const full = time(() => getAllDrawMatchUps({ tournamentRecord, drawDefinition, event, inContext: true }));
    const index = time(() => buildStructuralIndex({ tournamentRecord, drawDefinition, event }));
    const count = buildStructuralIndex({ tournamentRecord, drawDefinition, event }).matchUps.length;
    expect(count).toBeGreaterThan(0);
    rows.push(
      `| ${drawType} ${drawSize} | ${count} | ${full.toFixed(3)} ms | ${index.toFixed(3)} ms | ${((100 * index) / full).toFixed(1)}% |`,
    );
  }
  console.log(
    ['| shape | matchUps | hydration | index | index / hydration |', '|---|---:|---:|---:|---:|', ...rows].join('\n'),
  );
});
