import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { MAIN } from '@Constants/drawDefinitionConstants';

test('automated positioning places only the qualifiers not already placed', () => {
  const drawProfiles = [
    {
      qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 4, qualifyingPositions: 2 }] }],
      automated: false,
      drawSize: 8,
    },
  ];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles, setState: true });

  const getMain = () =>
    tournamentEngine.getEvent({ drawId }).drawDefinition.structures.find((structure) => structure.stage === MAIN);
  const { structureId } = getMain();

  let result: any = tournamentEngine.assignDrawPosition({ drawId, structureId, drawPosition: 1, qualifier: true });
  expect(result.success).toEqual(true);

  // one of the two qualifier positions is already placed, so only one more is placed
  result = tournamentEngine.automatedPositioning({ drawId, structureId });
  expect(result.error).toBeUndefined();
  expect(result.success).toEqual(true);

  const { positionAssignments } = getMain();
  const qualifierPositions = positionAssignments.filter((assignment) => assignment.qualifier);
  expect(qualifierPositions.length).toEqual(2);
  expect(qualifierPositions.map(({ drawPosition }) => drawPosition)).toContain(1);

  // the six direct acceptances fill the remaining six drawPositions
  const participantPositions = positionAssignments.filter((assignment) => assignment.participantId);
  expect(participantPositions.length).toEqual(6);
});
