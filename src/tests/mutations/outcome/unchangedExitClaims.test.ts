import { playCall, prepareCall, type RecordedCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { expectReturnParity } from '@Tests/testHarness/outcome/returnParity';
import { replayStalls } from '@Tests/testHarness/exitPropagation/stallCount';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import * as stateWriter from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import * as recording from '@Mutate/matchUps/outcome/plan/recordedCall';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { afterEach, expect, it, vi } from 'vitest';
import engine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';
import { readFileSync } from 'node:fs';

// constants and types
import { COMPLETED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { Tournament } from '@Types/tournamentTypes';

afterEach(() => {
  vi.restoreAllMocks();
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline('v1');
  setClock();
});

function scoredRetirement() {
  return prepareCall(() => {
    const file = new URL('../../fixtures/exitPropagation/stallScaleSchedules.jsonl', import.meta.url);
    const scenario = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .find((row) => row.seed === 20005821 && row.arm === 'off');
    const step = 11;
    const drawId = 'held';
    const { replay } = replayStalls({ drawId, scenario: { ...scenario, steps: scenario.steps.slice(0, step) } });
    expect(replay.counts.scheduleAttempted).toBe(step);
    const { source } = seats(engine.getTournament().tournamentRecord);
    expect(source.matchUpStatus).toBe(COMPLETED);
    return { drawId, matchUpId: source.matchUpId, outcome: scenario.steps[step].outcome, propagateExitStatus: true };
  });
}

function seats(record: Tournament) {
  const structures = record.events![0].drawDefinitions![0].structures!;
  const round = (name: string, number: number, position: number) =>
    matchUpsOf(structures.find((s) => s.structureName === name)!)!.find(
      (m) => m.roundNumber === number && m.roundPosition === position,
    )!;
  return {
    source: round('Main', 2, 2),
    winner: round('Main', 3, 1),
    loser: round('Consolation', 2, 1),
    onward: round('Consolation', 3, 1),
  };
}

function compare(call: RecordedCall, native: boolean) {
  const reference = playCall('v1', call);
  expect(reference.result.success).toBe(true);
  const recorder = vi.spyOn(recording, 'recordWholeCall');
  if (native) recorder.mockReturnValue(undefined);
  const writer = vi.spyOn(stateWriter, 'setMatchUpState');
  for (const mode of ['v2', 'differential'] as const) {
    recorder.mockClear();
    const actual = playCall(mode, call);
    expect(recorder.mock.calls.length === 0).toBe(native);
    if (native && mode === 'v2') expect(writer).not.toHaveBeenCalled();
    expectReturnParity(actual, reference);
    expect(actual.arrayStack).toBe(reference.arrayStack);
    expect(actual.graph).toStrictEqual(reference.graph);
    expect(actual.record).toBe(reference.record);
    expect(actual.notices).toStrictEqual(reference.notices);
  }
  return seats(JSON.parse(reference.record));
}

it('retires the source while its winner and independently played loser keep their seats', () => {
  const call = scoredRetirement();
  const before = seats(call.prepared);
  expect(before.winner.drawPositions).toEqual([6]);
  expect(before.loser).toMatchObject({ matchUpStatus: COMPLETED, drawPositions: [1, 4] });
  const after = compare(call, true);
  expect(after.source).toMatchObject({ matchUpStatus: RETIRED, winningSide: 1, score: { scoreStringSide1: '6-3' } });
  expect(after.winner).toEqual(before.winner);
  expect(after.loser).toEqual(before.loser);
});

it('withdraws a source-owned carry from the linked loser seat on the compatibility route', () => {
  const call = scoredRetirement();
  const { source, loser } = seats(call.prepared);
  loser.matchUpStatus = WALKOVER;
  loser.sideExitProvenance = {
    1: { sourceMatchUpId: source.matchUpId, matchUpStatus: WALKOVER, previousMatchUpStatus: WALKOVER },
  };
  const after = compare(call, false);
  expect(after.loser.sideExitProvenance?.[1]).toBeUndefined();
  expect(after.loser.winningSide).toBeUndefined();
});

it('refreshes a further arrival from the source while the two immediate seats still stand', () => {
  const call = scoredRetirement();
  const { source, onward } = seats(call.prepared);
  onward.sideExitProvenance = { 1: { sourceMatchUpId: source.matchUpId, previousMatchUpStatus: COMPLETED } };
  const after = compare(call, false);
  expect(after.loser.matchUpStatus).toBe(COMPLETED);
  expect(after.onward.sideExitProvenance?.[1]).toEqual({
    sourceMatchUpId: source.matchUpId,
    previousMatchUpStatus: RETIRED,
  });
});
