import { planLinkedRepairs, planReturningCarries } from '@Mutate/matchUps/outcome/settlement/linkedRepairs';
import { reconcileMissedLinkAdvancements } from '@Mutate/matchUps/matchUpStatus/reconcileMissedLinkAdvancements';
import { reconcileLinkAdvancements } from '@Mutate/matchUps/matchUpStatus/reconcileLinkAdvancements';
import { getUnearnedLinkAdvancements } from '@Query/drawDefinition/getUnearnedLinkAdvancements';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { createWorkingView } from '@Mutate/matchUps/outcome/overlay';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED, DOUBLE_DEFAULT, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { setOutcomePipeline } from '@Global/state/globalState';
import type { DrawDefinition } from '@Types/tournamentTypes';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

const drawId = 'links-for-settlement';
function read(drawDefinition: DrawDefinition) {
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const inContextDrawMatchUps = getAllDrawMatchUps({ drawDefinition, matchUpsMap, inContext: true }).matchUps ?? [];
  return createWorkingView({ drawDefinition, inContextDrawMatchUps, matchUpsMap, clockFree: true });
}
function finalReady() {
  setOutcomePipeline('v1');
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: DOUBLE_ELIMINATION, drawSize: 8 }],
    nonRandom: 5245,
    setState: true,
  });
  const all = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  for (let step = 0; step < 30; step++) {
    const next = all().find(
      (m) =>
        m.structureName !== 'Decider' &&
        !(m.structureName === 'Main' && m.roundNumber === 4) &&
        m.matchUpStatus === TO_BE_PLAYED &&
        m.sides?.filter((s) => s.participantId).length === 2,
    );
    if (!next) break;
    expect(
      tournamentEngine.setMatchUpStatus({ drawId, matchUpId: next.matchUpId, outcome: { winningSide: 1 } }).success,
    ).toBe(true);
  }
  const final = all().find((m) => m.structureName === 'Main' && m.roundNumber === 4)!;
  expect(final.sides?.filter((s) => s.participantId)).toHaveLength(2);
  const draw = structuredClone(getDrawDefinition(drawId)) as DrawDefinition;
  const source = draw.structures!.flatMap((s) => matchUpsOf(s) ?? []).find((m) => m.matchUpId === final.matchUpId)!;
  const receiver = draw.structures!.find((s) => s.structureName === 'Decider')!;
  return { draw, final, source, receiver };
}

it('projects the actual winner to a vacant linked seat, and leaves the losing finalist unassigned', () => {
  const { draw, final, source, receiver } = finalReady();
  source.matchUpStatus = COMPLETED;
  source.winningSide = 2;
  const winner = final.sides!.find((s) => s.sideNumber === 2)!.participantId!;
  const loser = final.sides!.find((s) => s.sideNumber === 1)!.participantId!;
  const input = structuredClone(draw);
  const working = read(draw);
  const plan = planLinkedRepairs({ working, stage: 'missed' });
  expect(plan.ops).toMatchObject([{ op: 'assignPosition', participantId: winner, structureId: receiver.structureId }]);
  expect(draw).toStrictEqual(input);
  const reference = structuredClone(draw);
  expect(reconcileMissedLinkAdvancements({ drawDefinition: reference })?.error).toBeUndefined();
  const seats = (d: DrawDefinition) =>
    positionAssignmentsOf(d.structures!.find((s) => s.structureId === receiver.structureId))!;
  expect(seats(working.drawDefinition)).toStrictEqual(seats(reference));
  expect(seats(reference).map((s) => s.participantId)).not.toContain(loser);
  expect(planLinkedRepairs({ working, stage: 'missed' }).ops).toEqual([]);
});

it('an unearned initial position is emptied by deletion; the structural slot, unrelated seeds and other occupant stay', () => {
  const { draw, final, receiver } = finalReady();
  const original = positionAssignmentsOf(receiver)!;
  const departing = final.sides![0].participantId!;
  original[0].participantId = departing;
  original[1].participantId = 'independent-seat';
  receiver.seedAssignments = [{ participantId: departing, seedNumber: 1, seedValue: '1' }];
  const snapshot = structuredClone(draw);
  const working = read(draw);
  const plan = planLinkedRepairs({ working, stage: 'unearned' });
  expect(plan.error).toBeUndefined();
  expect(plan.ops).toEqual([
    {
      op: 'relabelPosition',
      structureId: receiver.structureId,
      drawPosition: original[0].drawPosition,
      participantId: undefined,
    },
  ]);
  expect(draw).toStrictEqual(snapshot);
  const after = working.drawDefinition.structures!.find((s) => s.structureId === receiver.structureId)!;
  const reference = structuredClone(draw);
  expect(reconcileLinkAdvancements({ drawDefinition: reference })?.error).toBeUndefined();
  expect(positionAssignmentsOf(after)).toStrictEqual(
    positionAssignmentsOf(reference.structures!.find((s) => s.structureId === receiver.structureId)),
  );
  expect(after.seedAssignments).toStrictEqual(receiver.seedAssignments);
  expect(Object.hasOwn(positionAssignmentsOf(after)![0], 'participantId')).toBe(false);
  expect(planLinkedRepairs({ working, stage: 'unearned' }).ops).toEqual([]);
});

