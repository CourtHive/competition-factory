import { heldClaimInput } from '@Tests/testHarness/outcome/heldByeClaimControls';
import * as claims from '@Mutate/matchUps/outcome/plan/standingReservation';
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
import type { Tournament } from '@Types/tournamentTypes';
import { COMPLETED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';

afterEach(() => {
  vi.restoreAllMocks();
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline('v1');
  setClock();
});

function correction(seed: number, step: number, allowChangePropagation: boolean, propagateExitStatus: boolean) {
  return prepareCall(() => {
    const name = allowChangePropagation ? 'censusF1FeedSchedules20261011' : 'stallScaleSchedules20261009cd';
    const file = new URL('../../fixtures/exitPropagation/' + name + '.jsonl', import.meta.url);
    const scenario = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .find((row) => row.seed === seed);
    const drawId = 'held-reservation';
    const { replay } = replayStalls({
      drawId,
      scenario: { ...scenario, steps: scenario.steps.slice(0, step) },
      allowChangePropagation,
    });
    expect(replay.counts.scheduleAttempted).toBe(step);
    const request = scenario.steps[step];
    const structures = engine.getTournament().tournamentRecord.events![0].drawDefinitions![0].structures!;
    const source = matchUpsOf(structures.find((s) => s.structureName === request.structureName)!)!.find(
      (m) => m.roundNumber === request.roundNumber && m.roundPosition === request.roundPosition,
    )!;
    expect(source).toMatchObject({ matchUpStatus: COMPLETED, winningSide: request.outcome.winningSide });
    return {
      drawId,
      matchUpId: source.matchUpId,
      outcome: request.outcome,
      allowChangePropagation,
      propagateExitStatus,
    };
  });
}

function consolationOf(record: Tournament) {
  return record.events![0].drawDefinitions![0].structures!.find((s) => s.structureName === 'Consolation')!;
}

it.each([
  [20460202, 25, true, true],
  [20486698, 26, true, false],
  [20117658, 13, false, true],
] as const)(
  'keeps the marked first-match reservation and the opposing seat for %i',
  (seed, step, allowChangePropagation, propagateExitStatus) => {
    const call = correction(seed, step, allowChangePropagation, propagateExitStatus);
    const after = compareHeldClaims(call, true);
    expect(consolationOf(after)).toEqual(consolationOf(call.prepared));
    const main = after.events![0].drawDefinitions![0].structures!.find((s) => s.structureName === 'Main')!;
    expect(matchUpsOf(main)!.find((m) => m.matchUpId === call.params.matchUpId)?.matchUpStatus).toBe(WALKOVER);
  },
);

it('refreshes a source-owned arrival beyond the marked reservation', () => {
  const call = correction(20460202, 25, true, true);
  const next = matchUpsOf(consolationOf(call.prepared))!.find((m) => m.roundNumber === 3)!;
  const sourceId = call.params.matchUpId as string;
  next.sideExitProvenance = { 1: { sourceMatchUpId: sourceId, previousMatchUpStatus: COMPLETED } };
  const after = compareHeldClaims(call, false);
  const receiver = matchUpsOf(consolationOf(after))!.find((m) => m.matchUpId === next.matchUpId)!;
  expect(receiver.sideExitProvenance?.[1]).toEqual({ sourceMatchUpId: sourceId, previousMatchUpStatus: WALKOVER });
});

it('leaves a pre-existing unmarked consolation BYE in its original form', () => {
  const call = correction(20486698, 26, true, false);
  const seat = consolationOf(call.prepared).positionAssignments!.find((a) => a.drawPosition === 1)!;
  expect(seat.byeFromPropagation).toBe(true);
  delete seat.byeFromPropagation;
  const after = compareHeldClaims(call, false);
  expect(consolationOf(after)).toEqual(consolationOf(call.prepared));
});

it('re-evaluates the feed when the losing participant occupies the reserved position', () => {
  const call = correction(20460202, 25, true, true);
  const structures = call.prepared.events![0].drawDefinitions![0].structures!;
  const main = structures.find((s) => s.structureName === 'Main')!;
  const consolation = consolationOf(call.prepared);
  const source = matchUpsOf(main)!.find((m) => m.matchUpId === call.params.matchUpId)!;
  const home = matchUpsOf(consolation)!.find((m) => m.roundNumber === 2 && m.roundPosition === 1)!;
  const loserPosition = source.drawPositions![source.winningSide === 1 ? 1 : 0];
  const loser = main.positionAssignments!.find((a) => a.drawPosition === loserPosition)!;
  const seat = consolation.positionAssignments!.find((a) => a.drawPosition === 1)!;
  expect(seat.byeFromPropagation).toBe(true);
  delete seat.bye;
  delete seat.byeFromPropagation;
  seat.participantId = loser.participantId;
  home.matchUpStatus = TO_BE_PLAYED;
  const after = consolationOf(compareHeldClaims(call, false));
  const linked = matchUpsOf(after)!.find((m) => m.matchUpId === home.matchUpId)!;
  expect(linked).toMatchObject({
    matchUpStatus: WALKOVER,
    winningSide: 2,
    sideExitProvenance: {
      1: { matchUpStatus: WALKOVER, previousMatchUpStatus: WALKOVER, sourceMatchUpId: source.matchUpId },
    },
  });
  expect(after.positionAssignments!.find((a) => a.drawPosition === 1)).toEqual(seat);
});

it.each(['main winner', 'opposing advance'] as const)('requires the %s at its claimed position', (gap) => {
  const call = correction(20460202, 25, true, true);
  const input = heldClaimInput(call);
  const { view } = input;
  expect(claims.relabelKeepsReservation(input)).toBe(true);
  const matches = view.inContextDrawMatchUps!;
  const home = matches.find((m) => m.matchUpId === view.targets.loserMatchUpId)!;
  const targetId = gap === 'main winner' ? view.targets.winnerMatchUpId : home.winnerMatchUpId;
  const target = matches.find((m) => m.matchUpId === targetId)!;
  const participantId =
    gap === 'main winner' ? view.targets.sideParticipantIds[2] : home.sides!.find((s) => !s.bye)!.participantId;
  const seat = target.sides!.find((s) => s.participantId === participantId)!;
  delete seat.participantId;
  expect(claims.relabelKeepsReservation(input)).toBe(false);
});
