import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MISSING_STRUCTURE_ID, QUALIFYING_CAPACITY_EXCEEDED } from '@Constants/errorConditionConstants';
import { FEED_IN, FEED_IN_CHAMPIONSHIP, MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { ASSIGN_QUALIFIER, QUALIFYING_PARTICIPANT } from '@Constants/positionActionConstants';

function setup(drawProfile) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile] });
  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructureId = drawDefinition.structures.find((s) => s.stage === MAIN).structureId;
  return { drawId, drawDefinition, mainStructureId };
}

const round = (result, roundNumber) => result.targets.find((t) => t.roundNumber === roundNumber);

it('qualifier-marked positions are reported as reserved without promising them', () => {
  const { drawId, mainStructureId, drawDefinition } = setup({ drawSize: 32, qualifiersCount: 8 });
  const result: any = tournamentEngine.getAvailableQualifyingTargets({ drawId, structureId: mainStructureId });
  expect(result.valid).toEqual(true);
  expect(result.targets.map((t) => t.roundNumber)).toEqual([1]);
  const target = round(result, 1);
  const mainStructure = drawDefinition.structures.find((s) => s.structureId === mainStructureId);
  expect(mainStructure.positionAssignments.filter((pa) => pa.qualifier).length).toEqual(8);
  const unfilled = mainStructure.positionAssignments.filter((pa) => !pa.participantId && !pa.bye).length;
  expect(target.drawPositionsCount).toEqual(32);
  expect(target.unfilledPositionsCount).toEqual(unfilled);
  // mocks reserve the positions by marking them `qualifier`; no placeholder link exists to promise them
  expect(target.qualifierPositionsCount).toEqual(8);
  expect(target.reservedQualifiers).toEqual(0);
  expect(target.promisedQualifiers).toEqual(0);
  expect(target.feedingStructures).toEqual([]);
  expect(target.structuralCapacity).toEqual(32);
  expect(target.remainingCapacity).toEqual(Math.max(0, unfilled - target.unplacedDirectEntriesCount));

  // the structure that consumes the reservation attaches
  const added: any = tournamentEngine.addQualifyingStructure({
    targetStructureId: mainStructureId,
    qualifyingPositions: 8,
    drawSize: 32,
    drawId,
  });
  expect(added.success).toEqual(true);
});

it('several qualifying structures may feed one round up to its drawPositions, and no further', () => {
  const { drawId, mainStructureId } = setup({
    qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 16, qualifyingPositions: 4 }] }],
    drawSize: 32,
  });
  let result: any = tournamentEngine.getAvailableQualifyingTargets({ drawId, structureId: mainStructureId });
  let target = round(result, 1);
  expect(target.feedingStructures).toEqual([
    expect.objectContaining({ structureName: 'Qualifying', qualifiersCount: 4, placeholder: false }),
  ]);
  expect(target.promisedQualifiers).toEqual(4);
  expect(target.structuralCapacity).toEqual(28);

  // a second qualifying into the same round
  result = tournamentEngine.addQualifyingStructure({
    structureName: 'Qualifying B',
    targetStructureId: mainStructureId,
    qualifyingPositions: 4,
    drawSize: 16,
    drawId,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.getAvailableQualifyingTargets({ drawId, structureId: mainStructureId });
  target = round(result, 1);
  expect(target.feedingStructures.map((f) => f.structureName).sort((a, b) => a.localeCompare(b))).toEqual([
    'Qualifying',
    'Qualifying B',
  ]);
  expect(target.promisedQualifiers).toEqual(8);
  expect(target.structuralCapacity).toEqual(24);

  // a third that would send 32 into 24 remaining positions is refused
  result = tournamentEngine.addQualifyingStructure({
    structureName: 'Qualifying C',
    targetStructureId: mainStructureId,
    qualifyingPositions: 32,
    drawSize: 64,
    drawId,
  });
  expect(result.error).toEqual(QUALIFYING_CAPACITY_EXCEEDED);
  expect(result.context).toEqual(
    expect.objectContaining({ qualifiersCount: 32, structuralCapacity: 24, promisedQualifiers: 8, roundNumber: 1 }),
  );
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.structures.filter((s) => s.stage === QUALIFYING).length).toEqual(2);
});

