import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

test('setPositionAssignments places a qualifier in the structure', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4, automated: false }], setState: true });

  const { structureId } = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];
  const positionAssignments = [
    { drawPosition: 1, qualifier: true },
    { drawPosition: 2 },
    { drawPosition: 3 },
    { drawPosition: 4 },
  ];

  const result = tournamentEngine.setPositionAssignments({
    structurePositionAssignments: [{ structureId, positionAssignments }],
    drawId,
  });
  expect(result.success).toEqual(true);

  const structure = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];
  const qualifierPositions = structure.positionAssignments
    .filter((assignment) => assignment.qualifier)
    .map(({ drawPosition }) => drawPosition);
  expect(qualifierPositions).toEqual([1]);
});
