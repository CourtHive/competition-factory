import { completeDrawMatchUps } from '@Assemblies/generators/mocks/completeDrawMatchUps';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { validMatchUp, validMatchUps } from '@Validators/validMatchUp';
import { intersection, unique } from '@Tools/arrays';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { expect, it, test } from 'vitest';

// constants
import { DOUBLES_EVENT, SINGLES_EVENT } from '@Constants/eventConstants';
import { ASSIGN_PARTICIPANT } from '@Constants/positionActionConstants';
import { REMOVE_PARTICIPANT } from '@Constants/matchUpActionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import {
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_STRUCTURE_ID,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

test('generateDrawDefinition can generate specified number of rounds', () => {
  const participantsCount = 28;

  const roundsCount = 3;
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        participantsProfile: { participantsCount },
        eventType: SINGLES_EVENT,
      },
    ],
    setState: true,
  });

  const event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.entries.length).toEqual(participantsCount);

  const automatedDrawDefinition = tournamentEngine.generateDrawDefinition({
    drawType: AD_HOC,
    automated: true,
    roundsCount,
    eventId,
  }).drawDefinition;
  expect(automatedDrawDefinition.entries.length).toEqual(participantsCount);

  const result = tournamentEngine.addDrawDefinition({
    drawDefinition: automatedDrawDefinition,
    eventId,
  });
  expect(result.success).toEqual(true);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toEqual((participantsCount / 2) * roundsCount);

  expect(matchUps.every(({ sides }) => sides.every(({ participant }) => participant))).toEqual(true);

  const roundResult = tournamentEngine.getRoundMatchUps({ matchUps });
  expect(roundResult.maxMatchUpsCount).toEqual(participantsCount / 2);
  expect(roundResult.roundsNotPowerOf2).toEqual(true);
  expect(roundResult.hasNoRoundPositions).toEqual(true);
  expect(roundResult.roundNumbers).toEqual([1, 2, 3]);
});

test('adHoc matchUpActions can restrict adHoc round participants to diallow recurrence in the same round', () => {
  tournamentEngine.devContext(true);
  const participantsCount = 28;

  const policyDefinitions = {
    [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false },
  };
  const roundsCount = 3;
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount }, eventType: SINGLES_EVENT }],
    policyDefinitions,
  });

  tournamentEngine.setState(tournamentRecord);

  const event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.entries.length).toEqual(participantsCount);

  // generating AD_HOC without { automated: true } will not place participants
  const manualDrawDefinition = tournamentEngine.generateDrawDefinition({
    automated: false,
    drawType: AD_HOC,
    roundsCount,
    eventId,
  }).drawDefinition;
  expect(manualDrawDefinition.entries.length).toEqual(participantsCount);

  const result = tournamentEngine.addDrawDefinition({
    drawDefinition: manualDrawDefinition,
    eventId,
  });
  expect(result.success).toEqual(true);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toEqual((participantsCount / 2) * roundsCount);

  expect(matchUps.every((matchUp: any) => matchUp.sides?.every(({ participant }) => !participant))).toEqual(true);

  let validActions = tournamentEngine.positionActions({
    ...matchUps[0],
    sideNumber: 1,
  }).validActions;

  expect(validActions.map(xa('type')).includes(ASSIGN_PARTICIPANT)).toBeTruthy();

  let assignAction = validActions.find((action) => action.type === ASSIGN_PARTICIPANT);

  const availableParticipantIds = assignAction.availableParticipantIds;
  expect(availableParticipantIds.length).toEqual(participantsCount);

  let targetParticipantId = availableParticipantIds[0];
  let payload = {
    ...assignAction.payload,
    participantId: targetParticipantId,
  };

  let assignResult = tournamentEngine[assignAction.method](payload);
  expect(assignResult.success).toEqual(true);

  validActions = tournamentEngine.positionActions({
    ...matchUps[1],
    sideNumber: 1,
  }).validActions;
  assignAction = validActions.find((action) => action.type === ASSIGN_PARTICIPANT);
  expect(assignAction.availableParticipantIds.includes(targetParticipantId)).toEqual(false);

  // possible to override default setting
  validActions = tournamentEngine.positionActions({
    restrictAdHocRoundParticipants: false,
    ...matchUps[1],
    sideNumber: 1,
  }).validActions;
  assignAction = validActions.find((action) => action.type === ASSIGN_PARTICIPANT);
  expect(assignAction.availableParticipantIds.includes(targetParticipantId)).toEqual(true);

  validActions = tournamentEngine.positionActions({
    ...matchUps[0],
    sideNumber: 2,
  }).validActions;

  targetParticipantId = availableParticipantIds[0];
  assignAction = validActions.find((action) => action.type === ASSIGN_PARTICIPANT);
  payload = {
    ...assignAction.payload,
    participantId: targetParticipantId,
  };

  assignResult = tournamentEngine[assignAction.method](payload);
  expect(assignResult.success).toEqual(true);

  const targetMatchUp = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((matchUp) => matchUp.matchUpId === matchUps[0].matchUpId);

  expect(targetMatchUp.sides.map(xa('participantId')).filter(Boolean).length).toEqual(2);

  validActions = tournamentEngine.positionActions({
    ...matchUps[0],
    sideNumber: 1,
  }).validActions;

  const removeParticiapntAction = validActions.find(({ type }) => type === REMOVE_PARTICIPANT);
  expect(removeParticiapntAction).not.toBeUndefined();
  const removeResult = tournamentEngine[removeParticiapntAction.method](removeParticiapntAction.payload);
  expect(removeResult.success).toEqual(true);

  const modifiedMatchUp = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((matchUp) => matchUp.matchUpId === matchUps[0].matchUpId);

  // confirm that participantId has been removed from { sideNumbe: 1 }
  expect(modifiedMatchUp.sides.find(({ sideNumber }) => sideNumber === 1).participantId).toBeUndefined();

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  });

  const drawId = manualDrawDefinition.drawId;
  const scoringResult = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(scoringResult.success).toEqual(true);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const tally = firstClassOrExtension({
    element: drawDefinition.structures[0].positionAssignments[0],
    attribute: 'tally',
    name: 'tally',
  });
  expect(tally.gamesWon).toEqual(10);
});

