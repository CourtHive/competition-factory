import { plannerIndexCounts, selectPlannerIndex, tracePlannerDecisions } from '@Tests/testHarness/outcomePlannerIndex';
import { resolveTieFormat, tieFormatConstants } from '@courthive/competition-catalogue';
import { firstPlayable, nextPlayable } from '@Tests/testHarness/exitPropagation/driver';
import { TOPICS } from '@Tests/testHarness/outcome/directionFixtures';
import { canonicalHash } from '@Tests/testHarness/corpus/hash';
import { setClock } from '@Tools/clock';
import { createHash } from 'node:crypto';
import { getOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { captureReturn } from '@Tests/testHarness/outcome/returnParity';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { setRandomSource } from '@Tools/prng';
import type { Tournament } from '@Types/tournamentTypes';
import { appendFileSync, writeFileSync } from 'node:fs';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';
// constants and types
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';
import { SINGLES, TEAM } from '@Constants/eventConstants';

const { COLLEGE_DEFAULT } = tieFormatConstants;
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
        ...(eventType === TEAM ? { tieFormat: resolveTieFormat(COLLEGE_DEFAULT) } : {}),
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

type Field = typeof SINGLES | typeof TEAM;
type StepSample = { action: string; kind: string; ms: number };

function pairedArm(initial: Tournament, field: Field, size: number, seed: number, retained: boolean, audit: boolean) {
  setClock('2026-10-25T00:01:00Z');
  setRandomSource(seed);
  selectPlannerIndex(retained);
  expect(tournamentEngine.setState(structuredClone(initial)).success).toBe(true);
  const trace = audit ? capturePairedTrace() : undefined;
  const samples: StepSample[] = [];
  function update(id: string, kind: string, action: string, outcome: any) {
    const params = { drawId, matchUpId: id, outcome, allowChangePropagation: true, propagateExitStatus: true };
    const start = performance.now();
    const result = tournamentEngine.setMatchUpStatus(params);
    samples.push({ action, kind, ms: performance.now() - start });
    expect(result.error, field + ' ' + kind + ' ' + action + ' ' + JSON.stringify(result.error)).toBeUndefined();
    expect(result.success).toBe(true);
    trace?.step(captureReturn(result));
  }
  function play(match: any, serial: number) {
    const kind = match.matchUpType;
    const id = match.matchUpId;
    const winningSide = ((seed + serial) % 2) + 1;
    const completion = generateOutcomeFromScoreString({
      winningSide,
      scoreString: kind === 'DOUBLES' ? '6-1' : '6-1 6-1',
    }).outcome;
    if ((seed + serial) % 5 === 0) {
      update(id, kind, 'walkover', { winningSide, matchUpStatus: WALKOVER });
      update(id, kind, 'correct exit', completion);
    } else {
      update(id, kind, 'live', {
        matchUpStatus: 'IN_PROGRESS',
        score: { sets: [{ setNumber: 1, side1Score: 2, side2Score: 1 }] },
      });
      update(id, kind, 'complete', completion);
    }
  }
  const nextMatch = () =>
    field === SINGLES
      ? nextPlayable(drawId)
      : firstPlayable(
          tournamentEngine
            .allDrawMatchUps({ drawId, inContext: true })
            .matchUps.filter((m: any) => m.tieMatchUps?.length),
        );
  const start = performance.now();
  for (let i = 0; i < size - 1; i++) {
    const match = nextMatch();
    expect(match?.matchUpId).toBeTruthy();
    if (field === SINGLES) play(match, i);
    else {
      const lines = [...match.tieMatchUps].sort(
        (a, b) => a.collectionPosition - b.collectionPosition || a.matchUpType.localeCompare(b.matchUpType),
      );
      for (const [j, line] of lines.entries()) {
        const current = tournamentEngine.findMatchUp({ drawId, matchUpId: match.matchUpId }).matchUp;
        if (current.winningSide) break;
        play(line, i * lines.length + j);
      }
    }
  }
  const traversalMs = performance.now() - start;
  expect(nextMatch()).toBeUndefined();
  if (field === TEAM)
    for (const kind of ['SINGLES', 'DOUBLES']) expect(samples.some((s) => s.kind === kind)).toBe(true);
  const finalHash = canonicalHash(tournamentEngine.getTournament().tournamentRecord);
  const digest = trace?.digest();
  tracePlannerDecisions();
  setSubscriptions({ subscriptions: {} });
  return {
    seed,
    field,
    size,
    retained,
    audit,
    pipeline: getOutcomePipeline(),
    samples,
    traversalMs,
    index: plannerIndexCounts(),
    finalHash,
    digest,
  };
}

function capturePairedTrace() {
  const plans: string[] = [];
  const notices: string[] = [];
  const digest = createHash('sha256');
  tracePlannerDecisions(plans);
  setSubscriptions({
    subscriptions: Object.fromEntries(
      TOPICS.map((topic) => [topic, (payload: unknown) => notices.push(canonicalHash({ topic, payload }))]),
    ),
  });
  return {
    step(returned: unknown) {
      digest.update(
        canonicalHash({ returned, plans, notices, state: tournamentEngine.getTournament().tournamentRecord }),
      );
      plans.length = notices.length = 0;
    },
    digest: () => digest.digest('hex'),
  };
}

it.skipIf(!process.env.PLANNER_PAIRED_OUTPUT)(
  'counterbalances two planner arms on completed scoring sessions',
  () => {
    const output = process.env.PLANNER_PAIRED_OUTPUT!;
    const smoke = !!process.env.PLANNER_PAIRED_SMOKE;
    const cells: [Field, number][] = smoke
      ? [
          [SINGLES, 4],
          [TEAM, 4],
        ]
      : [
          [SINGLES, 128],
          [TEAM, 16],
          [SINGLES, 256],
          [TEAM, 32],
        ];
    writeFileSync(output, '');
    try {
      for (const [cell, [field, size]] of cells.entries()) {
        for (let i = 0; i < (smoke ? 1 : 12); i++) {
          const seed = 1041 + i;
          setClock('2026-10-25T00:00:00Z');
          setRandomSource(seed);
          const created = mocksEngine.generateTournamentRecord({
            drawProfiles: [
              {
                drawId,
                drawSize: size,
                eventType: field,
                ...(field === TEAM ? { tieFormat: resolveTieFormat(COLLEGE_DEFAULT) } : {}),
              },
            ],
            nonRandom: seed,
            setState: true,
          });
          expect(created.drawIds).toEqual([drawId]);
          if (field === TEAM)
            expect(
              tournamentEngine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success,
            ).toBe(true);
          const initial = structuredClone(tournamentEngine.getTournament().tournamentRecord);
          const arms = (cell + i) % 2 ? [true, false] : [false, true];
          for (const audit of i === 0 ? [true, false] : [false]) {
            const results = arms.map((retained) => pairedArm(initial, field, size, seed, retained, audit));
            expect(results[0].finalHash).toEqual(results[1].finalHash);
            expect(results[0].digest).toEqual(results[1].digest);
            expect(results[0].samples.map(({ action, kind }) => [action, kind])).toEqual(
              results[1].samples.map(({ action, kind }) => [action, kind]),
            );
            for (const row of results) appendFileSync(output, JSON.stringify(row) + '\n');
          }
        }
      }
    } finally {
      setRandomSource();
    }
  },
  7_200_000,
);
