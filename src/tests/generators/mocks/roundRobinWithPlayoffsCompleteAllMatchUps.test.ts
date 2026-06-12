import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { instanceCount } from '@Tools/arrays';
import { expect, it } from 'vitest';

import { MAIN, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { SINGLES } from '@Constants/eventConstants';

it('can complete matchUps in playoff structures', () => {
  const structureOptions = { groupSize: 5 };
  let { matchUps } = generateScenario({
    structureOptions,
    drawSize: 20,
  });

  const matchUpStatuses = matchUps.map(({ matchUpStatus }) => matchUpStatus);
  expect(instanceCount(matchUpStatuses)[COMPLETED]).toEqual(matchUps.length);

  // get matchUps that are in the Round Robin
  // in this scenario those are MAIN stage; they could also be found by filtering for no roundPosition
  ({ matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [MAIN] },
  }));

  const targetMatchUp = matchUps[0];
  const { drawId, matchUpId } = targetMatchUp;
  const winningSide = 3 - targetMatchUp.winningSide;

  // generate an outcome that changes the winning side
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide,
  });

  const result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });

  expect(result.connectedStructures).toEqual(true);

  const {
    eventData: { drawsData },
  } = tournamentEngine.getEventData({
    includePositionAssignments: true,
    drawId,
  });
  expect(drawsData[0].structures.filter(({ positionAssignments }) => positionAssignments).length).toEqual(2);
});

function generateScenario({ drawSize, structureOptions }) {
  const drawProfiles = [
    {
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      matchUpFormat: FORMAT_STANDARD,
      participantsCount: drawSize,
      eventType: SINGLES,
      structureOptions,
      drawSize,
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    drawProfiles,
  });

  const { drawDefinition } = tournamentEngine.setState(tournamentRecord).getEvent({ drawId });
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  return { drawDefinition, matchUps };
}
