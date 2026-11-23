import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { MAIN } from '@Constants/drawDefinitionConstants';

test('automated positioning places no qualifiers when there are fewer free positions than qualifiers', () => {
  const drawProfiles = [
    {
      qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 8, qualifyingPositions: 3 }] }],
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

  // BYEs placed by hand leave two free positions for three qualifiers
  for (const drawPosition of [1, 2, 3, 4, 5, 6]) {
    const result = tournamentEngine.assignDrawPositionBye({ drawId, structureId, drawPosition });
    expect(result.success).toEqual(true);
  }

  const result = tournamentEngine.automatedPositioning({ drawId, structureId });
  expect(result.positionAssignments).toBeUndefined();

  // the three qualifiers do not fit, so none is placed: not two of them
  const { positionAssignments } = getMain();
  expect(positionAssignments.filter((assignment) => assignment.qualifier).length).toEqual(0);
  expect(positionAssignments.filter((assignment) => !assignment.bye).map(({ drawPosition }) => drawPosition)).toEqual([
    7, 8,
  ]);
});
