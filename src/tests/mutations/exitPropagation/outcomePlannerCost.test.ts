import { plannerIndexCounts, selectPlannerIndex, tracePlannerDecisions } from '@Tests/testHarness/outcomePlannerIndex';
import { nextPlayable } from '@Tests/testHarness/exitPropagation/driver';
import { TOPICS } from '@Tests/testHarness/outcome/directionFixtures';
import { canonicalHash } from '@Tests/testHarness/corpus/hash';
import { setClock } from '@Tools/clock';
import { createHash } from 'node:crypto';
import { getOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { writeFileSync } from 'node:fs';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';
// constants and types
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COLLEGE_DEFAULT } from '@Constants/tieFormatConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';
import { SINGLES, TEAM } from '@Constants/eventConstants';
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

// Trace runs grade every call independently of the timing run.
function captureTrace() {
  if (!process.env.PLANNER_INDEX_TRACE) return;
  const plans: string[] = [];
  const notices: string[] = [];
  const hash = createHash('sha256');
  tracePlannerDecisions(plans);
  setSubscriptions({
    subscriptions: Object.fromEntries(
      TOPICS.map((topic) => [
        topic,
        (payload: unknown) => {
          notices.push(canonicalHash({ topic, payload }));
        },
      ]),
    ),
  });
  return {
    step(result: unknown) {
      hash.update(
        canonicalHash({
          result,
          plans,
          notices,
          state: canonicalHash(tournamentEngine.getTournament().tournamentRecord),
        }),
      );
      plans.length = notices.length = 0;
    },
    digest: () => hash.digest('hex'),
  };
}
afterEach(() => {
  selectPlannerIndex(false);
  tracePlannerDecisions();
  setSubscriptions({ subscriptions: {} });
  setClock();
});

function measure(drawSize: number, eventType: typeof SINGLES | typeof TEAM, workload: Workload, seed: number) {
  if (process.env.PLANNER_INDEX_TRACE) setClock('2026-10-25T00:01:00.000Z');
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

  selectPlannerIndex(process.env.PLANNER_INDEX === 'retained');
  const trace = captureTrace();
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
    trace?.step(result);
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
  const index = plannerIndexCounts();
  return {
    digest: trace?.digest(),
    pipeline: getOutcomePipeline(),
    drawSize,
    eventType,
    workload,
    seed,
    calls,
    mutationMs,
    traversalMs,
    planner: process.env.PLANNER_INDEX,
    index,
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
