import * as claims from '@Mutate/matchUps/outcome/plan/unchangedExitClaims';
import { compareHeldClaims } from '@Tests/testHarness/outcome/compareHeldClaims';
import { prepareCall, playCall } from '@Tests/testHarness/outcome/recordedCallHarness';
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

it.each([
  'missing feeder round',
  'unresolved winner edge',
  'missing BYE position',
  'propagated BYE',
  'different earned winner',
  'missing main winner',
] as const)('requires independent support for the structural BYE path (%s)', (gap) => {
  const call = scoredRetirement();
  const check = claims.retirementClaimsStand;
  const inspected = vi.spyOn(claims, 'retirementClaimsStand').mockImplementationOnce((args) => {
    expect(check(args)).toBe(true);
    const view = structuredClone(args.view);
    const drawDefinition = structuredClone(args.drawDefinition!);
    const matches = view.inContextDrawMatchUps!;
    const linked = matches.find((m) => m.matchUpId === view.targets.loserMatchUpId)!;
    const award = matches.find((m) => m.matchUpId === linked.winnerMatchUpId)!;
    const bye = linked.sides!.find((s) => s.bye)!;
    const loser = linked.sides!.find((s) => s.participantId)!;
    const backdraw = drawDefinition.structures!.find((s) => s.structureId === linked.structureId)!;
    switch (gap) {
      case 'missing feeder round':
        delete linked.roundNumber;
        break;
      case 'unresolved winner edge':
        view.inContextDrawMatchUps = matches.filter((m) => m.matchUpId !== award.matchUpId);
        break;
      case 'missing BYE position':
        delete bye.drawPosition;
        break;
      case 'propagated BYE':
        backdraw.positionAssignments!.find((a) => a.drawPosition === bye.drawPosition)!.byeFromPropagation = true;
        break;
      case 'different earned winner':
        award.winningSide = award.sides!.find((s) => s.participantId === loser.participantId)!.sideNumber;
        break;
      case 'missing main winner':
        view.inContextDrawMatchUps = matches.filter((m) => m.matchUpId !== view.targets.winnerMatchUpId);
        break;
    }
    expect(check({ ...args, view, drawDefinition })).toBe(false);
    return true;
  });
  expect(playCall('v2', call).result.success).toBe(true);
  expect(inspected).toHaveBeenCalled();
});
