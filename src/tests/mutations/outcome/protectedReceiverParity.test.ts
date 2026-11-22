import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { captureReturn, expectReturnParity } from '@Tests/testHarness/outcome/returnParity';
import { objectGraph, storedGraph, storedRecord } from '@Tests/testHarness/outcome/objectGraph';
import * as stateWriter from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import * as recording from '@Mutate/matchUps/outcome/plan/recordedCall';
import * as cascade from '@Mutate/matchUps/outcome/plan/recordedCascade';
import {
  backdrawWinner,
  compassArrival,
  curtisAward,
  incomingCarry,
  oneReceiver,
  scoredArrival,
  terminalWithoutLanding,
  twoReceivers,
} from './protectedReceiverFixtures';
import { observeClockReads, setClock } from '@Tools/clock';
import { MODIFY_MATCHUP, topicConstants } from '@Constants/topicConstants';
import engine from '@Engines/syncEngine';
import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

import { COMPLETED, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { TIEBREAK_POINTS_NOT_RECORDED } from '@Constants/scoreWarningConstants';
import type { Tournament } from '@Types/tournamentTypes';
import type { RecordedCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';

afterEach(() => {
  vi.restoreAllMocks();
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  setClock();
});

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function play(mode: OutcomePipelineMode, call: RecordedCall) {
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  setClock('2026-11-22T00:00:00Z');
  expect(engine.setState(structuredClone(call.prepared), false).success).toBe(true);
  const before = digest(storedGraph());
  deleteNotices();
  const notices: { topic: string; count: number; batchDigest: string }[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      Object.values(topicConstants).map((topic) => [
        topic,
        (batch: unknown[]) => {
          notices.push({ topic, count: batch.length, batchDigest: digest(objectGraph(batch)) });
        },
      ]),
    ),
  });
  const sourceReads: number[] = [];
  setClock(() => {
    const ms = Date.UTC(2026, 10, 22, 1) + 100 * sourceReads.length;
    sourceReads.push(ms);
    return ms;
  });
  const observed: unknown[] = [],
    errors: unknown[] = [];
  setOutcomePipeline(mode);
  const answer = observeClockReads(
    (effect) => (reading) => observed.push([effect?.kind, reading]),
    () => engine.setMatchUpStatus(structuredClone(call.params)),
    errors,
  );
  expect(errors).toEqual([]);
  const returned = captureReturn(answer);
  return {
    ...returned,
    pristine: before === digest(storedGraph()),
    notices,
    sourceReads,
    observed,
    bytes: digest(storedRecord()),
    graph: digest(storedGraph(returned.result)),
    record: storedRecord(),
  };
}

function compare(call: RecordedCall, native: boolean | 'refused') {
  const reference = play('v1', call);
  if (native === 'refused') {
    expect(reference.result.error?.code).toBe('ERR_OCCUPIED_DRAW_POSITION');
    expect(reference.pristine).toBe(true);
  } else expect(reference.result.success).toBe(true);
  expect(reference.sourceReads).toHaveLength(1);
  expect(reference.observed).toHaveLength(1);
  if (native !== 'refused') expect(reference.notices.length).toBeGreaterThan(0);
  const recorder = vi.spyOn(recording, 'recordWholeCall').mockReturnValue(undefined);
  const nested = vi.spyOn(cascade, 'recordDoubleExitCascade').mockReturnValue(undefined);
  const writer = vi.spyOn(stateWriter, 'setMatchUpState');
  try {
    for (const mode of ['v2', 'differential'] as const) {
      recorder.mockClear();
      writer.mockClear();
      nested.mockClear();
      const actual = play(mode, call);
      expectReturnParity(actual, reference);
      for (const field of ['bytes', 'graph', 'notices', 'sourceReads', 'observed'] as const)
        expect(actual[field], mode + ' ' + field).toStrictEqual(reference[field]);
      expect(nested).not.toHaveBeenCalled();
      if (native === 'refused') {
        expect(actual.pristine).toBe(true);
        continue;
      }
      expect(recorder.mock.calls.length === 0, mode + ' native').toBe(native);
      if (mode === 'v2') expect(writer.mock.calls.length === 0, 'v2 native writer').toBe(native);
    }
  } finally {
    writer.mockRestore();
    nested.mockRestore();
    recorder.mockRestore();
  }
  return reference;
}

