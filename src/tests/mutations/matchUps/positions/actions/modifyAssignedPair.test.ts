import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { instanceCount } from '@Tools/arrays';
import { expect, test } from 'vitest';

// constants
import { INVALID_VALUES, MISSING_EVENT, MISSING_PARTICIPANT_ID } from '@Constants/errorConditionConstants';
import { DIRECT_ACCEPTANCE, UNGROUPED } from '@Constants/entryStatusConstants';
import { MODIFY_PAIR_ASSIGNMENT } from '@Constants/positionActionConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DOUBLES_EVENT } from '@Constants/eventConstants';

test('postionAction for replacing participant within PAIR', () => {
  const participantsCount = 10;
  const drawSize = 8;

  const {
    tournamentRecord,
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount, participantType: PAIR },
    drawProfiles: [{ drawSize, eventType: DOUBLES_EVENT }],
  });

  tournamentEngine.setState(tournamentRecord);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });

  const enteredParticipantIds = drawDefinition.entries.map(({ participantId }) => participantId);
  const enteredIndividualParticipantIds = tournamentRecord.participants
    .filter(({ participantId }) => enteredParticipantIds.includes(participantId))
    .map(({ individualParticipantIds }) => individualParticipantIds)
    .flat();
  const individualParticipantsToAdd = tournamentRecord.participants
    .filter(
      ({ participantId, participantType }) =>
        participantType === INDIVIDUAL && !enteredIndividualParticipantIds.includes(participantId),
    )
    .map(({ participantId }) => participantId);

  let result = tournamentEngine.addEventEntries({
    participantIds: individualParticipantsToAdd,
    entryStatus: UNGROUPED,
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(4);

  let { event } = tournamentEngine.getEvent({ eventId });
  const eventEntries = event.entries;
  expect(instanceCount(eventEntries.map(({ entryStatus }) => entryStatus))).toEqual({
    DIRECT_ACCEPTANCE: 8,
    UNGROUPED: 4,
  });
  expect(eventEntries.length).toEqual(12);

  const { flightProfile } = tournamentEngine.getFlightProfile({ eventId });
  const flight = flightProfile.flights.find((flight) => flight.drawId === drawId);
  const drawEntries = drawDefinition.entries;
  expect(flight.drawEntries.length).toEqual(8);
  expect(drawEntries.length).toEqual(8);

  const structureId = drawDefinition.structures[0].structureId;

  const drawPosition = 1;
  result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isActiveDrawPosition).toEqual(false);
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(false);

  const validActions = result.validActions.map(({ type }) => type);
  expect(validActions.includes(MODIFY_PAIR_ASSIGNMENT)).toEqual(true);

  const modifyAction = result.validActions.find(({ type }) => type === MODIFY_PAIR_ASSIGNMENT);
  const existingIndividualParticipantId = modifyAction.existingIndividualParticipantIds[0];
  const replacementIndividualParticipantId = modifyAction.availableIndividualParticipantIds[0];

  const params = {
    ...modifyAction.payload,
    existingIndividualParticipantId,
    replacementIndividualParticipantId,
  };

  result = tournamentEngine[modifyAction.method](params);
  expect(result.success).toEqual(true);
  expect(result.newPairParticipantId).not.toBeUndefined();

  ({ event, drawDefinition } = tournamentEngine.getEvent({ drawId }));

  const eventEnteredParticipantIds = event.entries.map(({ participantId }) => participantId);
  expect(eventEnteredParticipantIds.includes(existingIndividualParticipantId)).toEqual(true);
  expect(eventEnteredParticipantIds.includes(replacementIndividualParticipantId)).toEqual(false);

  const positionAssignments = drawDefinition.structures[0].positionAssignments;
  const drawPositionAssignment = positionAssignments.find((assignment) => assignment.drawPosition === drawPosition);
  expect(drawPositionAssignment.participantId).toEqual(result.newPairParticipantId);

  ({ event } = tournamentEngine.getEvent({ drawId }));

  const pairParticipantId = event.entries.find(({ entryStatus }) => entryStatus === DIRECT_ACCEPTANCE).participantId;
  const pairParticipant = tournamentEngine.getParticipants({
    participantFilters: { participantIds: [pairParticipantId] },
  }).participants[0];

  const availableIndividualParticipantIds =
    event?.entries
      ?.filter(({ entryStatus }) => [UNGROUPED].includes(entryStatus))
      .map(({ participantId }) => participantId) || [];

  result = tournamentEngine.modifyPairAssignment({
    replacementIndividualParticipantId: availableIndividualParticipantIds[0],
    participantId: pairParticipantId,
    eventId,
  });
  expect(result.error).toEqual(MISSING_PARTICIPANT_ID);

  result = tournamentEngine.modifyPairAssignment({
    existingIndividualParticipantId: pairParticipant.individualParticipantIds[0],
    participantId: pairParticipantId,
    eventId,
  });
  expect(result.error).toEqual(MISSING_PARTICIPANT_ID);

  result = tournamentEngine.modifyPairAssignment({
    existingIndividualParticipantId: pairParticipant.individualParticipantIds[0],
    replacementIndividualParticipantId: availableIndividualParticipantIds[0],
    eventId,
  });
  expect(result.error).toEqual(MISSING_PARTICIPANT_ID);

  result = tournamentEngine.modifyPairAssignment({
    existingIndividualParticipantId: pairParticipant.individualParticipantIds[0],
    replacementIndividualParticipantId: availableIndividualParticipantIds[0],
    participantId: pairParticipantId,
  });
  expect(result.error).toEqual(MISSING_EVENT);

  result = tournamentEngine.modifyPairAssignment({
    existingIndividualParticipantId: pairParticipant.individualParticipantIds[0],
    replacementIndividualParticipantId: availableIndividualParticipantIds[0],
    participantId: pairParticipantId,
    uuids: 'invalid',
    eventId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.modifyPairAssignment({
    existingIndividualParticipantId: pairParticipant.individualParticipantIds[0],
    replacementIndividualParticipantId: availableIndividualParticipantIds[0],
    participantId: 5000, // invalid participantId
    eventId,
  });
  expect(result.error).toEqual(MISSING_PARTICIPANT_ID);

  result = tournamentEngine.modifyPairAssignment({
    existingIndividualParticipantId: pairParticipant.individualParticipantIds[0],
    replacementIndividualParticipantId: availableIndividualParticipantIds[0],
    participantId: pairParticipantId,
    eventId,
  });

  expect(result.success).toEqual(true);
});

test('ROUND_ROBIN postionAction for replacing participant within PAIR', () => {
  const participantsCount = 10;
  const drawSize = 8;

  const {
    tournamentRecord,
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount, participantType: PAIR },
    drawProfiles: [{ drawSize, eventType: DOUBLES_EVENT, drawType: ROUND_ROBIN }],
  });

  tournamentEngine.setState(tournamentRecord);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });

  const enteredParticipantIds = drawDefinition.entries.map(({ participantId }) => participantId);
  const enteredIndividualParticipantIds = tournamentRecord.participants
    .filter(({ participantId }) => enteredParticipantIds.includes(participantId))
    .map(({ individualParticipantIds }) => individualParticipantIds)
    .flat();
  const individualParticipantsToAdd = tournamentRecord.participants
    .filter(
      ({ participantId, participantType }) =>
        participantType === INDIVIDUAL && !enteredIndividualParticipantIds.includes(participantId),
    )
    .map(({ participantId }) => participantId);

  let result = tournamentEngine.addEventEntries({
    participantIds: individualParticipantsToAdd,
    entryStatus: UNGROUPED,
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(result.addedEntriesCount).toEqual(4);

  let { event } = tournamentEngine.getEvent({ eventId });
  const eventEntries = event.entries;
  expect(instanceCount(eventEntries.map(({ entryStatus }) => entryStatus))).toEqual({
    DIRECT_ACCEPTANCE: 8,
    UNGROUPED: 4,
  });
  expect(eventEntries.length).toEqual(12);

  const { flightProfile } = tournamentEngine.getFlightProfile({ eventId });
  const flight = flightProfile.flights.find((flight) => flight.drawId === drawId);
  const drawEntries = drawDefinition.entries;
  expect(flight.drawEntries.length).toEqual(8);
  expect(drawEntries.length).toEqual(8);

  const structureId = drawDefinition.structures[0].structureId;

  const drawPosition = 1;
  result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isActiveDrawPosition).toEqual(false);
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(false);

  const validActions = result.validActions.map(({ type }) => type);
  expect(validActions.includes(MODIFY_PAIR_ASSIGNMENT)).toEqual(true);

  const modifyAction = result.validActions.find(({ type }) => type === MODIFY_PAIR_ASSIGNMENT);
  const existingIndividualParticipantId = modifyAction.existingIndividualParticipantIds[0];
  const replacementIndividualParticipantId = modifyAction.availableIndividualParticipantIds[0];

  const params = {
    ...modifyAction.payload,
    existingIndividualParticipantId,
    replacementIndividualParticipantId,
  };

  result = tournamentEngine[modifyAction.method](params);
  expect(result.success).toEqual(true);
  expect(result.newPairParticipantId).not.toBeUndefined();

  ({ event, drawDefinition } = tournamentEngine.getEvent({ drawId }));

  const eventEnteredParticipantIds = event.entries.map(({ participantId }) => participantId);
  expect(eventEnteredParticipantIds.includes(existingIndividualParticipantId)).toEqual(true);
  expect(eventEnteredParticipantIds.includes(replacementIndividualParticipantId)).toEqual(false);

  const positionAssignments = tournamentEngine.getPositionAssignments({
    drawId,
    structureId: drawDefinition.structures[0].structureId,
  }).positionAssignments;
  const drawPositionAssignment = positionAssignments.find((assignment) => assignment.drawPosition === drawPosition);
  expect(drawPositionAssignment.participantId).toEqual(result.newPairParticipantId);

  ({ event } = tournamentEngine.getEvent({ drawId }));

  const pairParticipantId = event.entries.find(({ entryStatus }) => entryStatus === DIRECT_ACCEPTANCE).participantId;
  const pairParticipant = tournamentEngine.getParticipants({
    participantFilters: { participantIds: [pairParticipantId] },
  }).participants[0];

  const availableIndividualParticipantIds =
    event?.entries
      ?.filter(({ entryStatus }) => [UNGROUPED].includes(entryStatus))
      .map(({ participantId }) => participantId) || [];

  result = tournamentEngine.modifyPairAssignment({
    existingIndividualParticipantId: pairParticipant.individualParticipantIds[0],
    replacementIndividualParticipantId: availableIndividualParticipantIds[0],
    participantId: pairParticipantId,
    eventId,
  });

  expect(result.success).toEqual(true);
});
