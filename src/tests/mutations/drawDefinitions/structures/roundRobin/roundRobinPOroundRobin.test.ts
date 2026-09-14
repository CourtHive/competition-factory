import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { PLAY_OFF, ROUND_ROBIN, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';

it('will generate single elimination playoff for ROUND_ROBIN when drawSize: 2', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: ROUND_ROBIN_WITH_PLAYOFF,
        drawSize: 8,
        playoffGroups: [
          {
            drawType: ROUND_ROBIN,
            finishingPositions: [1],
          },
        ],
      },
    ],
  });

  const result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const drawDefinition = tournamentEngine.getEvent({
    drawId,
  }).drawDefinition;

  const playoffStructure = drawDefinition.structures.find(({ stage }) => stage === PLAY_OFF);
  expect(playoffStructure.matchUps.length).toEqual(1);
});
