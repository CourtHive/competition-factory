import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import POLICY_POSITION_ACTIONS_UNRESTRICTED from '@Fixtures/policies/POLICY_POSITION_ACTIONS_UNRESTRICTED';
import POLICY_PROGRESSION_DEFAULT from '@Fixtures/policies/POLICY_PROGRESSION_DEFAULT';
import { COMPLETED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

it('will not allow BYE removal when there are active matchUps in connected structures', () => {
  const policyDefinitions = POLICY_POSITION_ACTIONS_UNRESTRICTED;
  const participantsCount = 14;
  const completionGoal = 5;

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, participantsCount, drawType: COMPASS, completionGoal }],
    policyDefinitions,
  });

  tournamentEngine.setState(tournamentRecord);

  let drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  let structure = drawDefinition.structures.find(({ stageSequence }) => stageSequence === 1);
  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    structure,
  });
  const assignedParticipantIds = positionAssignments.filter(({ participantId }) => participantId);
  expect(assignedParticipantIds.length).toEqual(participantsCount);

  let { matchUps: completedMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpStatuses: [COMPLETED] },
  });
  expect(completedMatchUps.length).toEqual(completionGoal);

  expect(completedMatchUps.every(({ stageSequence, roundNumber }) => roundNumber === 1 && stageSequence === 1)).toEqual(
    true,
  );

  const { matchUps: matchUpsToBePlayed } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpStatuses: [TO_BE_PLAYED] },
  });

  let targetMatchUp = matchUpsToBePlayed.find(
    ({ structureName, roundNumber, roundPosition }) =>
      structureName === 'East' && roundNumber === 1 && roundPosition === 7,
  );
  const eastStructureId = targetMatchUp.structureId;

  let result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  targetMatchUp = matchUpsToBePlayed.find(
    ({ structureName, roundNumber, roundPosition }) =>
      structureName === 'West' && roundNumber === 1 && roundPosition === 3,
  );

  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    policyDefinitions: POLICY_PROGRESSION_DEFAULT,
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  targetMatchUp = matchUpsToBePlayed.find(
    ({ structureName, roundNumber, roundPosition }) =>
      structureName === 'West' && roundNumber === 1 && roundPosition === 2,
  );
  const westStructureId = targetMatchUp.structureId;

  const outcome = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  }).outcome;
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  structure = drawDefinition.structures.find(
    ({ structureName, stageSequence }) => stageSequence === 3 && structureName === 'South',
  );
  expect(structure.positionAssignments.filter(({ participantId }) => participantId).length).toEqual(2);

  targetMatchUp = matchUpsToBePlayed.find(
    ({ structureName, roundNumber, roundPosition }) =>
      structureName === 'South' && roundNumber === 2 && roundPosition === 1,
  );
  const southStructureId = targetMatchUp.structureId;

  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  completedMatchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpStatuses: [COMPLETED, WALKOVER] },
  }).matchUps;

  // the original 5 + 3x WALKOVER + completed west
  expect(completedMatchUps.length).toEqual(9);

  // Now attempt to get positionActions for BYEs in South, West and East
  // none of those South should be removable... and the BYEs on the bottom of West, East should not be swappable, removable or replaceable

  tournamentEngine.devContext({ positionActions: true });
  result = tournamentEngine.positionActions({
    structureId: southStructureId,
    drawPosition: 4,
    drawId,
  });
  let validActionTypes = result.validActions.map(({ type }) => type);
  expect(validActionTypes.length).toEqual(0);

  result = tournamentEngine.positionActions({
    structureId: westStructureId,
    drawPosition: 8,
    drawId,
  });
  validActionTypes = result.validActions.map(({ type }) => type);
  expect(validActionTypes.length).toEqual(0);

  result = tournamentEngine.positionActions({
    structureId: eastStructureId,
    drawPosition: 15,
    drawId,
  });
  validActionTypes = result.validActions.map(({ type }) => type);
  expect(validActionTypes.length).toEqual(0);
});
