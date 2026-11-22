import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { captureReturn, expectReturnParity } from '@Tests/testHarness/outcome/returnParity';
import { objectGraph, storedGraph, storedRecord } from '@Tests/testHarness/outcome/objectGraph';
import * as stateWriter from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import * as recording from '@Mutate/matchUps/outcome/plan/recordedCall';
import * as cascade from '@Mutate/matchUps/outcome/plan/recordedCascade';
import { compassArrival, oneReceiver, twoReceivers } from './protectedReceiverFixtures';
import { observeClockReads, setClock } from '@Tools/clock';
import { topicConstants } from '@Constants/topicConstants';
import engine from '@Engines/syncEngine';
import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

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
  deleteNotices();
  const notices: { topic: string; payload: string }[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      Object.values(topicConstants).map((topic) => [
        topic,
        (batch: unknown[]) => {
          for (const payload of batch) notices.push({ topic, payload: digest(objectGraph(payload)) });
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
    notices,
    sourceReads,
    observed,
    bytes: digest(storedRecord()),
    graph: digest(storedGraph(returned.result)),
  };
}

function compare(call: RecordedCall, native: boolean) {
  const reference = play('v1', call);
  expect(reference.result.success).toBe(true);
  expect(reference.sourceReads).toHaveLength(1);
  expect(reference.observed).toHaveLength(1);
  expect(reference.notices.length).toBeGreaterThan(0);
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
      expect(recorder.mock.calls.length === 0, mode + ' native').toBe(native);
      if (mode === 'v2') expect(writer.mock.calls.length === 0, 'v2 native writer').toBe(native);
    }
  } finally {
    writer.mockRestore();
    nested.mockRestore();
    recorder.mockRestore();
  }
}

it('delivers the linked loser past a structural BYE to a standing foreign default', () => compare(oneReceiver(), true));
it('delivers the winner through two independently produced walkovers', () => compare(twoReceivers(), true));
it('distinguishes two occurrences of the same COMPASS call by the reservation on its footprint', () => {
  compare(compassArrival(true), false);
  compare(compassArrival(false), true);
});
