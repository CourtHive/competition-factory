import { generateTeamTournament } from './generateTestTeamTournament';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { setDevContext } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { REMOVE_ASSIGNMENT } from '@Constants/positionActionConstants';
import { BYE, COMPLETED } from '@Constants/matchUpStatusConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { SINGLES, TEAM } from '@Constants/matchUpTypes';

const getMatchUp = (id, inContext?) => {
  const {
    matchUps: [matchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [id] },
    inContext,
  });
  return matchUp;
};

test('positionActions work when team score is 0-0', () => {
  const { tournamentRecord } = generateTeamTournament({
    drawSize: 8,
    singlesCount: 3,
    doublesCount: 0,
    valueGoal: 2,
  });

  tournamentEngine.setState(tournamentRecord);

  const {
    matchUps: [firstDualMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
  });

  const { drawId, structureId } = firstDualMatchUp;

  let result = tournamentEngine.positionActions({
    drawPosition: 1,
    structureId,
    drawId,
  });
  let validActions = result.validActions.map(({ type }) => type);
  expect(validActions.includes('SWAP')).toEqual(true);

  // generate outcome to be applied to each first round singles matchUp
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
    winningSide: 1,
  });

  processOutcome({
    dualMatchUp: firstDualMatchUp,
    expectedScore: '3-0',
    outcome,
  });

  result = tournamentEngine.positionActions({
    drawPosition: 1,
    structureId,
    drawId,
  });
  validActions = result.validActions.map(({ type }) => type);
  expect(validActions.includes('SWAP')).toEqual(false);

  // remove outcome
  processOutcome({
    dualMatchUp: firstDualMatchUp,
    expectedScore: '0-0',
    outcome: toBePlayed,
  });

  setDevContext({ positionActions: true });

  result = tournamentEngine.positionActions({
    drawPosition: 1,
    structureId,
    drawId,
  });
  validActions = result.validActions.map(({ type }) => type);
  expect(validActions.includes('SWAP')).toEqual(true);
});

function processOutcome({ dualMatchUp, outcome, expectedScore }) {
  const singlesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES);
  const { drawId } = dualMatchUp;
  singlesMatchUps.forEach((singlesMatchUp) => {
    const { matchUpId } = singlesMatchUp;
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  });
  const updatedDualMatchUp = getMatchUp(dualMatchUp.matchUpId);
  const {
    score: { scoreStringSide1 },
  } = updatedDualMatchUp;

  expect(scoreStringSide1).toEqual(expectedScore);
}

test('BYEs can be placed in TEAM RR', () => {
  const mockProfile = {
    drawProfiles: [{ eventType: TEAM, drawSize: 8, drawType: ROUND_ROBIN }],
  };
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  const matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM] },
  }).matchUps;

  expect(matchUps.length).toEqual(12);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structureId = drawDefinition.structures[0].structureId;

  let validActions = tournamentEngine.positionActions({
    drawPosition: 2,
    structureId,
    drawId,
  }).validActions;
  let option = validActions.find((action) => action.type === REMOVE_ASSIGNMENT);
  let result = tournamentEngine[option.method](option.payload);
  expect(result.success).toEqual(true);

  let { positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId,
    drawId,
  });

  let drawPosition = positionAssignments.find((assignemnt) => !assignemnt.participantId).drawPosition;
  expect(drawPosition).toEqual(2);

  validActions = tournamentEngine.positionActions({
    drawPosition: 2,
    structureId,
    drawId,
  }).validActions;
  option = validActions.find((action) => action.type === BYE);
  result = tournamentEngine[option.method](option.payload);
  expect(result.success).toEqual(true);

  positionAssignments = tournamentEngine.getPositionAssignments({
    structureId,
    drawId,
  }).positionAssignments;

  drawPosition = positionAssignments.find((assignemnt) => assignemnt.bye).drawPosition;
  expect(drawPosition).toEqual(2);
});

test('Can generate TEAM RR with BYE', () => {
  const mockProfile = {
    drawProfiles: [
      {
        eventType: TEAM,
        drawSize: 8,
        participantsCount: 7,
        drawType: ROUND_ROBIN,
      },
    ],
  };
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  const matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM] },
  }).matchUps;

  expect(matchUps.length).toEqual(12);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structureId = drawDefinition.structures[0].structureId;
  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId,
    drawId,
  });

  const hasBye = positionAssignments.find((assignment) => assignment.bye).bye;
  expect(hasBye).toEqual(true);
});
