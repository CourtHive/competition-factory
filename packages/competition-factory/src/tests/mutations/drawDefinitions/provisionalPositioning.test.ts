import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { INCOMPLETE_SOURCE_STRUCTURE } from '@Constants/errorConditionConstants';
import { ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';

test('provisional positioning is possible', () => {
  const mockProfile = {
    drawProfiles: [{ drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 16, completionGoal: 23 }],
  };

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  const matchUps = tournamentEngine.tournamentMatchUps();
  const upcomingMatchUps = matchUps.upcomingMatchUps;
  expect(upcomingMatchUps.length).toEqual(1);
  const { matchUpId, containerStructureId } = upcomingMatchUps[0];

  let result = tournamentEngine.automatedPlayoffPositioning({
    structureId: containerStructureId,
    provisionalPositioning: true,
    applyPositioning: false,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.structurePositionAssignments[0].positionAssignments.length).toEqual(4);

  // by default provisional positioning is not allowed
  result = tournamentEngine.automatedPlayoffPositioning({
    structureId: containerStructureId,
    provisionalPositioning: false,
    applyPositioning: false,
    drawId,
  });
  expect(result.error).toEqual(INCOMPLETE_SOURCE_STRUCTURE);

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  });
  result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  // applyPositioning: false
  result = tournamentEngine.automatedPlayoffPositioning({
    structureId: containerStructureId,
    applyPositioning: false,
    drawId,
  });
  expect(result.success).toEqual(true);
  // structurePositionAssignments contains values to be applied
  expect(result.structurePositionAssignments.length).toEqual(1);

  const playoffStructureId = result.structurePositionAssignments[0].structureId;

  let { positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId: playoffStructureId,
    drawId,
  });
  let assignedPositionsCount = positionAssignments.filter(
    (assignment) => assignment.participantId || assignment.bye,
  ).length;
  expect(assignedPositionsCount).toEqual(0);

  // applyPositioning: true - by default
  result = tournamentEngine.automatedPlayoffPositioning({
    structureId: containerStructureId,
    drawId,
  });
  expect(result.success).toEqual(true);
  positionAssignments = tournamentEngine.getPositionAssignments({
    structureId: playoffStructureId,
    drawId,
  }).positionAssignments;

  assignedPositionsCount = positionAssignments.filter(
    (assignment) => assignment.participantId || assignment.bye,
  ).length;
  expect(assignedPositionsCount).toEqual(4);
});

test('setPositionAssignments', () => {
  const mockProfile = {
    drawProfiles: [{ drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 16, completionGoal: 23 }],
  };

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  const matchUps = tournamentEngine.tournamentMatchUps();
  const upcomingMatchUps = matchUps.upcomingMatchUps;
  expect(upcomingMatchUps.length).toEqual(1);
  const { matchUpId, containerStructureId } = upcomingMatchUps[0];
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  });
  let result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  // applyPositioning: false
  result = tournamentEngine.automatedPlayoffPositioning({
    structureId: containerStructureId,
    applyPositioning: false,
    drawId,
  });
  expect(result.success).toEqual(true);
  // structurePositionAssignments contains values to be applied
  expect(result.structurePositionAssignments.length).toEqual(1);

  const playoffStructureId = result.structurePositionAssignments[0].structureId;

  let { positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId: playoffStructureId,
    drawId,
  });
  let assignedPositionsCount = positionAssignments.filter(
    (assignment) => assignment.participantId || assignment.bye,
  ).length;
  expect(assignedPositionsCount).toEqual(0);

  // set positionAssignments from values generated previously
  result = tournamentEngine.setPositionAssignments({
    structurePositionAssignments: result.structurePositionAssignments,
    drawId,
  });
  expect(result.success).toEqual(true);

  positionAssignments = tournamentEngine.getPositionAssignments({
    structureId: playoffStructureId,
    drawId,
  }).positionAssignments;

  assignedPositionsCount = positionAssignments.filter(
    (assignment) => assignment.participantId || assignment.bye,
  ).length;
  expect(assignedPositionsCount).toEqual(4);
});

test.each([
  { completionGoal: 23, playoffAssignmentsCount: 0 },
  { completionGoal: 24, playoffAssignmentsCount: 4 },
])(
  'round robin playoff structures are not generated if source structure is not complete',
  ({ completionGoal, playoffAssignmentsCount }) => {
    const mockProfile = {
      drawProfiles: [
        {
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          completionGoal,
          drawSize: 16,
        },
      ],
    };

    const { tournamentRecord } = mocksEngine.generateTournamentRecord(mockProfile);

    tournamentEngine.setState(tournamentRecord);

    const matchUps = tournamentEngine.tournamentMatchUps().completedMatchUps;
    expect(matchUps.length).toEqual(completionGoal);

    const assignedPositionsCount =
      tournamentRecord.events[0].drawDefinitions[0].structures[1].positionAssignments.filter(
        (assignment) => assignment.participantId || assignment.bye,
      ).length;

    expect(assignedPositionsCount).toEqual(playoffAssignmentsCount);
  },
);
