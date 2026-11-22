import { compareHeldClaims } from '@Tests/testHarness/outcome/compareHeldClaims';
import { prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { replayStalls } from '@Tests/testHarness/exitPropagation/stallCount';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { afterEach, expect, it, vi } from 'vitest';
import engine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';
import { readFileSync } from 'node:fs';

// constants and types
import { BYE, COMPLETED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { Tournament } from '@Types/tournamentTypes';

afterEach(() => {
  vi.restoreAllMocks();
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline('v1');
  setClock();
});

function scoredRetirement(arm = 'off') {
  return prepareCall(() => {
    const file = new URL('../../fixtures/exitPropagation/stallScaleSchedules20261008b.jsonl', import.meta.url);
    const scenario = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .find((row) => row.seed === 20067292 && row.arm === arm);
    const step = 12;
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
    source: round('Main', 1, 2),
    winner: round('Main', 2, 1),
    bye: round('Backdraw', 1, 2),
    award: round('Backdraw', 2, 2),
    receiver: round('Backdraw', 3, 1),
  };
}

it.each(['off', 'policyoff'])('preserves both advances and the played walkover after a retirement (%s)', (arm) => {
  const call = scoredRetirement(arm);
  const before = seats(call.prepared);
  expect(before.bye).toMatchObject({ matchUpStatus: BYE, drawPositions: [6, 7] });
  expect(before.award).toMatchObject({ matchUpStatus: WALKOVER, winningSide: 1, drawPositions: [3, 7] });
  expect(before.receiver.drawPositions).toEqual([3]);
  const { source, ...claims } = seats(compareHeldClaims(call, true));
  expect(source).toMatchObject({ matchUpStatus: RETIRED, winningSide: 1, score: { scoreStringSide1: '6-3' } });
  expect(claims).toEqual({ winner: before.winner, bye: before.bye, award: before.award, receiver: before.receiver });
});

it('withdraws the source carry on the intervening BYE while the independent walkover survives', () => {
  const call = scoredRetirement();
  const { source, bye, award } = seats(call.prepared);
  bye.sideExitProvenance = {
    2: { sourceMatchUpId: source.matchUpId, previousMatchUpStatus: WALKOVER, matchUpStatus: WALKOVER },
  };
  const after = seats(compareHeldClaims(call, false));
  expect(after.bye.sideExitProvenance?.[2]).toBeUndefined();
  expect(after.award).toEqual(award);
  expect(after.receiver.drawPositions).toEqual([3]);
});

it('repairs the missing earned position on the compatibility route', () => {
  const call = scoredRetirement();
  const { receiver } = seats(call.prepared);
  receiver.drawPositions = [];
  const after = seats(compareHeldClaims(call, false));
  expect(after.award.winningSide).toBe(1);
  expect(after.receiver.drawPositions).toEqual([3]);
});

it('retracts the walkover and its advancement when the standing loss came from this source', () => {
  const call = scoredRetirement();
  const { source, award } = seats(call.prepared);
  award.sideExitProvenance = {
    2: { sourceMatchUpId: source.matchUpId, previousMatchUpStatus: WALKOVER, matchUpStatus: WALKOVER },
  };
  const after = seats(compareHeldClaims(call, false));
  expect(after.award.sideExitProvenance?.[2]).toBeUndefined();
  expect(after.award.winningSide).toBeUndefined();
  expect(after.receiver.drawPositions).toEqual([]);
});
