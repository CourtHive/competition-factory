import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { AD_HOC, MAIN, PLAY_OFF, ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

const assignmentsOf = (drawId, structureId) =>
  tournamentEngine.getPositionAssignments({ drawId, structureId }).positionAssignments;

it.each([
  { drawType: SINGLE_ELIMINATION, drawSize: 32, participantsCount: 28, seedsCount: 8 },
  { drawType: SINGLE_ELIMINATION, drawSize: 32, participantsCount: 30 },
  { drawType: ROUND_ROBIN, drawSize: 16 },
])('re-running automated positioning on a positioned structure succeeds and changes nothing: %j', (drawProfile) => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { structureId } = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const before = assignmentsOf(drawId, structureId);
  expect(before.filter(({ participantId }) => participantId)).toHaveLength(drawProfile.participantsCount ?? 16);

  const result = tournamentEngine.automatedPositioning({ drawId, structureId });
  expect(result.error).toBeUndefined();
  expect(result.success).toEqual(true);
  expect(result.positionAssignments).toEqual(before);
  expect(assignmentsOf(drawId, structureId)).toEqual(before);
});

it('an AD_HOC playoff is not positioned: it has no drawPositions', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 16, structureOptions: { groupSize: 4 } }],
    completeAllMatchUps: true,
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { structureId } = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const result = tournamentEngine.generateAndPopulatePlayoffStructures({
    playoffGroups: [{ finishingPositions: [1], structureName: 'Ad Hoc Playoff', drawType: AD_HOC }],
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);
  const adHocStructure = result.structures.find(({ stage }) => stage === PLAY_OFF);
  expect(adHocStructure.positionAssignments ?? []).toHaveLength(0);
});
