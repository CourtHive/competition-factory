#!/usr/bin/env node
/** Diagnostic only: no probabilistic CI gate. Run against an explicitly named factory build.
 * node scripts/qualifier-placement-sweep.mjs <build.cjs> [runs=5000]
 * Each configuration sweeps the same seed interval; reported tails are the exact last four positions. */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [build, count = '5000'] = process.argv.slice(2);
const runs = Number(count);
if (!build || !Number.isInteger(runs) || runs < 1) {
  throw new Error('usage: qualifier-placement-sweep.mjs <factory-build.cjs> [positive run count]');
}
const factory = createRequire(import.meta.url)(resolve(build));
const choose = (n, k) => {
  let combinations = 1;
  for (let i = 1; i <= k; i++) combinations = (combinations * (n - i + 1)) / i;
  return combinations;
};

for (const drawType of ['LUCKY_DRAW', 'SINGLE_ELIMINATION']) {
  for (const drawSize of [8, 16, 32]) {
    const positions = Array(drawSize).fill(0);
    let tail = 0;
    let pairedDraws = 0;
    for (let nonRandom = 1; nonRandom <= runs; nonRandom++) {
      const generated = factory.mocksEngine.generateTournamentRecord({
        setState: true,
        nonRandom,
        drawProfiles: [{ drawType, drawSize, seedsCount: 0, participantsCount: drawSize - 4, qualifiersCount: 4 }],
      });
      if (generated.error) throw new Error(JSON.stringify({ drawType, drawSize, nonRandom, error: generated.error }));
      const main = generated.tournamentRecord.events[0].drawDefinitions[0].structures.find((s) => s.stage === 'MAIN');
      const qualifiers = new Set(main.positionAssignments.filter((a) => a.qualifier).map((a) => a.drawPosition));
      if (qualifiers.size !== 4) throw new Error('measurement requires exactly four qualifier positions');
      for (const position of qualifiers) positions[position - 1]++;
      if ([...qualifiers].every((position) => position > drawSize - 4)) tail++;
      if (
        main.matchUps.some(
          (m) =>
            m.roundNumber === 1 &&
            m.drawPositions?.length === 2 &&
            m.drawPositions.every((position) => qualifiers.has(position)),
        )
      )
        pairedDraws++;
    }
    const probability = 4 / drawSize;
    const expected = runs * probability;
    const standardDeviation = Math.sqrt(runs * probability * (1 - probability));
    console.log(
      JSON.stringify({
        build: resolve(build),
        version: factory.version(),
        drawType,
        drawSize,
        seeds: [1, runs],
        positions,
        expectedPerPosition: expected,
        maxStandardDeviations: Math.max(...positions.map((count) => Math.abs(count - expected) / standardDeviation)),
        exactTailDraws: tail,
        expectedExactTailDraws: runs / choose(drawSize, 4),
        qualifierVersusQualifierDraws: pairedDraws,
      }),
    );
  }
}
