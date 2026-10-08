import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MISSING_STRUCTURE_ID, QUALIFYING_CAPACITY_EXCEEDED } from '@Constants/errorConditionConstants';
import { FEED_IN, FEED_IN_CHAMPIONSHIP, MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';

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
