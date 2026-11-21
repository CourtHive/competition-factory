import { resetIndexExperiment } from '@Tests/testHarness/outcomeExternalIndex';
import { nextPlayable } from '@Tests/testHarness/exitPropagation/driver';
import { getOutcomePipeline, setOutcomePipeline } from '@Global/state/globalState';
import { readFileSync, writeFileSync } from 'node:fs';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';
// constants and types
import { OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COLLEGE_DEFAULT } from '@Constants/tieFormatConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';
import { SINGLES, TEAM } from '@Constants/eventConstants';
import type { Tournament } from '@Types/tournamentTypes';
const drawId = 'external-cost';
const scored = {
  winningSide: 1,
  score: {
    sets: [
      { side1Score: 6, side2Score: 1, winningSide: 1 },
      { side1Score: 6, side2Score: 1, winningSide: 1 },
    ],
  },
};
type Workload = 'score' | 'exit' | 'unwind';

function measure(drawSize: number, eventType: typeof SINGLES | typeof TEAM, workload: Workload, seed: number) {
  let result: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawId,
        drawSize,
        eventType,
        drawType: SINGLE_ELIMINATION,
        ...(eventType === TEAM ? { tieFormatName: COLLEGE_DEFAULT } : {}),
      },
    ],
    nonRandom: seed,
    setState: true,
  });
  expect(result.drawIds).toEqual([drawId]);

  resetIndexExperiment();
  let mutationMs = 0;
  let calls = 0;
  const write = (
    matchUpId: string,
    outcome: typeof scored | { winningSide: number; matchUpStatus: typeof WALKOVER },
  ) => {
    const start = performance.now();
    let result: any = tournamentEngine.setMatchUpStatus({
      allowChangePropagation: true,
      propagateExitStatus: true,
      matchUpId,
      drawId,
      outcome,
    });
    mutationMs += performance.now() - start;
    calls++;
    expect(result).toHaveProperty('success', true);
  };

  const start = performance.now();
  for (let index = 0; index < drawSize - 1; index++) {
    const next = nextPlayable(drawId);
    expect(next?.matchUpId, `size=${drawSize}, index=${index}`).toBeTruthy();
    const matchUpId: string = next.matchUpId;
    const exit = workload !== 'score' && index % 4 === 0;
    if (exit) write(matchUpId, { winningSide: 1, matchUpStatus: WALKOVER });
    if (!exit || workload === 'unwind') write(matchUpId, scored);
  }
  const traversalMs = performance.now() - start;
  expect(nextPlayable(drawId)).toBeUndefined();
  const index = resetIndexExperiment();
  return {
    pipeline: getOutcomePipeline(),
    drawSize,
    eventType,
    workload,
    seed,
    calls,
    mutationMs,
    traversalMs,
    ...(process.env.OUTCOME_EXTERNAL_INDEX ? { index } : {}),
  };
}

it.skipIf(!process.env.OUTCOME_EXTERNAL_COST_JSON)(
  'measures completion with scores, exits, and immediate exit corrections',
  () => {
    const samples: ReturnType<typeof measure>[] = [];
    const largeTeam = !!process.env.OUTCOME_EXTERNAL_LARGE_TEAM;
    const eventTypes = largeTeam ? ([TEAM] as const) : ([SINGLES, TEAM] as const);
    const standardSizes = { [SINGLES]: [16, 32, 64, 128, 256], [TEAM]: [8, 16, 32, 64] };
    for (const eventType of eventTypes) {
      const sizes = largeTeam ? [128, 256] : standardSizes[eventType];
      for (const size of sizes) {
        for (const workload of ['score', 'exit', 'unwind'] as const) {
          for (const seed of [41, 42, 43]) samples.push(measure(size, eventType, workload, seed));
        }
      }
    }
    const output = process.env.OUTCOME_EXTERNAL_COST_JSON;
    if (output) writeFileSync(output, JSON.stringify(samples, null, 2) + '\n');
  },
  1_200_000,
);

it.skipIf(!process.env.OUTCOME_EXTERNAL_TEAM_COST_JSON)('measures line correction on the public TEAM record', () => {
  const fixture = 'src/tests/testHarness/teamMadness.codes.json';
  const record: Tournament = JSON.parse(readFileSync(fixture, 'utf8'));
  const draw = record.events?.[0]?.drawDefinitions?.[0];
  const group = draw?.structures?.[0]?.structures?.[0];
  const line = group?.matchUps?.[0]?.tieMatchUps?.[0];
  if (!draw || !line?.score || line.winningSide !== 1 || line.score.scoreStringSide1 === '6-1 6-1') {
    throw new Error('TEAM fixture target moved');
  }
  const samples: { mode: string; ms: number }[] = [];
  const maintainIndex = !!process.env.OUTCOME_EXTERNAL_INDEX;
  const indexByMode = new Map<string, ReturnType<typeof resetIndexExperiment>>();
  try {
    for (const mode of [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const) {
      setOutcomePipeline(mode);
      resetIndexExperiment();
      if (maintainIndex) tournamentEngine.setState(structuredClone(record));
      for (let repetition = 0; repetition < 31; repetition++) {
        if (!maintainIndex) tournamentEngine.setState(structuredClone(record));
        const start = performance.now();
        let result: any = tournamentEngine.setMatchUpStatus({
          drawId: draw.drawId,
          matchUpId: line.matchUpId,
          outcome: maintainIndex && repetition % 2 ? { winningSide: 1, score: structuredClone(line.score) } : scored,
        });
        const ms = performance.now() - start;
        expect(result).toHaveProperty('success', true);
        if (repetition) samples.push({ mode, ms });
      }
      indexByMode.set(mode, resetIndexExperiment());
    }
  } finally {
    setOutcomePipeline();
  }
  const output = process.env.OUTCOME_EXTERNAL_TEAM_COST_JSON;
  const index = maintainIndex ? Object.fromEntries(indexByMode) : undefined;
  if (output) writeFileSync(output, JSON.stringify({ fixture, samples, index }, null, 2) + '\n');
});
