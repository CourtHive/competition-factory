import { replayStalls } from '@Tests/testHarness/exitPropagation/stallCount';
import { readFileSync } from 'node:fs';
import { playCall, prepareCall, type RecordedCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import * as stateWriter from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { expectReturnParity } from '@Tests/testHarness/outcome/returnParity';
import * as recording from '@Mutate/matchUps/outcome/plan/recordedCall';
import * as direction from '@Mutate/matchUps/outcome/direction';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';

// constants and types
import { BYE, DEFAULTED, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

afterEach(() => {
  vi.restoreAllMocks();
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

function repeat(status: typeof WALKOVER | typeof DEFAULTED | typeof RETIRED) {
  return prepareCall(() => {
    const drawId = 'd';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, drawId }],
      setState: true,
      nonRandom: 1,
    });
    const matches = (): HydratedMatchUp[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
    const first = matches().filter((m) => m.structureName === 'Main' && m.roundNumber === 1);
    const source = first.find((m) => m.roundPosition === 1)!;
    const paired = first.find((m) => m.matchUpId !== source.matchUpId && m.winnerMatchUpId === source.winnerMatchUpId)!;
    const retired = status === RETIRED;
    const score = { scoreStringSide1: '6-3', scoreStringSide2: '3-6', sets: [{ side1Score: 6, side2Score: 3 }] };
    const params = {
      drawId,
      matchUpId: source.matchUpId,
      propagateExitStatus: true,
      outcome: { matchUpStatus: status, winningSide: 1, ...(retired ? { score } : {}) },
    };
    expect(tournamentEngine.setMatchUpStatus(params).success).toBe(true);
    const play = (matchUpId: string, outcome = { winningSide: 1 }) =>
      expect(tournamentEngine.setMatchUpStatus({ ...params, matchUpId, outcome }).success).toBe(true);
    if (retired) play(paired.matchUpId);
    else expect(tournamentEngine.setMatchUpStatus({ ...params, matchUpId: paired.matchUpId }).success).toBe(true);
    play(source.winnerMatchUpId!);
    if (retired) play(source.loserMatchUpId!);
    return params;
  });
}

function compare(call: RecordedCall, native: boolean) {
  const recorder = vi.spyOn(recording, 'recordWholeCall');
  if (native) recorder.mockReturnValue(undefined);
  const writer = vi.spyOn(stateWriter, 'setMatchUpState');
  const route = vi.spyOn(direction, 'planDirection');
  const reference = playCall(OUTCOME_PIPELINE_V1, call);
  expect(reference.result.success).toBe(true);
  expect(writer).toHaveBeenCalled();
  for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
    writer.mockClear();
    const actual = playCall(mode, call);
    if (native && mode === OUTCOME_PIPELINE_V2) expect(writer).not.toHaveBeenCalled();
    expectReturnParity(actual, reference);
    expect(actual.arrayStack).toBe(reference.arrayStack);
    expect(actual.record).toBe(reference.record);
    expect(actual.graph).toStrictEqual(reference.graph);
    expect(actual.notices).toStrictEqual(reference.notices);
  }
  expect(
    route.mock.calls.some(
      ([request, , name]) => name === 'apply-values' && request.matchUpId === call.params.matchUpId,
    ),
  ).toBe(true);
  expect(recorder.mock.calls.length === 0).toBe(native);
  return reference;
}

it.each([WALKOVER, DEFAULTED, RETIRED] as const)('repeats %s under a played-on winner', (status) => {
  compare(repeat(status), true);
});

it('records a repeat when the loser carries a different label', () => {
  const call = repeat(WALKOVER);
  const matches = call.prepared.events![0].drawDefinitions![0].structures!.flatMap((s) => matchUpsOf(s) ?? []);
  const carry = matches
    .flatMap((m) => Object.values(m.sideExitProvenance ?? {}))
    .find((e) => e.sourceMatchUpId === call.params.matchUpId && e.matchUpStatus === WALKOVER);
  expect(carry).toBeDefined();
  carry!.matchUpStatus = DEFAULTED;
  compare(call, false);
});

it('records a scored retirement with a changed score under the played-on winner', () => {
  const call = repeat(RETIRED);
  call.params.outcome = {
    winningSide: 1,
    matchUpStatus: RETIRED,
    score: {
      scoreStringSide1: '6-2',
      scoreStringSide2: '2-6',
      sets: [{ side1Score: 6, side2Score: 2 }],
    },
  };
  compare(call, false);
});

// The walkover from Main 1|5 passes a BYE and stands in a later convergence (the published policy-off schedule).
function byeHeldRepeat() {
  return prepareCall(() => {
    const drawId = 'd';
    const fixture = new URL('../../fixtures/exitPropagation/stallScaleSchedules20261009cd.jsonl', import.meta.url);
    const scenario = readFileSync(fixture, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .find((s) => s.seed === 20117658);
    const { replay } = replayStalls({ drawId, scenario: { ...scenario, steps: scenario.steps.slice(0, 8) } });
    expect(replay.counts.scheduleAttempted).toBe(8);
    const matches: HydratedMatchUp[] = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
    const source = matches.find((m) => m.structureName === 'Main' && m.roundNumber === 1 && m.roundPosition === 5)!;
    const origins = matches.filter((m) =>
      Object.values(m.sideExitProvenance ?? {}).some((e) => e.sourceMatchUpId === source.matchUpId),
    );
    expect(origins.map((m) => m.matchUpStatus).sort()).toEqual([BYE, DOUBLE_WALKOVER]);
    return {
      drawId,
      matchUpId: source.matchUpId,
      outcome: { winningSide: 1, matchUpStatus: WALKOVER },
      propagateExitStatus: true,
    };
  });
}

it('repeats the carry through a BYE into the later convergence', () => {
  compare(byeHeldRepeat(), true);
});

it('records a stale carry on the intervening BYE even when the standing label matches', () => {
  const call = byeHeldRepeat();
  const matches = call.prepared.events![0].drawDefinitions![0].structures!.flatMap((s) => matchUpsOf(s) ?? []);
  const held = matches
    .filter((m) => m.matchUpStatus === BYE)
    .flatMap((m) => Object.values(m.sideExitProvenance ?? {}))
    .find((e) => e.sourceMatchUpId === call.params.matchUpId)!;
  expect(held.matchUpStatus).toBe(WALKOVER);
  held.matchUpStatus = DEFAULTED;
  held.previousMatchUpStatus = DEFAULTED;
  const reference = compare(call, false);
  const after = JSON.parse(reference.record) as typeof call.prepared;
  const repaired = after
    .events![0].drawDefinitions![0].structures!.flatMap((s) => matchUpsOf(s) ?? [])
    .filter((m) => m.matchUpStatus === BYE)
    .flatMap((m) => Object.values(m.sideExitProvenance ?? {}))
    .find((e) => e.sourceMatchUpId === call.params.matchUpId);
  expect(repaired).toMatchObject({ matchUpStatus: WALKOVER, previousMatchUpStatus: WALKOVER });
});
