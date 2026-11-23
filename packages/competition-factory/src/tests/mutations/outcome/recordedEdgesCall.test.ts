import {
  CARRIED,
  findTarget,
  MAIN,
  play,
  POLICY_OFF,
  R1,
  walkover,
  won,
} from '@Tests/testHarness/outcome/directionFixtures';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { storedGraph, storedRecord } from '@Tests/testHarness/outcome/objectGraph';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { hasStoredGoesTo } from '@Query/matchUps/addGoesTo';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import type { Scenario, Step } from '@Tests/testHarness/outcome/directionFixtures';
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import type { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP } from '@Constants/topicConstants';
import {
  COMPASS,
  CURTIS_CONSOLATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

// counts v1's matchUp writes on the stored record (`directionCounter.ts`: a write to a recorded call's copy is not one)
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { v1Writes } = await import('@Tests/testHarness/outcome/directionCounter');
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      v1Writes.count += 1;
      return actual.setMatchUpState(...args);
    },
  };
});

// CONTROL: with `refuse` set no recording is made, and the call's answer is the planners' abstention (`edges`);
// `ops` is the last recording made, `made` every one
const recorder = vi.hoisted(() => ({ refuse: false, ops: [] as { op: string }[], made: [] as { op: string }[][] }));
vi.mock('@Mutate/matchUps/outcome/plan/recordedCall', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/outcome/plan/recordedCall')>();
  const recordWholeCall: typeof actual.recordWholeCall = (args) => {
    const recorded = recorder.refuse ? undefined : actual.recordWholeCall(args);
    if (recorded) recorder.ops = recorded.ops;
    if (recorded) recorder.made.push(recorded.ops);
    return recorded;
  };
  return { ...actual, recordWholeCall };
});

/**
 * A CALL ON A DRAW STORED WITHOUT ITS EDGES IS RECORDED WHOLE (`edges`, `outcome/plan.ts` `RECORDED_WHOLE`).
 *
 * A draw assembled by hand may store no `winnerMatchUpId` / `loserMatchUpId`. v1 writes them onto every matchUp before
 * it decides anything (`ensureGoesTo`), with the finishing rounds and ranges `addGoesTo` adds, and a call that succeeds
 * announces the draw once for them (`announceGoesTo`: one `modifyDrawDefinition`, which stamps the draw and each of its
 * structures, and no `modifyMatchUp` for a matchUp whose only change is an edge). The planners abstained `edges` ahead
 * of everything else. Read off v1's whole write on a copy, the edges are part of what the copy's run changed: a
 * `replaceMatchUp` for each matchUp given an edge, which keeps its own `updatedAt` as v1 leaves it, and the draw notice
 * among the recorded notices.
 *
 * Each row is played with no recording first (CONTROL: `differential` counts the abstention, and under `v2` v1 writes
 * the stored record), then recorded: `differential` applies and compares the shadow, and under `v2` v1 is not asked to
 * write the stored record, which stores its edges and is left as v1 leaves it object for object (`storedGraph`), with
 * v1's notices and v1's result.
 */

afterEach(() => {
  recorder.refuse = false;
  recorder.ops = [];
  recorder.made = [];
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
});

type Row = Scenario & { setup?: Step[] };
const SE_16 = { drawType: SINGLE_ELIMINATION, drawSize: 16 };