it('can remove adHoc rounds', () => {
  const participantsCount = 28;

  const roundsCount = 3;
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        participantsProfile: { participantsCount },
        eventType: SINGLES_EVENT,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.entries.length).toEqual(participantsCount);

  const automatedDrawDefinition = tournamentEngine.generateDrawDefinition({
    drawType: AD_HOC,
    automated: true,
    roundsCount,
    eventId,
  }).drawDefinition;
  expect(automatedDrawDefinition.entries.length).toEqual(participantsCount);

  let result = tournamentEngine.addDrawDefinition({
    drawDefinition: automatedDrawDefinition,
    eventId,
  });
  expect(result.success).toEqual(true);

  let structureId = automatedDrawDefinition.structures[0].structureId;
  let drawId = automatedDrawDefinition.drawId;
  let removeResult = tournamentEngine.removeRoundMatchUps();
  expect(removeResult.error).toEqual(MISSING_DRAW_DEFINITION);
  removeResult = tournamentEngine.removeRoundMatchUps({ drawId });
  expect(removeResult.error).toEqual(MISSING_VALUE);
  removeResult = tournamentEngine.removeRoundMatchUps({ drawId, structureId });
  expect(removeResult.error).toEqual(MISSING_VALUE);
  removeResult = tournamentEngine.removeRoundMatchUps({
    roundNumber: 1,
    drawId,
  });
  expect(removeResult.error).toEqual(MISSING_STRUCTURE_ID);
  removeResult = tournamentEngine.removeRoundMatchUps({
    roundNumber: 2,
    structureId,
    drawId,
  });
  expect(removeResult.success).toEqual(true);
  expect(removeResult.deletedMatchUpsCount).toEqual(participantsCount / 2);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const roundNumbers = unique(matchUps.map(xa('roundNumber')));
  expect(roundNumbers).toEqual([1, 2]);

  const completedDrawDefinition = tournamentEngine.generateDrawDefinition({
    drawType: AD_HOC,
    automated: true,
    roundsCount,
    eventId,
  }).drawDefinition;
  expect(completedDrawDefinition.entries.length).toEqual(participantsCount);
  const completionResult = completeDrawMatchUps({
    drawDefinition: completedDrawDefinition,
  });
  expect(completionResult.success).toEqual(true);
  expect(completionResult.completedCount).toEqual((participantsCount / 2) * roundsCount);

  result = tournamentEngine.addDrawDefinition({
    drawDefinition: completedDrawDefinition,
    eventId,
  });
  expect(result.success).toEqual(true);

  structureId = completedDrawDefinition.structures[0].structureId;
  drawId = completedDrawDefinition.drawId;
  removeResult = tournamentEngine.removeRoundMatchUps({
    roundNumber: 3,
    structureId,
    drawId,
  });
  expect(removeResult.deletedMatchUpsCount).toEqual(0);
  expect(removeResult.roundRemoved).toEqual(false);

  removeResult = tournamentEngine.removeRoundMatchUps({
    removeCompletedMatchUps: true,
    roundNumber: 3,
    structureId,
    drawId,
  });
  expect(removeResult.deletedMatchUpsCount).toEqual(14);
  expect(removeResult.roundRemoved).toEqual(true);
});