function at(record: Tournament, name: string, round: number, position: number) {
  return record
    .events![0].drawDefinitions![0].structures!.find((s) => s.structureName === name)!
    .matchUps!.find((match) => match.roundNumber === round && match.roundPosition === position)!;
}

it('delivers the linked loser past a structural BYE to a standing foreign default', () => {
  const call = oneReceiver();
  const before = at(call.prepared, 'Consolation', 2, 2);
  expect(before.sideExitProvenance?.[1]?.matchUpStatus).toBe(DEFAULTED);
  const { record } = compare(call, true);
  expect(at(record, 'Consolation', 2, 2)).toMatchObject({
    winningSide: 2,
    sideExitProvenance: before.sideExitProvenance,
  });
  expect(at(record, 'Consolation', 3, 1).drawPositions).toEqual([6]);
});
it('delivers the winner through two independently produced walkovers', () => {
  const call = twoReceivers();
  const { record } = compare(call, true);
  for (const [round, position] of [
    [2, 2],
    [3, 1],
  ]) {
    const before = at(call.prepared, 'Main', round, position);
    expect(before.sideExitProvenance?.[1]?.previousMatchUpStatus).toBe(DOUBLE_WALKOVER);
    expect(at(record, 'Main', round, position)).toMatchObject({
      winningSide: 2,
      drawPositions: [7],
      sideExitProvenance: before.sideExitProvenance,
    });
  }
  expect(at(record, 'Main', 4, 1).drawPositions).toEqual([7]);
});
it('distinguishes two occurrences of the same COMPASS call by the reservation on its footprint', () => {
  compare(compassArrival(true), false);
  compare(compassArrival(false), true);
});

it.each([DOUBLE_DEFAULT, DOUBLE_WALKOVER] as const)(
  'delivers the scored arrival through two %s results with live subscribers',
  (exit) => {
    const { notices } = compare(scoredArrival(exit), true);
    expect(notices.filter(({ topic }) => topic === MODIFY_MATCHUP).map(({ count }) => count)).toEqual([4]);
  },
);

it('retains recording for a matrix arrival which itself sends a carry', () => {
  compare(incomingCarry(), false);
});

it('keeps the tiebreak warning material and recovers admission when the ordinary result is restored', () => {
  const original = oneReceiver();
  const withWarning = structuredClone(original);
  withWarning.params.outcome = {
    winningSide: 2,
    score: { sets: [1, 2].map((setNumber) => ({ setNumber, side1Score: 6, side2Score: 7, winningSide: 2 })) },
  };
  const answer = compare(withWarning, false);
  expect(answer.result.warnings).toEqual([{ code: TIEBREAK_POINTS_NOT_RECORDED, setNumbers: [1, 2] }]);
  const recovered = structuredClone(withWarning);
  recovered.params.outcome = {
    winningSide: 2,
    score: {
      sets: [1, 2].map((setNumber) => ({
        setNumber,
        side1Score: 6,
        side2Score: 7,
        side1TiebreakScore: 5,
        side2TiebreakScore: 7,
        winningSide: 2,
      })),
    },
  };
  expect(compare(recovered, true).result.warnings).toBeUndefined();
});

it('records the call with attached scheduling work and recovers the ordinary arrival', () => {
  const original = oneReceiver();
  const scheduled = structuredClone(original);
  scheduled.params.schedule = { scheduledTime: '16:00' };
  compare(scheduled, false);
  compare(original, true);
});

