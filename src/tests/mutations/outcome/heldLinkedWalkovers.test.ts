import {
  expectPlayedParity,
  playCall,
  prepareCall,
  type RecordedCall,
} from '@Tests/testHarness/outcome/recordedCallHarness';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { replayStalls } from '@Tests/testHarness/exitPropagation/stallCount';
import * as stateWriter from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import * as recording from '@Mutate/matchUps/outcome/plan/recordedCall';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { afterEach, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import engine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';
import { readFileSync } from 'node:fs';

// constants and types
import { COMPLETED, DOUBLE_WALKOVER, RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import type { Tournament } from '@Types/tournamentTypes';

afterEach(() => {
  vi.restoreAllMocks();
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline('v1');
  setClock();
});

const schedules = {
  stall: 'stallScaleSchedules20261008b',
  refusal: 'censusF2RefusalSchedules20261011',
  feed: 'censusF1FeedSchedules20261011',
};
function matches(record: Tournament) {
  return record.events![0].drawDefinitions![0].structures!.flatMap((s) => matchUpsOf(s) ?? []);
}

function retirement(file: keyof typeof schedules, seed: number, arm: string, index: number) {
  return prepareCall(() => {
    const url = new URL(`../../fixtures/exitPropagation/${schedules[file]}.jsonl`, import.meta.url);
    const scenario = readFileSync(url, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .find((row) => row.seed === seed && row.arm === arm);
    const drawId = 'held';
    const { replay } = replayStalls({
      drawId,
      scenario: { ...scenario, steps: scenario.steps.slice(0, index) },
      allowChangePropagation: arm === 'on',
      policyDefinitions:
        arm === 'policyoff' ? { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } } : undefined,
    });
    expect(replay.counts.scheduleAttempted + replay.counts.skipped).toBe(index);
    const step = scenario.steps[index];
    const structures = engine.getTournament().tournamentRecord.events![0].drawDefinitions![0].structures!;
    const main = structures.find((structure) => structure.structureName === step.structureName);
    const source = matchUpsOf(main)?.find(
      (m) => m.roundNumber === step.roundNumber && m.roundPosition === step.roundPosition,
    );
    expect(source?.matchUpStatus).toBe(COMPLETED);
    return { drawId, matchUpId: source!.matchUpId, outcome: step.outcome, propagateExitStatus: true };
  });
}

function claims(call: RecordedCall) {
  const all = matches(call.prepared);
  const find = (id?: string) => all.find((match) => match.matchUpId === id)!;
  const source = find(call.params.matchUpId as string);
  const linked = find(source.loserMatchUpId);
  return { source, linked, next: find(linked.winnerMatchUpId), find };
}

function compare(call: RecordedCall, native?: boolean) {
  const reference = playCall('v1', call);
  const recorder = vi.spyOn(recording, 'recordWholeCall').mockReturnValue(undefined);
  const writer = vi.spyOn(stateWriter, 'setMatchUpState');
  for (const mode of ['v2', 'differential'] as const) {
    recorder.mockClear();
    writer.mockClear();
    const actual = playCall(mode, call);
    expectPlayedParity(actual, reference);
    expect(actual.arrayStack).toBe(reference.arrayStack);
    if (native !== undefined) expect(recorder.mock.calls.length === 0).toBe(native);
    if (native && mode === 'v2') expect(writer).not.toHaveBeenCalled();
  }
  return reference;
}

const cases = [
  ['stall', 20064548, 'off', 9],
  ['stall', 20064548, 'policyoff', 9],
  ['refusal', 20464093, 'off', 28],
  ['refusal', 20464093, 'policyoff', 28],
  ['refusal', 20464093, 'on', 28],
  ['feed', 20470000, 'on', 11],
  ['refusal', 20477784, 'policyoff', 13],
  ['refusal', 20493725, 'off', 8],
  ['refusal', 20493725, 'policyoff', 8],
  ['feed', 20483976, 'on', 27],
] as const;

it.each(cases)('%s %i %s step %i keeps every downstream match and provenance', (file, seed, arm, index) => {
  const call = retirement(file, seed, arm, index);
  const answer = compare(call, true);
  expect(answer.result.success).toBe(true);
  const others = (record: Tournament) => matches(record).filter((m) => m.matchUpId !== call.params.matchUpId);
  const after = JSON.parse(answer.record);
  expect(others(after)).toEqual(others(call.prepared));
  expect(matches(after).find((m) => m.matchUpId === call.params.matchUpId)).toMatchObject({
    matchUpStatus: RETIRED,
    winningSide: 1,
  });
});

it('withdraws a source-owned walkover and its mapped cross-structure winner', () => {
  const call = retirement('refusal', 20477784, 'policyoff', 13);
  const { source, linked, next } = claims(call);
  expect(next.drawPositions).toEqual([1, 6]);
  linked.sideExitProvenance = {
    1: { sourceMatchUpId: source.matchUpId, matchUpStatus: WALKOVER, previousMatchUpStatus: WALKOVER },
  };
  const answer = compare(call, false);
  expect(answer.result.success).toBe(true);
  const after = matches(JSON.parse(answer.record));
  expect(after.find((m) => m.matchUpId === next.matchUpId)?.drawPositions).toEqual([1]);
  expect(after.find((m) => m.matchUpId === linked.matchUpId)?.winningSide).toBeUndefined();
});

it('keeps a stale donor reference on compatibility', () => {
  const call = retirement('refusal', 20464093, 'off', 28);
  const { linked } = claims(call);
  linked.sideExitProvenance![2].sourceMatchUpId = 'missing-feeder';
  compare(call, false);
});

it('requires the earned position across the winner link', () => {
  const call = retirement('refusal', 20477784, 'policyoff', 13);
  claims(call).next.drawPositions = [1];
  compare(call, false);
});

it('honors an independent double walkover when the source now wants to carry a retirement', () => {
  const call = retirement('refusal', 20493725, 'off', 8);
  call.params.propagateRetirementAsExit = true;
  const answer = compare(call);
  expect(answer.result.error.code).toBe('ERR_UNCHANGED_CANNOT_CHANGE_OUTCOME');
  expect(answer.record).toBe(canonicalJson(call.prepared));
  expect(answer.notices).toEqual([]);
});

it('preserves the foreign donor when clearing its walkover is refused', () => {
  const call = retirement('refusal', 20464093, 'off', 28);
  const { linked } = claims(call);
  call.params.matchUpId = linked.sideExitProvenance![2].sourceMatchUpId;
  call.params.outcome = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };
  const answer = compare(call);
  expect(answer.result).toMatchObject({ error: { code: 'ERR_INCOMPATIBLE_MATCHUP_STATUS' }, activeDownstream: true });
  expect(answer.record).toBe(canonicalJson(call.prepared));
});

it('clearing the double walkover itself removes both linked-owner marks and releases the award', () => {
  const call = retirement('feed', 20483976, 'on', 27);
  const { linked, next, find } = claims(call);
  const relay = find(next.winnerMatchUpId);
  const final = find(relay.winnerMatchUpId);
  expect(linked.matchUpStatus).toBe(DOUBLE_WALKOVER);
  expect(next.sideExitProvenance?.[2].sourceMatchUpId).toBe(linked.matchUpId);
  expect(relay.sideExitProvenance?.[1].sourceMatchUpId).toBe(linked.matchUpId);
  call.params.matchUpId = linked.matchUpId;
  call.params.outcome = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };
  const answer = compare(call);
  expect(answer.result.success).toBe(true);
  const after = matches(JSON.parse(answer.record));
  for (const target of [next, relay])
    expect(after.find((m) => m.matchUpId === target.matchUpId)?.sideExitProvenance).toBeUndefined();
  expect(after.find((m) => m.matchUpId === final.matchUpId)?.drawPositions).toEqual([]);
});