it('a played-on linked holder leaves an outstanding inconsistency but the no-progress pass succeeds', () => {
  const { draw, final, receiver } = finalReady();
  positionAssignmentsOf(receiver)![0].participantId = final.sides![0].participantId;
  const holder = matchUpsOf(receiver)![0];
  holder.matchUpStatus = COMPLETED;
  holder.winningSide = 1;
  const working = read(draw);
  expect(getUnearnedLinkAdvancements(working).length).toBeGreaterThan(0);
  expect(planLinkedRepairs({ working, stage: 'unearned' })).toEqual({ ops: [], reasons: [] });
  const before = structuredClone(draw);
  expect(reconcileLinkAdvancements({ drawDefinition: draw })?.error).toBeUndefined();
  expect(draw).toStrictEqual(before);
});

it('returns a displaced carrier’s exit to the highest earlier holder; a standing position and a changed source retain their state', () => {
  const config = {
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: true,
    participantsCount: 4,
    drawSize: 8,
    seed: 21157227,
  };
  expect(prepareDraw(config, drawId)).toBe(true);
  const at = (round: number, position: number) =>
    tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find((m) => m.structureName === 'Main' && m.roundNumber === round && m.roundPosition === position)!;
  for (const [pos, outcome] of [
    [1, { matchUpStatus: DOUBLE_DEFAULT }],
    [2, { matchUpStatus: WALKOVER, winningSide: 1 }],
  ] as const)
    expect(
      tournamentEngine.setMatchUpStatus({ drawId, matchUpId: at(2, pos).matchUpId, outcome, propagateExitStatus: true })
        .success,
    ).toBe(true);
  const before = structuredClone(getDrawDefinition(drawId)) as DrawDefinition;
  const from = at(4, 1),
    home = at(2, 2);
  const side = home.sides!.find((s) => s.sideNumber !== home.winningSide)!;
  const inputs = { before, affectedMatchUpIds: [from.matchUpId] };
  expect(planReturningCarries({ ...inputs, working: read(before) }).ops).toEqual([]);
  const cursor = structuredClone(before);
  const stored = cursor.structures!.flatMap((s) => matchUpsOf(s) ?? []);
  const landing = stored.find((m) => m.matchUpId === from.matchUpId)!;
  landing.drawPositions = landing.drawPositions!.filter((p) => p !== side.drawPosition);
  const projection = planReturningCarries({ ...inputs, working: read(cursor) });
  const expected = {
    op: 'mergeSideExitProvenance',
    matchUpId: home.matchUpId,
    provenance: {
      [side.sideNumber!]: { sourceMatchUpId: home.matchUpId, previousMatchUpStatus: WALKOVER, matchUpStatus: WALKOVER },
    },
  };
  expect(projection.ops).toEqual([expected]);
  expect(
    tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId: at(2, 1).matchUpId,
      outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
      propagateExitStatus: true,
    }).success,
  ).toBe(true);
  expect(at(2, 2).sideExitProvenance).toStrictEqual(expected.provenance);
  stored.find((m) => m.matchUpId === home.matchUpId)!.matchUpStatus = COMPLETED;
  expect(planReturningCarries({ ...inputs, working: read(cursor) }).ops).toEqual([]);
});

it('retains a structural BYE advancement across the link when the source has no scored winner', () => {
  const { draw, final, source, receiver } = finalReady();
  positionAssignmentsOf(receiver)![0].participantId = final.sides![0].participantId;
  source.matchUpStatus = 'BYE';
  const working = read(draw);
  expect(getUnearnedLinkAdvancements(working)).toEqual([]);
  expect(planLinkedRepairs({ working, stage: 'unearned' })).toEqual({ ops: [], reasons: [] });
  const before = structuredClone(draw);
  expect(reconcileLinkAdvancements({ drawDefinition: draw })?.error).toBeUndefined();
  expect(draw).toStrictEqual(before);
});
