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
import { getOutcomePipeline, setOutcomePipeline } from '@Global/state/globalState';
import type { DrawDefinition } from '@Types/tournamentTypes';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, beforeEach, expect, it } from 'vitest';

let entryPipeline: ReturnType<typeof getOutcomePipeline>;
beforeEach(() => {
  entryPipeline = getOutcomePipeline();
});
afterEach(() => {
  setOutcomePipeline(entryPipeline);
});

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
  const replaced = structuredClone(cursor);
  const main = replaced.structures!.find((s) => s.structureName === 'Main')!;
  positionAssignmentsOf(main)!.find((seat) => seat.drawPosition === side.drawPosition)!.participantId = 'replacement';
  expect(planReturningCarries({ ...inputs, working: read(replaced) })).toEqual({
    ops: [],
    reasons: ['returning carry requires another landing or changed occupant'],
  });
  const missing = structuredClone(cursor);
  const matches = matchUpsOf(missing.structures!.find((s) => s.structureName === 'Main'))!;
  matches.splice(
    matches.findIndex((m) => m.matchUpId === from.matchUpId),
    1,
  );
  expect(planReturningCarries({ ...inputs, working: read(missing) })).toEqual({ ops: [], reasons: [] });
  const producedOnly = structuredClone(before);
  const origin = matchUpsOf(producedOnly.structures!.find((s) => s.structureName === 'Main'))!.find(
    (m) => m.matchUpId === from.matchUpId,
  )!;
  origin.sideExitProvenance = {
    [side.sideNumber!]: {
      sourceMatchUpId: home.matchUpId,
      previousMatchUpStatus: DOUBLE_DEFAULT,
      matchUpStatus: 'DEFAULTED',
    },
  };
  expect(planReturningCarries({ ...inputs, before: producedOnly, working: read(cursor) })).toEqual({
    ops: [],
    reasons: [],
  });
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

function backdrawFeed() {
  const { draw, final, source: mainFinal } = finalReady();
  const main = draw.structures!.find((s) => s.structureName === 'Main')!;
  const back = draw.structures!.find((s) => s.structureName === 'Backdraw')!;
  const donor = matchUpsOf(back)!.find((m) => m.roundNumber === 4)!;
  const hydrated = read(draw).inContextDrawMatchUps.find((m) => m.matchUpId === donor.matchUpId)!;
  const champion = hydrated.sides!.find((s) => s.sideNumber === hydrated.winningSide)?.participantId;
  expect(champion).toBeTruthy();
  const position = final.sides!.find((s) => s.participantId === champion)!.drawPosition!;
  expect(mainFinal.drawPositions).toContain(position);
  return { draw, main, mainFinal, donor, position };
}

it('restores the Backdraw champion to the vacant Main final by their existing Main position', () => {
  const { draw, mainFinal, position } = backdrawFeed();
  const full = [...mainFinal.drawPositions!];
  mainFinal.drawPositions = full.filter((p) => p !== position);
  const working = read(draw);
  expect(planLinkedRepairs({ working, stage: 'missed' }).ops).toEqual([
    { op: 'setMatchUpDrawPositions', matchUpId: mainFinal.matchUpId, drawPositions: full },
  ]);
  const reference = structuredClone(draw);
  expect(reconcileMissedLinkAdvancements({ drawDefinition: reference })?.error).toBeUndefined();
  expect(
    matchUpsOf(reference.structures!.find((s) => s.structureName === 'Main'))!.find(
      (m) => m.matchUpId === mainFinal.matchUpId,
    )?.drawPositions,
  ).toEqual(full);
  expect(mainFinal.drawPositions).not.toContain(position);
});

it('holds a full final; the absent Backdraw champion cannot displace an unrelated seated finalist', () => {
  const { draw, main, mainFinal, position } = backdrawFeed();
  const other = positionAssignmentsOf(main)!.find(
    (s) => s.participantId && !mainFinal.drawPositions!.includes(s.drawPosition),
  )!;
  mainFinal.drawPositions = mainFinal.drawPositions!.map((p) => (p === position ? other.drawPosition : p));
  const input = structuredClone(draw);
  const working = read(draw);
  expect(planLinkedRepairs({ working, stage: 'missed' })).toEqual({
    ops: [],
    outstanding: mainFinal.matchUpId,
    reasons: ['linked missed requires compound placement: ' + mainFinal.matchUpId],
  });
  expect(working.drawDefinition).toStrictEqual(input);
});

