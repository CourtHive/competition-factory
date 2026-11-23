import { automatedPositioning } from '@Mutate/drawDefinitions/automatedPositioning';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MAIN } from '@Constants/drawDefinitionConstants';

// a round 2 qualifier can only stand opposite a first round BYE, so those positions are scarce;
// round 1 qualifiers may take any free first round position and must not use them up
it('round 2 qualifiers are placed before round 1 qualifiers can take their positions', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        participantsCount: 24,
        automated: false,
        qualifyingProfiles: [
          { roundTarget: 1, structureProfiles: [{ drawSize: 16, qualifyingPositions: 4 }] },
          { roundTarget: 2, structureProfiles: [{ drawSize: 8, qualifyingPositions: 2 }] },
        ],
      },
    ],
    setState: true,
  });

  const getMain = () =>
    tournamentEngine.getEvent({ drawId }).drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const { structureId } = getMain();

  // BYEs at 1 and 3 send drawPositions 2 and 4 into round 2: the only round 2 qualifier positions
  for (const drawPosition of [1, 3]) {
    const result = tournamentEngine.assignDrawPositionBye({ drawId, structureId, drawPosition });
    expect(result.success).toEqual(true);
  }

  // a random source of 0 always takes the lowest free position, so round 1 qualifiers placed first
  // would take 2 and 4; the engine does not accept a random source, so the method is called directly
  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  const tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
  const result = automatedPositioning({ tournamentRecord, drawDefinition, structureId, event, random: () => 0 });
  expect(result.success).toEqual(true);

  const { positionAssignments } = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const qualifierPositions = positionAssignments
    .filter(({ qualifier }) => qualifier)
    .map(({ drawPosition }) => drawPosition);
  expect(qualifierPositions).toHaveLength(6);
  expect(qualifierPositions).toEqual(expect.arrayContaining([2, 4]));
  expect(positionAssignments.filter(({ participantId }) => participantId)).toHaveLength(24);
});