it('exactly filling the round is allowed; one more qualifier is not', () => {
  const { drawId, mainStructureId } = setup({ drawSize: 16 });
  let result: any = tournamentEngine.addQualifyingStructure({
    targetStructureId: mainStructureId,
    qualifyingPositions: 16,
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.getAvailableQualifyingTargets({ drawId, structureId: mainStructureId });
  expect(round(result, 1).structuralCapacity).toEqual(0);
  result = tournamentEngine.addQualifyingStructure({
    targetStructureId: mainStructureId,
    qualifyingPositions: 1,
    drawSize: 4,
    drawId,
  });
  expect(result.error).toEqual(QUALIFYING_CAPACITY_EXCEEDED);
});

it('a feed round of a FEED_IN main is a target and roundTarget lands on the link', () => {
  const { drawId, mainStructureId } = setup({ drawType: FEED_IN, drawSize: 12 });
  let result: any = tournamentEngine.getAvailableQualifyingTargets({ drawId, structureId: mainStructureId });
  const feedTarget = result.targets.find((t) => t.roundNumber > 1);
  expect(feedTarget).toBeDefined();
  expect(feedTarget.drawPositionsCount).toBeGreaterThan(0);
  expect(round(result, 1).drawPositionsCount + feedTarget.drawPositionsCount).toEqual(12);
  expect(round(result, 1).unplacedDirectEntriesCount).toEqual(0);

  result = tournamentEngine.addQualifyingStructure({
    qualifyingPositions: feedTarget.drawPositionsCount,
    drawSize: feedTarget.drawPositionsCount * 2,
    roundTarget: feedTarget.roundNumber,
    targetStructureId: mainStructureId,
    drawId,
  });
  expect(result.success).toEqual(true);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const link = drawDefinition.links.find((l) => l.target.structureId === mainStructureId);
  expect(link.target.roundNumber).toEqual(feedTarget.roundNumber);

  result = tournamentEngine.getAvailableQualifyingTargets({ drawId, structureId: mainStructureId });
  expect(round(result, feedTarget.roundNumber).promisedQualifiers).toEqual(feedTarget.drawPositionsCount);
  expect(round(result, feedTarget.roundNumber).structuralCapacity).toEqual(0);
  expect(round(result, 1).promisedQualifiers).toEqual(0);
});

it('a structure fed by losers offers no target', () => {
  const { drawId, drawDefinition } = setup({ drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16 });
  const consolation = drawDefinition.structures.find((s) => s.stage !== MAIN);
  const result: any = tournamentEngine.getAvailableQualifyingTargets({ drawId, structureId: consolation.structureId });
  expect(result.valid).toEqual(false);
  expect(result.targets).toEqual([]);
});

it('requires a structureId', () => {
  const { drawId } = setup({ drawSize: 8 });
  const result: any = tournamentEngine.getAvailableQualifyingTargets({ drawId });
  expect(result.error).toEqual(MISSING_STRUCTURE_ID);
});

const actionTypes = (drawId, structureId, drawPosition) =>
  tournamentEngine.positionActions({ drawId, structureId, drawPosition }).validActions.map((a) => a.type);

it('a main whose positions are all filled has no room, however much structural capacity it has', () => {
  const { drawId, mainStructureId } = setup({ drawSize: 32, participantsCount: 32 });
  let result: any = tournamentEngine.addQualifyingStructure({
    targetStructureId: mainStructureId,
    qualifyingPositions: 8,
    drawSize: 16,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getAvailableQualifyingTargets({ drawId, structureId: mainStructureId });
  let target = round(result, 1);
  expect(target.unfilledPositionsCount).toEqual(0);
  expect(target.promisedQualifiers).toEqual(8);
  expect(target.owedQualifiers).toEqual(8);
  expect(target.structuralCapacity).toEqual(24);
  expect(target.remainingCapacity).toEqual(0);

  // a filled position offers no placeholder
  expect(actionTypes(drawId, mainStructureId, 1)).not.toContain(ASSIGN_QUALIFIER);

  // freeing a position makes room for one of the 8 owed qualifiers, and the placeholder is offered
  result = tournamentEngine.removeDrawPositionAssignment({ drawId, structureId: mainStructureId, drawPosition: 1 });
  expect(result.success).toEqual(true);
  const action = tournamentEngine
    .positionActions({ drawId, structureId: mainStructureId, drawPosition: 1 })
    .validActions.find((a) => a.type === ASSIGN_QUALIFIER);
  expect(action.payload).toEqual(
    expect.objectContaining({ drawId, structureId: mainStructureId, drawPosition: 1, qualifier: true }),
  );
  result = tournamentEngine[action.method](action.payload);
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const main = drawDefinition.structures.find((s) => s.structureId === mainStructureId);
  expect(main.positionAssignments.find((pa) => pa.drawPosition === 1).qualifier).toEqual(true);
  // a marked seat is not offered again, and the removed direct entry is still waiting, so there is no room
  expect(actionTypes(drawId, mainStructureId, 1)).not.toContain(ASSIGN_QUALIFIER);
  result = tournamentEngine.getAvailableQualifyingTargets({ drawId, structureId: mainStructureId });
  target = round(result, 1);
  expect(target.qualifierPositionsCount).toEqual(1);
  expect(target.unplacedDirectEntriesCount).toEqual(1);
  expect(target.remainingCapacity).toEqual(0);
});

it('no placeholder is offered where no qualifying is owed', () => {
  // qualifier seats marked by the mocks, but no qualifying structure or placeholder link owes them
  const { drawId, mainStructureId, drawDefinition } = setup({ drawSize: 32, qualifiersCount: 8 });
  const main = drawDefinition.structures.find((s) => s.structureId === mainStructureId);
  const seat = main.positionAssignments.find((pa) => pa.qualifier).drawPosition;
  let result: any = tournamentEngine.removeDrawPositionAssignment({
    structureId: mainStructureId,
    drawPosition: seat,
    drawId,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.getAvailableQualifyingTargets({ drawId, structureId: mainStructureId });
  expect(round(result, 1).owedQualifiers).toEqual(0);
  expect(actionTypes(drawId, mainStructureId, seat)).not.toContain(ASSIGN_QUALIFIER);
});

it('placeholders are offered only up to the qualifiers still owed beyond the seats already marked', () => {
  const { drawId, mainStructureId, drawDefinition } = setup({
    qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 8, qualifyingPositions: 2 }] }],
    participantsCount: 14,
    drawSize: 16,
  });
  const main = drawDefinition.structures.find((s) => s.structureId === mainStructureId);
  const seats = main.positionAssignments.filter((pa) => pa.qualifier).map((pa) => pa.drawPosition);
  expect(seats.length).toEqual(2);
  let result: any = tournamentEngine.getAvailableQualifyingTargets({ drawId, structureId: mainStructureId });
  expect(round(result, 1).owedQualifiers).toEqual(2);
  expect(round(result, 1).remainingCapacity).toEqual(0);

  // both owed qualifiers already have a seat: a freed position is not offered a third
  const direct = main.positionAssignments.find((pa) => pa.participantId).drawPosition;
  result = tournamentEngine.removeDrawPositionAssignment({
    drawId,
    structureId: mainStructureId,
    drawPosition: direct,
  });
  expect(result.success).toEqual(true);
  expect(actionTypes(drawId, mainStructureId, direct)).not.toContain(ASSIGN_QUALIFIER);

  // clearing a seat leaves one owed qualifier without one: the freed direct position may take it
  result = tournamentEngine.removeDrawPositionAssignment({
    structureId: mainStructureId,
    drawPosition: seats[0],
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(actionTypes(drawId, mainStructureId, direct)).toContain(ASSIGN_QUALIFIER);
});

it('a placed qualifier is counted once, against the promise it fulfils', () => {
  const { drawId, mainStructureId, drawDefinition } = setup({
    qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 8, qualifyingPositions: 2 }] }],
    participantsCount: 14,
    drawSize: 16,
  });
  const qualifying = drawDefinition.structures.find((s) => s.stage === QUALIFYING);
  const outcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
  for (const roundNumber of [1, 2]) {
    const { matchUps } = tournamentEngine.allDrawMatchUps({
      matchUpFilters: { structureIds: [qualifying.structureId], roundNumbers: [roundNumber] },
      drawId,
    });
    for (const matchUp of matchUps) {
      const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, outcome, drawId });
      expect(result.success).toEqual(true);
    }
  }

  const main = drawDefinition.structures.find((s) => s.structureId === mainStructureId);
  const [seat, secondSeat] = main.positionAssignments.filter((pa) => pa.qualifier).map((pa) => pa.drawPosition);
  const placeQualifier = (drawPosition) => {
    const qualifierAction = tournamentEngine
      .positionActions({ drawId, structureId: mainStructureId, drawPosition })
      .validActions.find((a) => a.type === QUALIFYING_PARTICIPANT);
    return tournamentEngine[qualifierAction.method]({
      ...qualifierAction.payload,
      qualifyingParticipantId: qualifierAction.qualifyingParticipantIds[0],
    });
  };
  let result: any = placeQualifier(seat);
  expect(result.success).toEqual(true);

  result = tournamentEngine.getAvailableQualifyingTargets({ drawId, structureId: mainStructureId });
  let target = round(result, 1);
  expect(target.promisedQualifiers).toEqual(2);
  expect(target.placedQualifiersCount).toEqual(1);
  expect(target.owedQualifiers).toEqual(1);
  expect(target.unfilledPositionsCount).toEqual(1);
  expect(target.remainingCapacity).toEqual(0);

  // both qualifiers placed, then a direct entrant withdrawn: the freed position is real room. Counting the
  // placed qualifiers again against the promise would report 1 - 2, i.e. none.
  result = placeQualifier(secondSeat);
  expect(result.success).toEqual(true);
  const direct = main.positionAssignments.find(
    (pa) => pa.participantId && ![seat, secondSeat].includes(pa.drawPosition),
  ).drawPosition;
  result = tournamentEngine.withdrawParticipantAtDrawPosition({
    structureId: mainStructureId,
    drawPosition: direct,
    drawId,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.getAvailableQualifyingTargets({ drawId, structureId: mainStructureId });
  target = round(result, 1);
  expect(target.placedQualifiersCount).toEqual(2);
  expect(target.owedQualifiers).toEqual(0);
  expect(target.unplacedDirectEntriesCount).toEqual(0);
  expect(target.unfilledPositionsCount).toEqual(1);
  expect(target.remainingCapacity).toEqual(1);
  // nothing is owed, so the freed position is not offered as a qualifier seat
  expect(actionTypes(drawId, mainStructureId, direct)).not.toContain(ASSIGN_QUALIFIER);
});
