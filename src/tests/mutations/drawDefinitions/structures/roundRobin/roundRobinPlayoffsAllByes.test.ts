import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MAIN, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';

it('can handle RR playoffs which are only BYEs', () => {
  const structureOptions = {
    groupSize: 4,
    playoffGroups: [
      { finishingPositions: [1], structureName: 'Playoff 1' },
      { finishingPositions: [2], structureName: 'Playoff 2' },
      { finishingPositions: [3], structureName: 'Playoff 3' },
      { finishingPositions: [4], structureName: 'Playoff 4' },
    ],
  };
  const drawProfile = {
    drawType: ROUND_ROBIN_WITH_PLAYOFF,
    participantsCount: 9,
    structureOptions,
    drawSize: 12,
  };
  let result = mocksEngine.generateTournamentRecord({
    drawProfiles: [drawProfile],
  });

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = result;

  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const mainMatchUps = matchUps.filter(
    ({ stage, sides }) => stage === MAIN && sides.every(({ participant }) => participant),
  );
  expect(mainMatchUps.length).toEqual(9);

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  });

  for (const matchUp of mainMatchUps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.structures.length).toEqual(5);
  const structureId = drawDefinition.structures.find(({ stage }) => stage === MAIN).structureId;

  result = tournamentEngine.automatedPlayoffPositioning({
    applyPositioning: false,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const playoffStructureId = result.structurePositionAssignments[0].structureId;

  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId: playoffStructureId,
    drawId,
  });
  const assignedPositionsCount = positionAssignments.filter(
    (assignment) => assignment.participantId || assignment.bye,
  ).length;

  expect(assignedPositionsCount).toEqual(0);

  result = tournamentEngine.setPositionAssignments({
    structurePositionAssignments: result.structurePositionAssignments,
    drawId,
  });
  expect(result.success).toEqual(true);
});
