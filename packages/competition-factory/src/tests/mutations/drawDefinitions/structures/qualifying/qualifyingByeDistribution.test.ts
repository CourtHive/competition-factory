import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { chunkArray } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { QUALIFYING } from '@Constants/drawDefinitionConstants';

it('places BYEs reasonably in qualifying structures', () => {
  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        ignoreDefaults: true,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [
              {
                qualifyingPositions: 2,
                participantsCount: 11,
                stageSequence: 1,
                drawSize: 16,
              },
            ],
          },
        ],
      },
    ],
  });

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = result;

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    structure: qualifyingStructure,
  });

  const doubleByeChunks = chunkArray(positionAssignments, 2).filter((chunk) => chunk.every(({ bye }) => bye));

  expect(doubleByeChunks.length).toEqual(0);
});