it('can add matchUps to an existing adHoc round', () => {
  const participantsCount = 18;

  const roundsCount = 2;
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        participantsProfile: { participantsCount },
        eventType: DOUBLES_EVENT,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.entries.length).toEqual(participantsCount);

  const automatedDrawDefinition = tournamentEngine.generateDrawDefinition({
    drawType: AD_HOC,
    automated: true,
    roundsCount,
    eventId,
  }).drawDefinition;
  expect(automatedDrawDefinition.entries.length).toEqual(participantsCount);

  const result = tournamentEngine.addDrawDefinition({
    drawDefinition: automatedDrawDefinition,
    eventId,
  });
  expect(result.success).toEqual(true);

  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toEqual((participantsCount / 2) * roundsCount);
  expect(validMatchUp(matchUps[0])).toEqual(true);
  expect(validMatchUps(matchUps)).toEqual(true);

  expect(matchUps[0].sides[0].participant.individualParticipants.length).toEqual(2);

  const drawId = automatedDrawDefinition.drawId;
  let generationResult = tournamentEngine.generateAdHocMatchUps();
  expect(generationResult.error).toEqual(MISSING_DRAW_DEFINITION);
  generationResult = tournamentEngine.generateAdHocMatchUps({ drawId });
  expect(generationResult.error).toEqual(INVALID_VALUES);

  // -----------------------------------------------------------------------
  // TEST when no matchUpsCount is provided; matchUps not added to structure
  generationResult = tournamentEngine.generateAdHocMatchUps({
    roundNumber: 3,
    drawId,
  });
  expect(generationResult.matchUps.length).toEqual(participantsCount / 2);
  // -----------------------------------------------------------------------

  generationResult = tournamentEngine.generateAdHocMatchUps({
    matchUpsCount: 4,
    drawId,
  });
  expect(generationResult.matchUps.length).toEqual(4);
  // expect the matchUps to be generated for the current roundNumber, which is 2
  expect(generationResult.matchUps[0].roundNumber).toEqual(2);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  // no matchUps were added
  expect(matchUps.length).toEqual((participantsCount / 2) * roundsCount);

  let addMatchUpsResult = tournamentEngine.addAdHocMatchUps({ matchUps });
  expect(addMatchUpsResult.error).toEqual(MISSING_DRAW_DEFINITION);
  addMatchUpsResult = tournamentEngine.addAdHocMatchUps({
    matchUps: generationResult.matchUps,
    drawId,
  });
  expect(addMatchUpsResult.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toEqual((participantsCount / 2) * roundsCount + 4);
  const structureId = matchUps[0].structureId;

  generationResult = tournamentEngine.generateAdHocMatchUps({
    matchUpsCount: 4,
    newRound: true,
    drawId,
  });
  expect(generationResult.matchUps.length).toEqual(4);
  expect(generationResult.matchUps[0].roundNumber).toEqual(3);
  let addResult = tournamentEngine.addAdHocMatchUps({
    matchUps: generationResult.matchUps,
    structureId,
    drawId,
  });
  expect(addResult.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toEqual((participantsCount / 2) * roundsCount + 8);

  generationResult = tournamentEngine.generateAdHocMatchUps({
    matchUpsCount: 4,
    roundNumber: 2,
    drawId,
  });
  expect(generationResult.matchUps[0].roundNumber).toEqual(2);

  addResult = tournamentEngine.addAdHocMatchUps({
    matchUps: generationResult.matchUps,
    structureId,
    drawId,
  });
  expect(addResult.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toEqual((participantsCount / 2) * roundsCount + 12);

  const firstRoundMatchUp = matchUps.find(({ roundNumber }) => roundNumber === 1);
  const secondRoundMatchUp = matchUps.find(({ roundNumber }) => roundNumber === 2);
  const thirdRoundMatchUp = matchUps.find(({ roundNumber }) => roundNumber === 3);

  const beforeMatchUpsCount = matchUps.length;
  const matchUpIds = [firstRoundMatchUp.matchUpId, secondRoundMatchUp.matchUpId, thirdRoundMatchUp.matchUpId];

  let deletionResult = tournamentEngine.deleteAdHocMatchUps({
    structureId,
    matchUpIds,
    drawId,
  });
  expect(deletionResult.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const afterMatchUpsCount = matchUps.length;
  expect(afterMatchUpsCount).toEqual(beforeMatchUpsCount - matchUpIds.length);

  const roundTwoMatchUpIds = matchUps.filter(({ roundNumber }) => roundNumber === 2).map(xa('matchUpId'));

  deletionResult = tournamentEngine.deleteAdHocMatchUps({
    matchUpIds: roundTwoMatchUpIds,
    structureId,
    drawId,
  });
  expect(deletionResult.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const finalMatchUpIds = matchUps.map(xa('matchUpId'));
  expect(intersection(finalMatchUpIds, roundTwoMatchUpIds).length).toEqual(0);
  expect(matchUps.length).toEqual(afterMatchUpsCount - roundTwoMatchUpIds.length);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const roundNumbers = unique(matchUps.map(xa('roundNumber')));
  // all { roundNumber: 3 } matchUps were re-numbered
  expect(roundNumbers).toEqual([1, 2]);

  const roundOneMatchUpIds = matchUps.filter(({ roundNumber }) => roundNumber === 1).map(xa('matchUpId'));
  const halfOfRoundOneMatchUpIds = roundOneMatchUpIds.slice(0, roundOneMatchUpIds.length / 2);

  deletionResult = tournamentEngine.deleteAdHocMatchUps({
    matchUpIds: halfOfRoundOneMatchUpIds,
    structureId,
    drawId,
  });
  expect(deletionResult.success).toEqual(true);

  // TEST when no matchUpsCount is provided; auto-calculate number to add
  generationResult = tournamentEngine.generateAdHocMatchUps({
    roundNumber: 1,
    drawId,
  });
  // a total of 5 matchUps were previously deleted
  // [firstRoundMatchUp.matchUpId, ...halfOfRoundOneMatchUpIds]
  expect(generationResult.matchUps.length).toEqual(5);
});

test('adHoc matchUps can be deleted by roundNumber', () => {
  const roundsCount = 3;
  const drawSize = 16;
  const drawId = 'adHoc';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: AD_HOC,
        automated: true,
        roundsCount,
        drawSize,
        drawId,
      },
    ],
    setState: true,
  });

  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toEqual((drawSize / 2) * roundsCount);

  const deletionResult = tournamentEngine.deleteAdHocMatchUps({ roundNumbers: [2], drawId });
  expect(deletionResult.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toEqual((drawSize / 2) * (roundsCount - 1));

  const roundNumbers = unique(matchUps.map(xa('roundNumber')));
  expect(roundNumbers).toEqual([1, 2]); // round 3 was renamed to round 2

  let generationResult = tournamentEngine.drawMatic({ drawId });
  expect(generationResult.success).toEqual(true);
  expect(generationResult.matchUps.length).toEqual(drawSize / 2);
  expect(generationResult.roundResults[0].roundNumber).toEqual(3);
  const addResult = tournamentEngine.addAdHocMatchUps({
    matchUps: generationResult.matchUps,
    drawId,
  });
  expect(addResult.success).toEqual(true);

  generationResult = tournamentEngine.drawMatic({ drawId, roundsCount: 2, dynamicRatings: true });
  expect(generationResult.success).toEqual(true);
  expect(generationResult.roundResults.length).toEqual(2);
  expect(generationResult.roundResults[1].roundNumber).toEqual(5);
});