it.each(['sole holder', 'next winner link', 'already played', 'multiple holders'] as const)(
  'withdrawal of a Backdraw award follows the actual Main final holder (%s)',
  (variant) => {
    const { draw, main, mainFinal, donor, position } = backdrawFeed();
    delete donor.winningSide;
    delete donor.score;
    donor.matchUpStatus = TO_BE_PLAYED;
    if (variant !== 'next winner link')
      draw.links = draw.links!.filter((l) => l.source.structureId !== main.structureId || l.source.roundNumber !== 4);
    if (variant === 'already played') {
      mainFinal.matchUpStatus = COMPLETED;
      mainFinal.winningSide = 1;
    }
    if (variant === 'multiple holders')
      matchUpsOf(main)!.push({ ...structuredClone(mainFinal), matchUpId: 'next-round-holder', roundNumber: 5 });
    const input = structuredClone(draw);
    const working = read(draw);
    expect(getUnearnedLinkAdvancements(working).some((d) => d.sourceMatchUp.matchUpId === donor.matchUpId)).toBe(true);
    const plan = planLinkedRepairs({ working, stage: 'unearned' });
    if (variant === 'sole holder') {
      const kept = mainFinal.drawPositions!.filter((p) => p !== position);
      expect(plan.ops).toEqual([
        {
          op: 'setMatchUpDrawPositions',
          matchUpId: mainFinal.matchUpId,
          drawPositions: kept,
          releasedDrawPosition: position,
        },
      ]);
      const reference = structuredClone(draw);
      expect(reconcileLinkAdvancements({ drawDefinition: reference })?.error).toBeUndefined();
      expect(
        matchUpsOf(reference.structures!.find((s) => s.structureId === main.structureId))!.find(
          (m) => m.matchUpId === mainFinal.matchUpId,
        )?.drawPositions,
      ).toEqual(kept);
      expect(planLinkedRepairs({ working, stage: 'unearned' }).ops).toEqual([]);
    } else {
      expect(plan.outstanding).toBe(mainFinal.matchUpId);
      expect(plan.ops).toEqual([]);
      expect(working.drawDefinition).toStrictEqual(input);
    }
    expect(draw).toStrictEqual(input);
  },
);

it.each(['seeded winner', 'decided receiver', 'no vacancies', 'winner assigned elsewhere', 'shared opening'] as const)(
  'a missed winner respects the source and target assignments (%s)',
  (variant) => {
    const { draw, final, source, receiver } = finalReady();
    source.matchUpStatus = COMPLETED;
    source.winningSide = 2;
    const winner = final.sides!.find((s) => s.sideNumber === 2)!.participantId!;
    const holder = matchUpsOf(receiver)![0];
    const seats = positionAssignmentsOf(receiver)!;
    if (variant === 'seeded winner')
      draw.structures!.find((s) => s.structureName === 'Main')!.seedAssignments = [
        { seedNumber: 1, seedValue: '1', participantId: winner },
      ];
    if (variant === 'decided receiver') {
      holder.winningSide = 1;
      holder.matchUpStatus = COMPLETED;
    }
    if (variant === 'no vacancies')
      seats.forEach((s) => {
        s.participantId = 'independent-' + s.drawPosition;
      });
    if (variant === 'shared opening')
      matchUpsOf(receiver)!.push({ ...structuredClone(holder), matchUpId: 'independent-later-holder', roundNumber: 2 });
    if (variant === 'winner assigned elsewhere') seats.push({ drawPosition: 3, participantId: winner });
    const input = structuredClone(draw);
    const working = read(draw);
    const plan = planLinkedRepairs({ working, stage: 'missed' });
    expect(plan.ops).toEqual([]);
    if (variant === 'winner assigned elsewhere') expect(plan.reasons).toEqual([]);
    else expect(plan.outstanding).toBe(holder.matchUpId);
    expect(working.drawDefinition).toStrictEqual(input);
  },
);

it('a final winner and a vacant seat in an unlinked structure create no cross-structure repair', () => {
  const { draw, source } = finalReady();
  source.winningSide = 2;
  source.matchUpStatus = COMPLETED;
  delete draw.links;
  const working = read(draw);
  for (const stage of ['missed', 'unearned'] as const)
    expect(planLinkedRepairs({ working, stage })).toEqual({ ops: [], reasons: [] });
  expect(working.work.copiedMatchUps).toBe(0);
});