it.each(['retagged origin', 'wrong feeder outcome', 'occupied loser assignment'] as const)(
  'retains compatibility for a %s and recovers when its single changed condition is restored',
  (condition) => {
    const original = oneReceiver();
    const changed = structuredClone(original);
    const structures = changed.prepared.events![0].drawDefinitions![0].structures!;
    const consolation = structures.find((s) => s.structureName === 'Consolation')!;
    const origin = consolation.matchUps!.find((m) => m.roundNumber === 2 && m.roundPosition === 2)!
      .sideExitProvenance![1];
    const feeder = structures.flatMap((s) => s.matchUps ?? []).find((m) => m.matchUpId === origin.sourceMatchUpId)!;
    if (condition === 'retagged origin') origin.sourceMatchUpId = 'unrelated-feeder';
    if (condition === 'wrong feeder outcome') feeder.matchUpStatus = COMPLETED;
    if (condition === 'occupied loser assignment') {
      const assignment = consolation.positionAssignments!.find((a) => a.drawPosition === 6)!;
      expect(assignment.participantId).toBeUndefined();
      assignment.participantId = structures
        .find((s) => s.structureName === 'Main')!
        .positionAssignments!.find((a) => a.drawPosition === 8)!.participantId;
    }
    compare(changed, condition === 'occupied loser assignment' ? 'refused' : false);
    compare(original, true);
  },
);

it('keeps a terminal awarded exit recorded when neither stored sides nor an onward placement witnesses its winner', () => {
  const call = terminalWithoutLanding();
  const terminal = at(call.prepared, 'Consolation', 3, 1);
  expect(terminal).toMatchObject({ matchUpStatus: DEFAULTED, drawPositions: [2] });
  expect(terminal.sides).toBeUndefined();
  expect(terminal.winnerMatchUpId).toBeUndefined();
  const { record } = compare(call, false);
  expect(at(record, 'Consolation', 3, 1)).toMatchObject({ winningSide: 2, drawPositions: terminal.drawPositions });
});

it('records a CURTIS arrival that creates the codes key on its protected receiver', () => {
  const call = curtisAward();
  const source = at(call.prepared, 'Main', 2, 1);
  const receiver = at(call.prepared, 'Consolation 1', 2, 4);
  expect(source.matchUpId).toBe(call.params.matchUpId);
  expect(source.loserMatchUpId).toBe(receiver.matchUpId);
  expect(source.matchUpStatusCodes).toStrictEqual([]);
  expect(receiver).toMatchObject({ matchUpStatus: WALKOVER, winningSide: 1, drawPositions: [4, 11] });
  expect(Object.hasOwn(receiver, 'matchUpStatusCodes')).toBe(false);
  const { record } = compare(call, false);
  const after = at(record, 'Consolation 1', 2, 4);
  expect(Object.hasOwn(after, 'matchUpStatusCodes')).toBe(true);
  expect(after.matchUpStatusCodes).toStrictEqual([]);
  expect(after.sideExitProvenance).toStrictEqual(receiver.sideExitProvenance);

  const recovered = structuredClone(call);
  at(recovered.prepared, 'Consolation 1', 2, 4).matchUpStatusCodes = [];
  compare(recovered, true);
});

it('stamps the Main structure when a Backdraw winner reaches the linked decider', () => {
  const call = backdrawWinner();
  const decider = at(call.prepared, 'Main', 4, 1);
  expect(at(call.prepared, 'Backdraw', 4, 1).winnerMatchUpId).toBe(decider.matchUpId);
  expect(decider.drawPositions).toEqual([8]);
  const { record, sourceReads } = compare(call, true);
  expect(at(record, 'Main', 4, 1).drawPositions).toEqual([5, 8]);
  const stampedAt = new Date(sourceReads[0]).toISOString();
  for (const name of ['Backdraw', 'Main']) {
    const before = call.prepared.events![0].drawDefinitions![0].structures!.find((s) => s.structureName === name)!;
    const after = record.events![0].drawDefinitions![0].structures!.find((s) => s.structureId === before.structureId)!;
    expect(before.updatedAt).not.toBe(stampedAt);
    expect(after.updatedAt).toBe(stampedAt);
  }
});