it('refreshes a further arrival from the source and preserves the other feeder’s exit', () => {
  const call = retirement('refusal', 20464093, 'off', 28);
  const { source, linked, next } = claims(call);
  next.sideExitProvenance = {
    ...next.sideExitProvenance,
    2: { sourceMatchUpId: source.matchUpId, previousMatchUpStatus: COMPLETED },
  };
  const answer = compare(call, false);
  const after = matches(JSON.parse(answer.record));
  expect(after.find((m) => m.matchUpId === next.matchUpId)?.sideExitProvenance?.[2]?.previousMatchUpStatus).toBe(
    RETIRED,
  );
  expect(after.find((m) => m.matchUpId === linked.matchUpId)).toEqual(linked);
});

it('explicit retirement carry converges with the foreign exit', () => {
  const call = retirement('refusal', 20464093, 'off', 28);
  const { linked } = claims(call);
  call.params.propagateRetirementAsExit = true;
  const answer = compare(call);
  expect(answer.result.success).toBe(true);
  expect(matches(JSON.parse(answer.record)).find((m) => m.matchUpId === linked.matchUpId)?.matchUpStatus).toBe(
    DOUBLE_WALKOVER,
  );
});

it('requires the relayed double-walkover mark to belong to the linked match', () => {
  const call = retirement('feed', 20483976, 'on', 27);
  const { next, find } = claims(call);
  find(next.winnerMatchUpId).sideExitProvenance![1].sourceMatchUpId = 'other-feeder';
  compare(call, false);
});

it('requires an independent feeder that still owes the marked BYE', () => {
  const call = retirement('stall', 20064548, 'off', 9);
  const { source, find } = claims(call);
  const feeder = find(source.winnerMatchUpId);
  feeder.matchUpStatus = TO_BE_PLAYED;
  compare(call, false);
});

it('preserves compatibility for an additional linked-owner mark outside the double-exit path', () => {
  const call = retirement('refusal', 20493725, 'off', 8);
  const { linked, source, find } = claims(call);
  find(source.winnerMatchUpId).sideExitProvenance = {
    1: { sourceMatchUpId: linked.matchUpId, previousMatchUpStatus: DOUBLE_WALKOVER, matchUpStatus: WALKOVER },
  };
  compare(call, false);
});