const ROWS: [string, Row][] = [
  ['a result', { drawProfile: SE_16, steps: [{ target: R1(1), outcome: won(1) }] }],
  [
    'a result whose loser is directed',
    {
      drawProfile: { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16 },
      steps: [{ target: R1(1, 'Main'), outcome: won(2) }],
    },
  ],
  [
    'a result into a matchUp holding a winner',
    { drawProfile: SE_16, setup: [{ target: R1(1), outcome: won(1) }], steps: [{ target: R1(2), outcome: won(1) }] },
  ],
  [
    'a walkover that propagates',
    {
      drawProfile: { drawType: COMPASS, drawSize: 16 },
      steps: [{ target: R1(1, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'a default that propagates',
    {
      drawProfile: { drawType: CURTIS_CONSOLATION, drawSize: 16 },
      steps: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DEFAULTED, winningSide: 2 }, params: CARRIED }],
    },
  ],
  [
    'a retirement',
    {
      drawProfile: { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16 },
      steps: [{ target: R1(1, 'Main'), outcome: { ...won(1), matchUpStatus: RETIRED }, params: CARRIED }],
    },
  ],
  [
    'a double walkover, which places a BYE',
    {
      drawProfile: { drawType: COMPASS, drawSize: 16, participantsCount: 13 },
      steps: [{ target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'a double default, which produces an exit',
    {
      drawProfile: SE_16,
      policyDefinitions: POLICY_OFF,
      steps: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'a double walkover beside a result',
    {
      drawProfile: { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16 },
      setup: [{ target: R1(2, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'a result in a round robin with a playoff structure',
    {
      drawProfile: { drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 16 },
      steps: [{ target: { roundNumber: 1, nth: 0, structureName: 'Group 1' }, outcome: won(1) }],
    },
  ],
  [
    'a second-round result',
    {
      drawProfile: SE_16,
      setup: [
        { target: R1(1), outcome: won(1) },
        { target: R1(2), outcome: won(1) },
      ],
      steps: [{ target: MAIN(2, 1), outcome: won(2) }],
    },
  ],
];

const EDGES = ['winnerMatchUpId', 'loserMatchUpId'] as const;
const drawMatchUps = (record: Tournament) =>
  ((record.events?.[0].drawDefinitions?.[0] as DrawDefinition).structures ?? []).flatMap((structure) => [
    ...(structure.matchUps ?? []),
    ...(structure.structures ?? []).flatMap((group) => group.matchUps ?? []),
  ]);

/** the row's draw after its setup, as it is stored once its edges are deleted: how many matchUps held one */
function prepare({ drawProfile, setup = [], policyDefinitions }: Row) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-10-25T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ ...drawProfile, drawId: 'd' }],
    nonRandom: 1,
    setState: true,
  });
  if (policyDefinitions) tournamentEngine.attachPolicies({ policyDefinitions });
  for (const { target, outcome, params } of setup) {
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: structuredClone(outcome),
      matchUpId: findTarget(target),
      drawId: 'd',
      ...params,
    });
    expect(result.success, JSON.stringify(result)).toEqual(true);
  }
  const prepared: Tournament = structuredClone(tournamentEngine.getTournament().tournamentRecord);
  let edged = 0;
  for (const matchUp of drawMatchUps(prepared)) {
    if (EDGES.some((edge) => matchUp[edge])) edged += 1;
    for (const edge of EDGES) delete matchUp[edge];
  }
  return { prepared, edged };
}

const storesEdges = () =>
  hasStoredGoesTo({ drawDefinition: storedRecord().events?.[0].drawDefinitions?.[0] as DrawDefinition });
const tally = (key: string) => {
  const entry = getDifferentialTally()[key];
  return (entry?.compared ?? 0) + (entry?.deferred ?? 0);
};
const tallies = () => ({ abstained: tally('shadow:abstain:edges'), applied: tally('shadow:applied') });
const noticed = (notices: string[], topic: string) => notices.filter((notice) => notice.startsWith(`${topic} `));

describe('a call on a draw stored without its edges, which the planners abstain from, is recorded whole', () => {
  it.each(ROWS)('%s', (_label, row) => {
    const { prepared, edged } = prepare(row);
    // CONTROL: there were edges, and the prepared draw stores none
    expect(edged).toBeGreaterThan(0);
    const scenario: Scenario = { ...row, setup: [] };

    const v1 = play(OUTCOME_PIPELINE_V1, scenario, { prepared });
    const graph = storedGraph();
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toBeGreaterThan(0);
    // v1 stores the edges, and announces the draw for them
    expect(storesEdges()).toEqual(true);
    expect(noticed(v1.notices, MODIFY_DRAW_DEFINITION).length).toBeGreaterThan(0);
    // ...and no matchUp whose only change is an edge: fewer matchUps are announced than were given one
    expect(noticed(v1.notices, MODIFY_MATCHUP).length).toBeLessThan(edged);

    // CONTROL: the planners' own answer for the call
    const before = tallies();
    recorder.refuse = true;
    play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario, { prepared });
    expect(tallies()).toEqual({ abstained: before.abstained + 1, applied: before.applied });
    expect(play(OUTCOME_PIPELINE_V2, scenario, { prepared }).v1Writes).toBeGreaterThan(0);
    recorder.refuse = false;

    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario, { prepared });
    expect(tallies()).toEqual({ abstained: before.abstained + 1, applied: before.applied + 1 });
    expect(storedGraph()).toEqual(graph);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario, { prepared });
    expect(storedGraph()).toEqual(graph);
    expect(storesEdges()).toEqual(true);
    expect(v2.v1Writes).toEqual(0);
    for (const actual of [compared, v2]) {
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
    }
    // the recording is one op for each matchUp, structure or draw the run changed, and its notices: no more
    const matchUps = drawMatchUps(prepared).length;
    const replaced = recorder.ops.filter(({ op }) => op === 'replaceMatchUp').length;
    expect(replaced).toBeGreaterThanOrEqual(edged);
    expect(replaced).toBeLessThanOrEqual(matchUps);
    expect(recorder.ops.filter(({ op }) => op === 'announceRecorded')).toHaveLength(1);
  });
});

describe('a large draw stored without its edges', () => {
  it.each([64, 128])(
    'a first result in a draw of %s is one op a matchUp at most, and its edges are stored once',
    (drawSize) => {
      const row: Row = {
        drawProfile: { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize },
        steps: [
          { target: R1(1, 'Main'), outcome: won(1) },
          { target: R1(2, 'Main'), outcome: won(2) },
        ],
      };
      const { prepared, edged } = prepare(row);
      const v1 = play(OUTCOME_PIPELINE_V1, row, { prepared });
      const graph = storedGraph();
      recorder.made = [];
      const v2 = play(OUTCOME_PIPELINE_V2, row, { prepared });
      expect(storedGraph()).toEqual(graph);
      expect(v2.v1Writes).toEqual(0);
      expect(v2.results).toEqual(v1.results);
      expect(v2.record).toEqual(v1.record);
      expect(v2.notices).toEqual(v1.notices);
      const matchUps = drawMatchUps(prepared).length;
      const replaced = recorder.made.map((ops) => ops.filter(({ op }) => op === 'replaceMatchUp').length);
      // the first call's recording carries each matchUp given an edge, once, and little else
      expect(replaced[0]).toBeGreaterThanOrEqual(edged);
      expect(replaced[0]).toBeLessThanOrEqual(matchUps);
      expect(recorder.made[0].length).toBeLessThanOrEqual(matchUps + 8);
      // the second call finds the edges stored: a recording of it, if one is made, carries only what it wrote
      for (const later of replaced.slice(1)) expect(later).toBeLessThan(8);
      const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, row, { prepared });
      expect(storedGraph()).toEqual(graph);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
    },
  );
});
