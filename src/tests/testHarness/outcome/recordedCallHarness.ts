import { captureReturn, expectReturnParity } from './returnParity';
import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { storedGraph } from '@Tests/testHarness/outcome/objectGraph';
import { v1Writes } from '@Tests/testHarness/outcome/directionCounter';
import { TOPICS } from '@Tests/testHarness/outcome/directionFixtures';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';
import { expect } from 'vitest';

// constants and types
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import type { AbstainReason } from '@Mutate/matchUps/outcome/types';
import type { Tournament } from '@Types/tournamentTypes';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * ONE CALL, PLAYED IN EVERY MODE FROM ONE PREPARED RECORD (the `recorded…Call` tests whose record a `Scenario` cannot
 * build: a competition policy, a tie the format permits, a schedule). `build` makes the record through the engine,
 * under v1 and a fixed clock, and returns the call's parameters; each play then starts from a copy of that record.
 */
export type RecordedCall = { prepared: Tournament; params: Record<string, unknown> };

export function prepareCall(build: () => Record<string, unknown>): RecordedCall {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-10-25T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  const params = build();
  return { prepared: structuredClone(tournamentEngine.getTournament().tournamentRecord), params };
}

/** the call on a fresh copy of the prepared record, every topic subscribed and the clock fixed */
export function playCall(
  mode: OutcomePipelineMode,
  { prepared, params }: RecordedCall,
  /** hand the parameters over as they are: for those that cannot be copied (a function among them) */
  asGiven = false,
) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  expect(tournamentEngine.setState(structuredClone(prepared)).success).toEqual(true);
  deleteNotices();
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      TOPICS.map((topic) => [
        topic,
        (payloads: any[]) => payloads.forEach((payload) => notices.push(`${topic} ${canonicalJson(payload)}`)),
      ]),
    ),
  });
  setClock('2026-10-25T00:01:00.000Z');
  setOutcomePipeline(mode);
  v1Writes.count = 0;
  const { result, arrayStack } = captureReturn(
    tournamentEngine.setMatchUpStatus(asGiven ? params : structuredClone(params)),
  );
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  return {
    result,
    arrayStack,
    notices,
    v1Writes: v1Writes.count,
    record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    // the stored record object for object, the call's result among it (it can hold objects of the record)
    graph: storedGraph(result),
  };
}

const playAsGivenOrCopied = playCall;

const tally = (key: string) => {
  const entry = getDifferentialTally()[key];
  return (entry?.compared ?? 0) + (entry?.deferred ?? 0);
};

/**
 * A CALL THE PLANNERS ABSTAIN FROM FOR `reason` IS RECORDED WHOLE. First with no recording (CONTROL, `refuse`): the
 * abstention is `reason`'s, and under `v2` v1 writes the stored record. Then recorded: `differential` applies and
 * compares the shadow, and under `v2` v1 is not asked to write the stored record, which is left as v1 leaves it object
 * for object, with v1's notices and v1's result.
 */
export function expectRecordedWhole(
  call: RecordedCall,
  reason: AbstainReason,
  recorder: { refuse: boolean },
  /** hand the parameters over as they are, in every play (`playCall`) */
  asGiven = false,
) {
  const playCall = (mode: OutcomePipelineMode, played: RecordedCall) => playAsGivenOrCopied(mode, played, asGiven);
  const v1 = playCall(OUTCOME_PIPELINE_V1, call);
  expect(v1.result.success, JSON.stringify(v1.result)).toEqual(true);
  expect(v1.v1Writes).toBeGreaterThan(0);

  const read = () => ({ abstained: tally(`shadow:abstain:${reason}`), applied: tally('shadow:applied') });
  const before = read();
  recorder.refuse = true;
  playCall(OUTCOME_PIPELINE_DIFFERENTIAL, call);
  expect(read()).toEqual({ abstained: before.abstained + 1, applied: before.applied });
  expect(playCall(OUTCOME_PIPELINE_V2, call).v1Writes).toBeGreaterThan(0);
  recorder.refuse = false;

  const compared = playCall(OUTCOME_PIPELINE_DIFFERENTIAL, call);
  expect(read()).toEqual({ abstained: before.abstained + 1, applied: before.applied + 1 });
  const v2 = playCall(OUTCOME_PIPELINE_V2, call);
  expect(v2.v1Writes).toEqual(0);
  for (const actual of [compared, v2]) expectPlayedParity(actual, v1);
  return v1;
}

export function expectPlayedParity(actual: ReturnType<typeof playCall>, v1: ReturnType<typeof playCall>) {
  expectReturnParity(actual, v1);
  expect(actual.record).toEqual(v1.record);
  expect(actual.notices).toStrictEqual(v1.notices);
  expect(actual.graph).toStrictEqual(v1.graph);
}
